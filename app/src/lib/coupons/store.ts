/**
 * Data for the Coupon desk: who registered since a given moment, grouped by
 * family, with the coupons each one earns and whether they were handed over.
 *
 * Reads registrations / tickets / ticket_types; writes only its own table,
 * coupon_handouts (created here, lazily — same self-applying pattern as
 * lib/desk/ensure.ts). Never changes a registration or a ticket.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { addToTally, emptyTally, standingOf, type CouponTally, type RegStanding, type Who, whoIs, ticketDays } from "./rules";

let ensured: Promise<void> | null = null;

export function ensureCouponSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await getDb().execute(sql`CREATE TABLE IF NOT EXISTS coupon_handouts (
      registration_id text PRIMARY KEY,
      given_at timestamptz NOT NULL DEFAULT now(),
      given_by text,
      given_by_name text
    );`);
  })().catch((e) => {
    ensured = null;
    throw e;
  });
  return ensured;
}

export type DeskPerson = { name: string; who: Who; pass: string; days: string[]; food: string };

export type DeskReg = {
  id: string;
  conf: string;
  standing: RegStanding;
  source: string;
  placedAt: string; // ISO — paid_at if paid, else created_at
  given: { at: string; by: string | null } | null;
  people: DeskPerson[];
  tally: CouponTally;
};

export type DeskFamily = {
  key: string;
  name: string;
  email: string;
  phone: string;
  regs: DeskReg[];
  /** Paid bookings by the same buyer BEFORE the start time — their coupons were on an earlier desk. */
  earlier: string[];
};

const FOOD_LABEL: Record<string, string> = { veg: "Veg", non_veg: "Non-veg", kid: "Kid meal", none: "No food" };

export async function loadCouponDesk(eventId: string, eventDays: string[], since: Date): Promise<DeskFamily[]> {
  await ensureCouponSchema();
  const db = getDb();
  const allRegs = await db.select().from(schema.registrations).where(eq(schema.registrations.eventId, eventId));
  const inWindow = (r: (typeof allRegs)[number]) => r.createdAt >= since || (r.paidAt !== null && r.paidAt >= since);
  const regs = allRegs.filter((r) => inWindow(r) && standingOf(r) !== "skip");
  if (regs.length === 0) return [];
  const ids = regs.map((r) => r.id);

  const rows = await db
    .select({ t: schema.tickets, tt: schema.ticketTypes })
    .from(schema.tickets)
    .innerJoin(schema.ticketTypes, eq(schema.ticketTypes.id, schema.tickets.ticketTypeId))
    .where(inArray(schema.tickets.registrationId, ids));
  const handouts = await db.select().from(schema.couponHandouts).where(inArray(schema.couponHandouts.registrationId, ids));
  const givenBy = new Map(handouts.map((h) => [h.registrationId, h]));

  const famKey = (r: { id: string; buyerEmail: string }) => r.buyerEmail.trim().toLowerCase() || `reg:${r.id}`;
  const families = new Map<string, DeskFamily>();

  for (const r of [...regs].sort((a, b) => +(a.paidAt ?? a.createdAt) - +(b.paidAt ?? b.createdAt))) {
    const key = famKey(r);
    let fam = families.get(key);
    if (!fam) {
      fam = { key, name: r.buyerName, email: r.buyerEmail, phone: r.buyerPhone ?? "", regs: [], earlier: [] };
      families.set(key, fam);
    }
    const tally = emptyTally();
    const people: DeskPerson[] = [];
    for (const { t, tt } of rows.filter((x) => x.t.registrationId === r.id)) {
      if (tt.ageBand === "addon") continue;
      const ct = {
        ageBand: tt.ageBand,
        passWithFood: tt.withFood,
        passDayKeys: Array.isArray(tt.dayKeys) ? (tt.dayKeys as string[]) : null,
        dayKey: t.dayKey,
        foodPref: t.foodPref,
        age: t.attendeeAge,
      };
      addToTally(tally, ct, eventDays);
      const name = [t.attendeeFirstName, t.attendeeLastName].filter(Boolean).join(" ").trim();
      const food = tt.ageBand === "concert" ? "Concert" : !tt.withFood ? "No food" : FOOD_LABEL[t.foodPref ?? "none"] ?? "No food";
      people.push({ name, who: whoIs(ct), pass: tt.name, days: ticketDays(ct, eventDays), food });
    }
    const h = givenBy.get(r.id);
    fam.regs.push({
      id: r.id,
      conf: r.confirmationNumber,
      standing: standingOf(r),
      source: r.source,
      placedAt: (r.paidAt ?? r.createdAt).toISOString(),
      given: h ? { at: h.givenAt.toISOString(), by: h.givenByName } : null,
      people: mergePeople(people),
      tally,
    });
  }

  // Earlier PAID bookings by the same buyer — a reminder that those coupons
  // were already packed on an earlier desk, so only the new ones are due.
  for (const r of allRegs) {
    if (inWindow(r) || r.status !== "paid") continue;
    const fam = families.get(famKey(r));
    if (fam) fam.earlier.push(r.confirmationNumber);
  }

  return [...families.values()];
}

/** A per-day pass shows as one ticket per day; show each person once with all their days. */
function mergePeople(list: DeskPerson[]): DeskPerson[] {
  const out = new Map<string, DeskPerson>();
  for (const p of list) {
    const k = `${p.name.toLowerCase()}|${p.pass}|${p.food}`;
    const had = out.get(k);
    if (had) had.days = [...new Set([...had.days, ...p.days])];
    else out.set(k, { ...p, days: [...p.days] });
  }
  return [...out.values()];
}

/** Mark registrations' coupons as handed over. Only paid / admitted ones can be marked. */
export async function markHandedOut(registrationIds: string[], user: { userId: string; name: string | null }): Promise<string[]> {
  await ensureCouponSchema();
  const db = getDb();
  if (registrationIds.length === 0) return [];
  const regs = await db.select().from(schema.registrations).where(inArray(schema.registrations.id, registrationIds));
  const ok = regs.filter((r) => {
    const s = standingOf(r);
    return s === "ready" || s === "owes";
  });
  for (const r of ok) {
    await db
      .insert(schema.couponHandouts)
      .values({ registrationId: r.id, givenBy: user.userId, givenByName: user.name })
      .onConflictDoNothing();
  }
  return ok.map((r) => r.id);
}

export async function undoHandedOut(registrationIds: string[]): Promise<void> {
  await ensureCouponSchema();
  if (registrationIds.length === 0) return;
  await getDb().delete(schema.couponHandouts).where(and(inArray(schema.couponHandouts.registrationId, registrationIds)));
}
