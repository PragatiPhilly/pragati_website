/**
 * The food line, by PARTY (spec/18).
 *
 * One scan — any pass on a booking, or a name / phone search — shows the whole
 * booking: which plates it is owed in the open meal window, how many have been
 * given, how many are left. Plates can be given some now and the rest later;
 * a later scan of ANY pass on the booking shows what is still owed.
 *
 * Storage is the existing per-ticket, per-window row (ticket_scans, unique on
 * session × ticket): a plate given = one row for one person's pass. So two
 * phones serving the same family at once can never give the same plate twice —
 * the unique index decides, and the slower phone is told the real count.
 *
 * Plates WITHOUT a pass (volunteers, performers, the purohit…) are logged in
 * meal_extras with a reason, so the window total adds up without paper coupons.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensureScanTables } from "@/lib/scans/ensure";
import { standingOf, type RegStanding } from "@/lib/coupons/rules";
import { inTodayMap, type EventDayLite } from "@/lib/checkin/daily";
import { getConfig } from "@/lib/system-config";
import {
  addPlate,
  emptyPlateCounts,
  plateChoices,
  PLATES,
  prefOf,
  type Plate,
  type PlateCounts,
} from "@/lib/food";
import { isChild, isUnder5, NO_PLATE_WHY, plateForWindow } from "./rules";

const TZ = "America/New_York";
export const clock = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });

// ── schema ───────────────────────────────────────────────────────────────

let ensured: Promise<void> | null = null;

/** meal_extras — plates given without a pass. Self-applying, like the rest. */
export function ensureFoodlineSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await ensureScanTables();
    await getDb().execute(sql`CREATE TABLE IF NOT EXISTS meal_extras (
      id text PRIMARY KEY,
      session_id text NOT NULL,
      plate text NOT NULL,
      qty integer NOT NULL DEFAULT 1,
      reason text NOT NULL,
      note text,
      created_by text,
      created_by_name text,
      created_at timestamptz NOT NULL DEFAULT now()
    );`);
    await getDb().execute(sql`CREATE INDEX IF NOT EXISTS meal_extras_session_idx ON meal_extras (session_id);`);
  })().catch((e) => {
    ensured = null;
    throw e;
  });
  return ensured;
}

// ── shapes ───────────────────────────────────────────────────────────────

export type FoodWindow = { id: string; label: string; kind: string; dayKey: string; status: string; eventId: string };

export type FoodPerson = {
  ticketId: string;
  name: string;
  plate: Plate | null;
  /** why there is no plate, in plain English */
  why?: string;
  givenAt: string | null;
  givenBy: string | null;
  /** checked in at the gate on this window's day (null = can't tell: not an event date) */
  gateIn: boolean | null;
  child: boolean;
  under5: boolean;
  age: number | null;
  /** plates this person may be switched to at the line */
  canChangeTo: Plate[];
};

export type FoodBooking = {
  registrationId: string;
  conf: string;
  buyer: string;
  phone: string;
  standing: RegStanding;
  /** set = no plates may be given for this booking (with the reason) */
  blocked: string | null;
  /** walk-in let in owing money */
  owesCents: number | null;
  people: FoodPerson[];
  /** passes on this booking for other days (not shown) */
  otherDayPasses: number;
  booked: PlateCounts;
  given: PlateCounts;
  left: PlateCounts;
  gateIn: number;
  gateKnown: boolean;
  lastGivenAt: string | null;
};

export type LinkedBooking = { registrationId: string; conf: string; buyer: string; leftTotal: number; bookedTotal: number; blocked: string | null; why: string };

export type FoodParty = { window: FoodWindow; booking: FoodBooking; linked: LinkedBooking[]; requireGate: boolean };

// ── loading ──────────────────────────────────────────────────────────────

type Reg = typeof schema.registrations.$inferSelect;
type Db = ReturnType<typeof getDb>;

async function loadWindow(db: Db, sessionId: string) {
  const [sess] = await db.select().from(schema.scanSessions).where(eq(schema.scanSessions.id, sessionId));
  if (!sess) return null;
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, sess.eventId));
  const days = ((event?.days as EventDayLite[] | null) ?? []) as EventDayLite[];
  return {
    sess,
    event,
    days,
    dayKeys: days.map((d) => d.key),
    window: { id: sess.id, label: sess.label, kind: sess.kind, dayKey: sess.dayKey, status: sess.status, eventId: sess.eventId } as FoodWindow,
  };
}

/** userId → a name a volunteer recognises (member name, else the email's first part). */
export async function staffNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const want = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (want.length === 0) return out;
  const db = getDb();
  const users = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(inArray(schema.users.id, want));
  for (const u of users) out.set(u.id, u.email.split("@")[0]);
  try {
    const mems = await db
      .select({ userId: schema.members.userId, f: schema.members.primaryFirstName, l: schema.members.primaryLastName })
      .from(schema.members)
      .where(inArray(schema.members.userId, want));
    for (const m of mems) out.set(m.userId, `${m.f} ${m.l ?? ""}`.trim());
  } catch {
    /* names are a nicety */
  }
  return out;
}

function blockedReason(r: Reg, standing: RegStanding): string | null {
  if (standing === "ready" || standing === "owes") return null;
  if (r.deskState === "voided") return "VOIDED at the walk-in desk — send them to the desk.";
  if (r.status.startsWith("cancelled")) return "This booking was CANCELLED.";
  if (r.status === "pending_zelle_verification") return "NOT PAID yet — Zelle not confirmed. Send them to the walk-in desk.";
  return "NOT PAID — send them to the walk-in desk.";
}

/**
 * Build the food view of some bookings for one window.
 * Loads only what it needs: these registrations' tickets, their scans in this
 * window, voids, and gate check-ins for the window's day.
 */
async function buildBookings(
  db: Db,
  w: NonNullable<Awaited<ReturnType<typeof loadWindow>>>,
  regs: Reg[],
  opts: { minAdultAge: number; withNames: boolean }
): Promise<FoodBooking[]> {
  if (regs.length === 0) return [];
  const regIds = regs.map((r) => r.id);
  const rows = await db
    .select({ t: schema.tickets, tt: schema.ticketTypes })
    .from(schema.tickets)
    .innerJoin(schema.ticketTypes, eq(schema.ticketTypes.id, schema.tickets.ticketTypeId))
    .where(inArray(schema.tickets.registrationId, regIds));
  const ticketIds = rows.map((x) => x.t.id);
  const scans = ticketIds.length
    ? await db
        .select()
        .from(schema.ticketScans)
        .where(and(eq(schema.ticketScans.sessionId, w.sess.id), inArray(schema.ticketScans.ticketId, ticketIds)))
    : [];
  const scanBy = new Map(scans.map((s) => [s.ticketId, s]));
  const { voidedTicketIds } = await import("@/lib/refunds");
  const voided = await voidedTicketIds();
  const day = w.days.find((d) => d.key === w.sess.dayKey) ?? null;
  const gate = day ? await inTodayMap(rows.map((x) => x.t), day) : null;
  const names = opts.withNames ? await staffNames(scans.map((s) => s.scannedBy)) : new Map<string, string>();

  return regs.map((r) => {
    const standing = standingOf(r);
    const people: FoodPerson[] = [];
    let otherDayPasses = 0;
    const booked = emptyPlateCounts();
    const given = emptyPlateCounts();
    let last: Date | null = null;
    for (const { t, tt } of rows.filter((x) => x.t.registrationId === r.id)) {
      if (voided.has(t.id)) continue; // refunded passes drop out of every count
      const v = plateForWindow(t, tt, { kind: w.sess.kind, dayKey: w.sess.dayKey }, w.dayKeys);
      if (v.plate === null && v.why === "not_today") {
        otherDayPasses++;
        continue;
      }
      if (v.plate === null && v.why === "addon") continue;
      const sc = scanBy.get(t.id);
      const under5 = isUnder5(t, tt);
      const child = isChild(t, tt);
      const band = tt.ageBand === "student" ? "student" : under5 ? "under5" : child ? "youth" : "adult";
      if (v.plate) {
        addPlate(booked, v.plate);
        if (sc) {
          addPlate(given, v.plate);
          if (!last || sc.scannedAt > last) last = sc.scannedAt;
        }
      }
      people.push({
        ticketId: t.id,
        name: `${t.attendeeFirstName} ${t.attendeeLastName ?? ""}`.trim(),
        plate: v.plate,
        why: v.plate ? undefined : NO_PLATE_WHY[v.why],
        givenAt: sc ? clock(sc.scannedAt) : null,
        givenBy: sc?.scannedBy ? (names.get(sc.scannedBy) ?? null) : null,
        gateIn: gate ? gate.has(t.id) : null,
        child,
        under5,
        age: t.attendeeAge,
        canChangeTo: v.plate && tt.ageBand !== "concert" ? plateChoices(band, t.attendeeAge, opts.minAdultAge) : [],
      });
    }
    const left = emptyPlateCounts();
    for (const p of PLATES) addPlate(left, p, Math.max(0, booked[p] - given[p]));
    // adults first, then children, then by name — the order a family stands in
    people.sort((a, b) => Number(a.child) - Number(b.child) || a.name.localeCompare(b.name));
    return {
      registrationId: r.id,
      conf: r.confirmationNumber,
      buyer: r.buyerName,
      phone: r.buyerPhone ?? "",
      standing,
      blocked: blockedReason(r, standing),
      owesCents: null,
      people,
      otherDayPasses,
      booked,
      given,
      left,
      gateIn: people.filter((p) => p.gateIn).length,
      gateKnown: !!gate,
      lastGivenAt: last ? clock(last) : null,
    };
  });
}

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Other bookings by the same family for this event: same email or phone, or a desk add-on of this booking. */
function linkedRegs(primary: Reg, all: Reg[]): { r: Reg; why: string }[] {
  const email = primary.buyerEmail.trim().toLowerCase();
  const phone = digits(primary.buyerPhone);
  const out: { r: Reg; why: string }[] = [];
  for (const r of all) {
    if (r.id === primary.id) continue;
    if (standingOf(r) === "skip") continue;
    if (r.parentRegistrationId === primary.id || primary.parentRegistrationId === r.id) out.push({ r, why: "added on at the desk" });
    else if (email && r.buyerEmail.trim().toLowerCase() === email) out.push({ r, why: "same email" });
    else if (phone.length >= 7 && digits(r.buyerPhone).length >= 7 && digits(r.buyerPhone).slice(-10) === phone.slice(-10))
      out.push({ r, why: "same phone" });
  }
  return out;
}

async function minAge(): Promise<number> {
  return Number(await getConfig<number>("adult_meal_min_age")) || 12;
}

/** The full party view for one booking in one window. */
export async function loadFoodParty(sessionId: string, registrationId: string): Promise<FoodParty | null> {
  await ensureFoodlineSchema();
  const db = getDb();
  const w = await loadWindow(db, sessionId);
  if (!w) return null;
  const all = await db.select().from(schema.registrations).where(eq(schema.registrations.eventId, w.sess.eventId));
  const primary = all.find((r) => r.id === registrationId);
  if (!primary) return null;
  const links = linkedRegs(primary, all);
  const m = await minAge();
  const [booking, ...others] = await buildBookings(db, w, [primary, ...links.map((l) => l.r)], { minAdultAge: m, withNames: true });
  if (booking.standing === "owes") {
    try {
      const { deskOrderSummary } = await import("@/lib/desk/summary");
      const s = await deskOrderSummary(primary.id);
      if (s && s.balanceCents > 0) booking.owesCents = s.balanceCents;
    } catch {
      /* a note is never worth blocking food */
    }
  }
  return {
    window: w.window,
    booking,
    linked: others
      .map((o, i) => ({
        registrationId: o.registrationId,
        conf: o.conf,
        buyer: o.buyer,
        leftTotal: o.left.total,
        bookedTotal: o.booked.total,
        blocked: o.blocked,
        why: links[i].why,
      }))
      .filter((o) => o.bookedTotal > 0 || o.blocked),
    requireGate: (await getConfig<string>("food_require_gate_checkin")) === "yes",
  };
}

export type FoodLookup =
  | { kind: "party"; party: FoodParty }
  | { kind: "choose"; window: FoodWindow; options: { registrationId: string; conf: string; buyer: string; people: string[]; plates: number }[] }
  | { kind: "none"; window: FoodWindow | null; reason: string };

function normalize(raw: string): string {
  let q = raw.trim();
  const m = q.match(/\/t\/([A-Za-z0-9-]+)/);
  if (m) q = m[1];
  return q;
}

/** A scan or a typed search at the food line → the party (or a short list to pick from). */
export async function foodLookup(sessionId: string, raw: string): Promise<FoodLookup> {
  await ensureFoodlineSchema();
  const db = getDb();
  const w = await loadWindow(db, sessionId);
  if (!w) return { kind: "none", window: null, reason: "That meal window no longer exists — pick one again." };
  const q = normalize(raw);
  if (!q) return { kind: "none", window: w.window, reason: "Scan a pass or type a name." };

  if (/^PRAGATI-TKT-/i.test(q)) {
    const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.qrCode, q));
    if (!t) return { kind: "none", window: w.window, reason: "NOT OUR TICKET — this QR is not a Pragati pass." };
    const [r] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, t.registrationId));
    if (!r) return { kind: "none", window: w.window, reason: "This pass has no booking." };
    if (r.eventId !== w.sess.eventId) return { kind: "none", window: w.window, reason: "This pass is for a DIFFERENT EVENT." };
    const party = await loadFoodParty(sessionId, r.id);
    return party ? { kind: "party", party } : { kind: "none", window: w.window, reason: "Booking not found." };
  }

  const all = await db.select().from(schema.registrations).where(eq(schema.registrations.eventId, w.sess.eventId));
  if (/^PRG-/i.test(q)) {
    const r = all.find((x) => x.confirmationNumber.toUpperCase() === q.toUpperCase());
    if (!r) return { kind: "none", window: w.window, reason: `No booking ${q.toUpperCase()} for this event.` };
    const party = await loadFoodParty(sessionId, r.id);
    return party ? { kind: "party", party } : { kind: "none", window: w.window, reason: "Booking not found." };
  }

  // name / phone / email
  const needle = q.toLowerCase();
  const qd = digits(q);
  const candidates = all.filter((r) => standingOf(r) !== "skip");
  const byBuyer = candidates.filter(
    (r) =>
      r.buyerName.toLowerCase().includes(needle) ||
      (needle.includes("@") && r.buyerEmail.toLowerCase().includes(needle)) ||
      (qd.length >= 4 && digits(r.buyerPhone).includes(qd))
  );
  const ids = candidates.map((r) => r.id);
  const tix = ids.length
    ? await db
        .select({ registrationId: schema.tickets.registrationId, f: schema.tickets.attendeeFirstName, l: schema.tickets.attendeeLastName })
        .from(schema.tickets)
        .where(inArray(schema.tickets.registrationId, ids))
    : [];
  const matchedNames = new Map<string, Set<string>>();
  for (const t of tix) {
    const full = `${t.f} ${t.l ?? ""}`.trim();
    if (full.toLowerCase().includes(needle)) {
      if (!matchedNames.has(t.registrationId)) matchedNames.set(t.registrationId, new Set());
      matchedNames.get(t.registrationId)!.add(full);
    }
  }
  const hit = new Set([...byBuyer.map((r) => r.id), ...matchedNames.keys()]);
  const regs = candidates.filter((r) => hit.has(r.id));
  if (regs.length === 0)
    return { kind: "none", window: w.window, reason: `Nobody found for “${q}”. Try the phone number or the booking number (PRG-…).` };
  if (regs.length === 1) {
    const party = await loadFoodParty(sessionId, regs[0].id);
    return party ? { kind: "party", party } : { kind: "none", window: w.window, reason: "Booking not found." };
  }
  const built = await buildBookings(db, w, regs.slice(0, 12), { minAdultAge: await minAge(), withNames: false });
  return {
    kind: "choose",
    window: w.window,
    options: built.map((b) => ({
      registrationId: b.registrationId,
      conf: b.conf,
      buyer: b.buyer,
      people: [...(matchedNames.get(b.registrationId) ?? [])].length
        ? [...matchedNames.get(b.registrationId)!]
        : b.people.slice(0, 4).map((p) => p.name),
      plates: b.left.total,
    })),
  };
}

// ── giving plates ────────────────────────────────────────────────────────

export class FoodError extends Error {}

export type Staff = { userId: string; role: string; name?: string | null };

export type GiveResult = {
  given: Partial<Record<Plate, number>>;
  givenTotal: number;
  /** asked for but not available — someone else gave them a moment ago */
  short: number;
  party: FoodParty;
};

async function assertOpen(sessionId: string) {
  const db = getDb();
  const [sess] = await db.select().from(schema.scanSessions).where(eq(schema.scanSessions.id, sessionId));
  if (!sess) throw new FoodError("That meal window no longer exists.");
  if (sess.status !== "open") throw new FoodError(`${sess.label} is closed — an admin can open it in Food line.`);
  return sess;
}

/**
 * Give `want[plate]` plates of each type to this booking in this window.
 * Picks people who were checked in at the gate first. Race-safe: each plate is
 * one insert on the (window, pass) unique index; a lost race just moves on to
 * the next unserved person, and anything still short is reported, not hidden.
 */
export async function giveFood(sessionId: string, registrationId: string, want: Partial<Record<Plate, number>>, staff: Staff): Promise<GiveResult> {
  await ensureFoodlineSchema();
  const sess = await assertOpen(sessionId);
  const db = getDb();
  const before = await loadFoodParty(sessionId, registrationId);
  if (!before) throw new FoodError("Booking not found.");
  if (before.booking.blocked) throw new FoodError(before.booking.blocked);

  const given: Partial<Record<Plate, number>> = {};
  let short = 0;
  for (const plate of PLATES) {
    const n = Math.max(0, Math.floor(want[plate] ?? 0));
    if (n === 0) continue;
    const pool = before.booking.people
      .filter((p) => p.plate === plate && !p.givenAt)
      .filter((p) => !before.requireGate || p.gateIn !== false)
      .sort((a, b) => Number(b.gateIn === true) - Number(a.gateIn === true));
    let got = 0;
    for (const p of pool) {
      if (got >= n) break;
      const ins = await db.insert(schema.ticketScans).values({ sessionId, ticketId: p.ticketId, scannedBy: staff.userId }).onConflictDoNothing().returning();
      if (ins.length) got++;
    }
    if (got) given[plate] = got;
    short += n - got;
  }
  const givenTotal = Object.values(given).reduce((a, b) => a + (b ?? 0), 0);
  if (givenTotal > 0) {
    await db.insert(schema.auditLog).values({
      userId: staff.userId,
      action: "meal_give",
      entityType: "registrations",
      entityId: registrationId,
      changes: { window: sess.label, conf: before.booking.conf, plates: given, short },
    });
  }
  const party = (await loadFoodParty(sessionId, registrationId))!;
  return { given, givenTotal, short, party };
}

/** Give one named person their plate. */
export async function giveOne(sessionId: string, ticketId: string, staff: Staff): Promise<FoodParty> {
  await ensureFoodlineSchema();
  const sess = await assertOpen(sessionId);
  const db = getDb();
  const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId));
  if (!t) throw new FoodError("Pass not found.");
  const party = await loadFoodParty(sessionId, t.registrationId);
  if (!party) throw new FoodError("Booking not found.");
  if (party.booking.blocked) throw new FoodError(party.booking.blocked);
  const p = party.booking.people.find((x) => x.ticketId === ticketId);
  if (!p || !p.plate) throw new FoodError(p?.why ? `${p.name}: ${p.why}.` : "No plate on this pass in this window.");
  if (party.requireGate && p.gateIn === false) throw new FoodError(`${p.name} has not been checked in at the gate today.`);
  const ins = await db.insert(schema.ticketScans).values({ sessionId, ticketId, scannedBy: staff.userId }).onConflictDoNothing().returning();
  if (ins.length)
    await db.insert(schema.auditLog).values({
      userId: staff.userId,
      action: "meal_give",
      entityType: "tickets",
      entityId: ticketId,
      changes: { window: sess.label, conf: party.booking.conf, plate: p.plate },
    });
  return (await loadFoodParty(sessionId, t.registrationId))!;
}

/** How long a volunteer may undo their own plate. Admins can undo any time. */
export const VOLUNTEER_UNDO_MINUTES = 15;

/** Take a plate back (given by mistake). The pass is owed a plate again. */
export async function undoGive(sessionId: string, ticketId: string, staff: Staff): Promise<FoodParty | null> {
  await ensureFoodlineSchema();
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.ticketScans)
    .where(and(eq(schema.ticketScans.sessionId, sessionId), eq(schema.ticketScans.ticketId, ticketId)));
  const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId));
  if (!t) throw new FoodError("Pass not found.");
  if (row) {
    const isAdmin = staff.role === "admin" || staff.role === "super_admin";
    const ageMin = (Date.now() - row.scannedAt.getTime()) / 60000;
    if (!isAdmin && (row.scannedBy !== staff.userId || ageMin > VOLUNTEER_UNDO_MINUTES))
      throw new FoodError(`Only an admin can undo this — it was given ${row.scannedBy === staff.userId ? `over ${VOLUNTEER_UNDO_MINUTES} minutes ago` : "by someone else"}.`);
    await db.delete(schema.ticketScans).where(eq(schema.ticketScans.id, row.id));
    await db.insert(schema.auditLog).values({
      userId: staff.userId,
      action: "meal_undo",
      entityType: "tickets",
      entityId: ticketId,
      changes: { sessionId, givenAt: row.scannedAt.toISOString(), givenBy: row.scannedBy },
    });
  }
  return loadFoodParty(sessionId, t.registrationId);
}

/** Switch someone's plate at the line (booked veg, wants non-veg). Moves the kitchen counts too. */
export async function changePlate(sessionId: string, ticketId: string, plate: Plate, staff: Staff): Promise<FoodParty | null> {
  await ensureFoodlineSchema();
  const db = getDb();
  const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId));
  if (!t) throw new FoodError("Pass not found.");
  const party = await loadFoodParty(sessionId, t.registrationId);
  const p = party?.booking.people.find((x) => x.ticketId === ticketId);
  if (!p) throw new FoodError("This pass is not in this meal window.");
  if (!p.canChangeTo.includes(plate)) throw new FoodError(`${p.name} can't have that plate.`);
  const to = prefOf(plate);
  if (to !== t.foodPref) {
    await db.update(schema.tickets).set({ foodPref: to }).where(eq(schema.tickets.id, ticketId));
    await db.insert(schema.auditLog).values({
      userId: staff.userId,
      action: "meal_change_plate",
      entityType: "tickets",
      entityId: ticketId,
      changes: { from: t.foodPref, to },
    });
  }
  return loadFoodParty(sessionId, t.registrationId);
}

// ── plates without a pass ───────────────────────────────────────────────

export const EXTRA_REASONS = ["Volunteer", "Performer / artist", "Purohit / puja", "Committee guest", "Paid at the counter", "Other"] as const;

export async function addExtras(sessionId: string, plate: Plate, qty: number, reason: string, note: string | null, staff: Staff) {
  await ensureFoodlineSchema();
  await assertOpen(sessionId);
  const n = Math.floor(qty);
  if (!(n >= 1 && n <= 200)) throw new FoodError("Enter how many plates (1–200).");
  if (!PLATES.includes(plate)) throw new FoodError("Pick a plate type.");
  const why = reason.trim();
  if (!why) throw new FoodError("Pick a reason.");
  if (why === "Other" && !(note ?? "").trim()) throw new FoodError("Say who the plates were for.");
  const db = getDb();
  const [row] = await db
    .insert(schema.mealExtras)
    .values({ sessionId, plate, qty: n, reason: why, note: note?.trim() || null, createdBy: staff.userId, createdByName: staff.name ?? null })
    .returning();
  await db.insert(schema.auditLog).values({
    userId: staff.userId,
    action: "meal_extras",
    entityType: "meal_extras",
    entityId: row.id,
    changes: { sessionId, plate, qty: n, reason: why, note },
  });
  return row;
}

export async function removeExtra(id: string, staff: Staff) {
  await ensureFoodlineSchema();
  if (staff.role !== "admin" && staff.role !== "super_admin") throw new FoodError("Only an admin can remove off-list plates.");
  const db = getDb();
  const [row] = await db.select().from(schema.mealExtras).where(eq(schema.mealExtras.id, id));
  if (!row) return;
  await db.delete(schema.mealExtras).where(eq(schema.mealExtras.id, id));
  await db.insert(schema.auditLog).values({
    userId: staff.userId,
    action: "meal_extras_removed",
    entityType: "meal_extras",
    entityId: id,
    changes: { sessionId: row.sessionId, plate: row.plate, qty: row.qty, reason: row.reason, note: row.note },
  });
}

// ── the dashboard ────────────────────────────────────────────────────────

export type WindowStats = {
  window: FoodWindow;
  booked: PlateCounts;
  given: PlateCounts;
  extras: PlateCounts;
  left: PlateCounts;
  /** bookings fully served / partly served / not yet seen */
  families: { full: number; partial: number; none: number };
  owed: { registrationId: string; conf: string; buyer: string; left: number; given: number; lastGivenAt: string | null }[];
  recent: { kind: "pass" | "extra"; id: string; ticketId?: string; at: string; atIso: string; who: string; plate: Plate | null; qty: number; by: string | null; conf?: string }[];
  extrasList: { id: string; plate: Plate; qty: number; reason: string; note: string | null; by: string | null; at: string }[];
};

export async function windowStats(sessionId: string): Promise<WindowStats | null> {
  await ensureFoodlineSchema();
  const db = getDb();
  const w = await loadWindow(db, sessionId);
  if (!w) return null;
  const regs = (await db.select().from(schema.registrations).where(eq(schema.registrations.eventId, w.sess.eventId))).filter((r) => {
    const s = standingOf(r);
    return s === "ready" || s === "owes";
  });
  const bookings = await buildBookings(db, w, regs, { minAdultAge: await minAge(), withNames: false });
  const booked = emptyPlateCounts();
  const given = emptyPlateCounts();
  const families = { full: 0, partial: 0, none: 0 };
  const owed: WindowStats["owed"] = [];
  const plateByTicket = new Map<string, { plate: Plate | null; name: string; conf: string }>();
  for (const b of bookings) {
    for (const p of PLATES) {
      addPlate(booked, p, b.booked[p]);
      addPlate(given, p, b.given[p]);
    }
    for (const p of b.people) plateByTicket.set(p.ticketId, { plate: p.plate, name: p.name, conf: b.conf });
    if (b.booked.total === 0) continue;
    if (b.given.total === 0) families.none++;
    else if (b.left.total === 0) families.full++;
    else {
      families.partial++;
      owed.push({ registrationId: b.registrationId, conf: b.conf, buyer: b.buyer, left: b.left.total, given: b.given.total, lastGivenAt: b.lastGivenAt });
    }
  }
  const extrasRows = await db.select().from(schema.mealExtras).where(eq(schema.mealExtras.sessionId, sessionId)).orderBy(desc(schema.mealExtras.createdAt));
  const extras = emptyPlateCounts();
  for (const e of extrasRows) if (PLATES.includes(e.plate as Plate)) addPlate(extras, e.plate as Plate, e.qty);
  const left = emptyPlateCounts();
  for (const p of PLATES) addPlate(left, p, Math.max(0, booked[p] - given[p]));

  const lastScans = await db
    .select()
    .from(schema.ticketScans)
    .where(eq(schema.ticketScans.sessionId, sessionId))
    .orderBy(desc(schema.ticketScans.scannedAt))
    .limit(25);
  const names = await staffNames([...lastScans.map((s) => s.scannedBy), ...extrasRows.map((e) => e.createdBy)]);
  const recent: WindowStats["recent"] = [
    ...lastScans.map((s) => {
      const info = plateByTicket.get(s.ticketId);
      return {
        kind: "pass" as const,
        id: s.id,
        ticketId: s.ticketId,
        at: clock(s.scannedAt),
        atIso: s.scannedAt.toISOString(),
        who: info?.name ?? "(pass)",
        plate: info?.plate ?? null,
        qty: 1,
        by: s.scannedBy ? (names.get(s.scannedBy) ?? null) : null,
        conf: info?.conf,
      };
    }),
    ...extrasRows.slice(0, 25).map((e) => ({
      kind: "extra" as const,
      id: e.id,
      at: clock(e.createdAt),
      atIso: e.createdAt.toISOString(),
      who: e.note ? `${e.reason} — ${e.note}` : e.reason,
      plate: e.plate as Plate,
      qty: e.qty,
      by: e.createdByName ?? (e.createdBy ? (names.get(e.createdBy) ?? null) : null),
    })),
  ]
    .sort((a, b) => b.atIso.localeCompare(a.atIso))
    .slice(0, 25);

  owed.sort((a, b) => b.left - a.left || a.buyer.localeCompare(b.buyer));
  return {
    window: w.window,
    booked,
    given,
    extras,
    left,
    families,
    owed,
    recent,
    extrasList: extrasRows.map((e) => ({
      id: e.id,
      plate: e.plate as Plate,
      qty: e.qty,
      reason: e.reason,
      note: e.note,
      by: e.createdByName ?? (e.createdBy ? (names.get(e.createdBy) ?? null) : null),
      at: clock(e.createdAt),
    })),
  };
}
