/**
 * Seasons — one event's data, kept and re-loadable after the next event starts
 * (spec/19).
 *
 * NOTHING IS MOVED OR DELETED. Every row stays where it is; the admin tabs
 * simply look through an "event lens":
 *
 *   registrations / tickets      → registrations.event_id (always known)
 *   payments of kind registration → the registration's event (always known)
 *   in-checkout donations         → the registration they came with
 *   everything else (standalone donations, membership dues, unmatched card
 *   payments)                     → a SEASON TAG, written when an event is
 *                                   closed out; untagged = the current event
 *
 * Tags live in their own table (season_tags) so no existing money table gets a
 * new column — a schema change to `payments` that a query reached before the
 * ALTER ran would take the money pages down.
 *
 * Closing an event also freezes its final numbers in event_archives: the "backup"
 * summary that never changes, even if a refund or a late Zelle lands later
 * (the live view of that event still shows those).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb, schema } from "@/db/client";
import { getConfig, setConfig } from "@/lib/system-config";

type Db = ReturnType<typeof getDb>;
type Event = typeof schema.events.$inferSelect;
type Payment = typeof schema.payments.$inferSelect;
type Donation = typeof schema.donations.$inferSelect;

// ── schema ───────────────────────────────────────────────────────────────

let ensured: Promise<void> | null = null;

export function ensureSeasonSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    for (const stmt of [
      sql`CREATE TABLE IF NOT EXISTS season_tags (
        entity_kind text NOT NULL,
        entity_id text NOT NULL,
        event_id text NOT NULL,
        tagged_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (entity_kind, entity_id)
      )`,
      sql`CREATE INDEX IF NOT EXISTS season_tags_event_idx ON season_tags (event_id)`,
      sql`CREATE TABLE IF NOT EXISTS event_archives (
        event_id text PRIMARY KEY,
        closed_at timestamptz NOT NULL DEFAULT now(),
        closed_by text,
        closed_by_name text,
        next_event_id text,
        summary jsonb NOT NULL
      )`,
    ]) {
      await db.execute(stmt);
    }
  })().catch((e) => {
    ensured = null;
    throw e;
  });
  return ensured;
}

// ── which event belongs to which row ─────────────────────────────────────

export type Attribution = {
  regEvent: Map<string, string>;
  tags: Map<string, string>; // "payment:<id>" | "donation:<id>" → event id
  donationReg: Map<string, string | null>; // donation id → source registration id
};

export async function loadAttribution(db: Db = getDb()): Promise<Attribution> {
  await ensureSeasonSchema();
  const regs = await db.select({ id: schema.registrations.id, eventId: schema.registrations.eventId }).from(schema.registrations);
  const tagRows = (await db.execute(sql`SELECT entity_kind, entity_id, event_id FROM season_tags`)) as unknown;
  const list = (Array.isArray(tagRows) ? tagRows : ((tagRows as { rows?: unknown[] }).rows ?? [])) as {
    entity_kind: string;
    entity_id: string;
    event_id: string;
  }[];
  const dons = await db.select({ id: schema.donations.id, src: schema.donations.sourceRegistrationId }).from(schema.donations);
  return {
    regEvent: new Map(regs.map((r) => [r.id, r.eventId])),
    tags: new Map(list.map((t) => [`${t.entity_kind}:${t.entity_id}`, t.event_id])),
    donationReg: new Map(dons.map((d) => [d.id, d.src])),
  };
}

/** The event a donation belongs to, or null = not yet filed (the current event). */
export function donationEventId(a: Attribution, donationId: string): string | null {
  const tagged = a.tags.get(`donation:${donationId}`);
  if (tagged) return tagged;
  const reg = a.donationReg.get(donationId);
  return reg ? (a.regEvent.get(reg) ?? null) : null;
}

/** The event a ledger row belongs to, or null = not yet filed (the current event). */
export function paymentEventId(a: Attribution, p: Pick<Payment, "id" | "kind" | "entityId">): string | null {
  if (p.kind === "registration") {
    const ev = a.regEvent.get(p.entityId);
    if (ev) return ev;
  }
  const tagged = a.tags.get(`payment:${p.id}`);
  if (tagged) return tagged;
  if (p.kind === "donation") return donationEventId(a, p.entityId);
  return null;
}

/** The event lens a page is looking through. */
export type Lens = { event: Event; isCurrent: boolean };

/** Does a row attributed to `eventId` (null = not yet filed) show under this lens? */
export function inLens(eventId: string | null, lens: Lens | null): boolean {
  if (!lens) return true;
  return eventId ? eventId === lens.event.id : lens.isCurrent;
}

// ── the admin's "viewing" event ──────────────────────────────────────────

export const LENS_COOKIE = "pragati_admin_event";

/**
 * Which event the admin tabs show: the one picked in the switcher (cookie),
 * else the current (active) event. `isCurrent` = it is the active event.
 */
export async function getLens(): Promise<Lens | null> {
  const db = getDb();
  const activeSlug = await getConfig<string>("active_event_slug");
  let picked: string | undefined;
  try {
    picked = (await cookies()).get(LENS_COOKIE)?.value;
  } catch {
    picked = undefined; // outside a request (tests, scripts)
  }
  const events = await db.select().from(schema.events);
  const active = events.find((e) => e.slug === activeSlug) ?? null;
  const chosen = (picked && events.find((e) => e.id === picked)) || active;
  if (!chosen) return null;
  return { event: chosen, isCurrent: !!active && chosen.id === active.id };
}

export type LensOption = { id: string; name: string; when: string; state: "current" | "past" | "upcoming" | "draft" };

export async function lensOptions(): Promise<LensOption[]> {
  const db = getDb();
  const activeSlug = await getConfig<string>("active_event_slug");
  const events = await db.select().from(schema.events);
  const now = new Date();
  return events
    .sort((a, b) => +b.startsAt - +a.startsAt)
    .map((e) => ({
      id: e.id,
      name: e.name,
      when: e.startsAt.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", year: "numeric" }),
      state: e.slug === activeSlug ? "current" : e.status !== "published" ? "draft" : e.endsAt < now ? "past" : "upcoming",
    }));
}

// ── one event's numbers ──────────────────────────────────────────────────

export type EventSummary = {
  eventId: string;
  eventName: string;
  dates: string;
  venue: string | null;
  computedAt: string;
  registrations: { paid: number; online: number; walkIn: number; pending: number; cancelled: number };
  people: { total: number; adults: number; children: number; under5: number };
  checkedIn: number;
  money: {
    tickets: number;
    donations: number;
    memberships: number;
    collected: number;
    fees: number;
    refunded: number;
    outstanding: number;
  };
  donations: { count: number; amount: number };
  plates: { given: number; offList: number } | null;
  byPass: { name: string; sold: number }[];
};

const KID_BANDS = new Set(["child_5_18", "child_5_12", "child_5_11", "child_12_17", "child_under_5"]);

/** Live numbers for one event, through the same lens the tabs use. */
export async function computeEventSummary(eventId: string, opts: { isCurrent: boolean }): Promise<EventSummary> {
  await ensureSeasonSchema();
  const db = getDb();
  const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, eventId));
  if (!ev) throw new Error("Event not found");
  const lens: Lens = { event: ev, isCurrent: opts.isCurrent };
  const regs = await db.select().from(schema.registrations).where(eq(schema.registrations.eventId, eventId));
  const { regAdmits } = await import("@/lib/checkin/daily");
  const admitted = regs.filter(regAdmits);
  const admittedIds = new Set(admitted.map((r) => r.id));
  const rows = regs.length
    ? await db
        .select({ t: schema.tickets, band: schema.ticketTypes.ageBand, name: schema.ticketTypes.name })
        .from(schema.tickets)
        .innerJoin(schema.ticketTypes, eq(schema.ticketTypes.id, schema.tickets.ticketTypeId))
        .where(inArray(schema.tickets.registrationId, regs.map((r) => r.id)))
    : [];
  const { voidedTicketIds } = await import("@/lib/refunds");
  const voided = await voidedTicketIds();
  const live = rows.filter((x) => admittedIds.has(x.t.registrationId) && !voided.has(x.t.id) && x.band !== "addon");
  // a person on per-day tickets has several rows — count people once
  const personKey = (x: (typeof live)[number]) =>
    `${x.t.registrationId}|${x.t.attendeeFirstName.trim().toLowerCase()}|${(x.t.attendeeLastName ?? "").trim().toLowerCase()}`;
  const people = new Map<string, (typeof live)[number]>();
  for (const x of live) if (!people.has(personKey(x))) people.set(personKey(x), x);
  const isKid = (x: (typeof live)[number]) => KID_BANDS.has(x.band) || (x.t.attendeeAge !== null && x.t.attendeeAge < 18);
  const isU5 = (x: (typeof live)[number]) => x.band === "child_under_5" || (x.t.attendeeAge !== null && x.t.attendeeAge < 5);
  const ppl = [...people.values()];

  let checkedIn = 0;
  try {
    const { ensureDailyCheckins } = await import("@/lib/checkin/daily");
    await ensureDailyCheckins();
    const ids = live.map((x) => x.t.id);
    if (ids.length) {
      const dayRows = await db.select().from(schema.ticketDayCheckins).where(inArray(schema.ticketDayCheckins.ticketId, ids));
      checkedIn = new Set([...dayRows.map((r) => r.ticketId), ...live.filter((x) => x.t.checkedInAt).map((x) => x.t.id)]).size;
    }
  } catch {
    checkedIn = live.filter((x) => x.t.checkedInAt).length;
  }

  const attribution = await loadAttribution(db);
  const { listPayments } = await import("@/lib/ledger");
  const pays = (await listPayments()).filter((p) => inLens(paymentEventId(attribution, p), lens));
  const sum = (f: (p: Payment) => boolean) => pays.filter(f).reduce((n, p) => n + p.amountCents, 0);
  const money = {
    tickets: sum((p) => p.kind === "registration" && p.status === "paid"),
    donations: sum((p) => p.kind === "donation" && p.status === "paid"),
    memberships: sum((p) => p.kind === "membership" && p.status === "paid"),
    collected: sum((p) => p.status === "paid"),
    fees: pays.filter((p) => p.status === "paid").reduce((n, p) => n + p.feeCents, 0),
    refunded: sum((p) => p.status === "refunded" && p.source === "refund"),
    outstanding: sum((p) => p.status === "pending" || p.status === "pending_verification"),
  };
  const dons = (await db.select().from(schema.donations)).filter(
    (d) => d.status === "paid" && inLens(donationEventId(attribution, d.id), lens)
  );

  let plates: EventSummary["plates"] = null;
  try {
    const { ensureFoodlineSchema } = await import("@/lib/foodline/party");
    await ensureFoodlineSchema();
    const wins = await db.select().from(schema.scanSessions).where(eq(schema.scanSessions.eventId, eventId));
    if (wins.length) {
      const ids = wins.map((w) => w.id);
      const given = await db.select({ n: sql<number>`count(*)` }).from(schema.ticketScans).where(inArray(schema.ticketScans.sessionId, ids));
      const extra = await db
        .select({ n: sql<number>`coalesce(sum(${schema.mealExtras.qty}),0)` })
        .from(schema.mealExtras)
        .where(inArray(schema.mealExtras.sessionId, ids));
      plates = { given: Number(given[0]?.n ?? 0), offList: Number(extra[0]?.n ?? 0) };
    }
  } catch {
    plates = null;
  }

  const byPassMap = new Map<string, number>();
  for (const x of live) byPassMap.set(x.name, (byPassMap.get(x.name) ?? 0) + 1);

  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", { timeZone: "America/New_York", ...o });
  const sameDay = fmt(ev.startsAt, { year: "numeric", month: "numeric", day: "numeric" }) === fmt(ev.endsAt, { year: "numeric", month: "numeric", day: "numeric" });
  return {
    eventId: ev.id,
    eventName: ev.name,
    dates: sameDay
      ? fmt(ev.startsAt, { month: "short", day: "numeric", year: "numeric" })
      : `${fmt(ev.startsAt, { month: "short", day: "numeric" })} – ${fmt(ev.endsAt, { month: "short", day: "numeric", year: "numeric" })}`,
    venue: ev.venueName,
    computedAt: new Date().toISOString(),
    registrations: {
      paid: admitted.length,
      online: admitted.filter((r) => r.source !== "desk" && !r.deskState).length,
      walkIn: admitted.filter((r) => r.source === "desk" || !!r.deskState).length,
      pending: regs.filter((r) => r.status === "pending_payment" || r.status === "pending_zelle_verification").filter((r) => !admittedIds.has(r.id)).length,
      cancelled: regs.filter((r) => r.status.startsWith("cancelled") || r.deskState === "voided").length,
    },
    people: { total: ppl.length, adults: ppl.filter((x) => !isKid(x)).length, children: ppl.filter((x) => isKid(x) && !isU5(x)).length, under5: ppl.filter(isU5).length },
    checkedIn,
    money,
    donations: { count: dons.length, amount: dons.reduce((n, d) => n + d.amountCents, 0) },
    plates,
    byPass: [...byPassMap.entries()].map(([name, sold]) => ({ name, sold })).sort((a, b) => b.sold - a.sold),
  };
}

// ── archives ─────────────────────────────────────────────────────────────

export type Archive = { eventId: string; closedAt: Date; closedByName: string | null; nextEventId: string | null; summary: EventSummary };

export async function listArchives(): Promise<Archive[]> {
  await ensureSeasonSchema();
  const res = (await getDb().execute(sql`SELECT event_id, closed_at, closed_by_name, next_event_id, summary FROM event_archives ORDER BY closed_at DESC`)) as unknown;
  const rows = (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as {
    event_id: string;
    closed_at: string | Date;
    closed_by_name: string | null;
    next_event_id: string | null;
    summary: EventSummary | string;
  }[];
  return rows.map((r) => ({
    eventId: r.event_id,
    closedAt: new Date(r.closed_at),
    closedByName: r.closed_by_name,
    nextEventId: r.next_event_id,
    summary: typeof r.summary === "string" ? (JSON.parse(r.summary) as EventSummary) : r.summary,
  }));
}

export type CloseOutResult = { archived: string; tagged: { payments: number; donations: number }; nowCurrent: string; published: boolean };

/**
 * Close the current event and make `nextEventId` the current one — the one
 * button on Admin → Events. In order:
 *   1. file every not-yet-filed donation / dues / unmatched payment under the
 *      outgoing event (season_tags; amounts and statuses are never touched)
 *   2. freeze the outgoing event's final numbers (event_archives)
 *   3. make the next event active (and, if asked, publish it so registration opens)
 * Safe to repeat: tagging only fills gaps and the archive row is upserted.
 */
export async function closeOutAndSwitch(
  nextEventId: string,
  opts: { publish: boolean; actor: { userId: string; name: string | null } }
): Promise<CloseOutResult> {
  await ensureSeasonSchema();
  const db = getDb();
  const activeSlug = await getConfig<string>("active_event_slug");
  const events = await db.select().from(schema.events);
  const outgoing = events.find((e) => e.slug === activeSlug);
  const next = events.find((e) => e.id === nextEventId);
  if (!next) throw new Error("That event no longer exists.");
  if (outgoing && outgoing.id === next.id) throw new Error(`${next.name} is already the current event.`);

  let tagged = { payments: 0, donations: 0 };
  if (outgoing) {
    const a = await loadAttribution(db);
    const { listPayments } = await import("@/lib/ledger");
    const unfiledPays = (await listPayments()).filter((p) => paymentEventId(a, p) === null);
    const unfiledDons = (await db.select({ id: schema.donations.id }).from(schema.donations)).filter((d) => donationEventId(a, d.id) === null);
    for (const p of unfiledPays)
      await db.execute(sql`INSERT INTO season_tags (entity_kind, entity_id, event_id) VALUES ('payment', ${p.id}, ${outgoing.id}) ON CONFLICT DO NOTHING`);
    for (const d of unfiledDons)
      await db.execute(sql`INSERT INTO season_tags (entity_kind, entity_id, event_id) VALUES ('donation', ${d.id}, ${outgoing.id}) ON CONFLICT DO NOTHING`);
    tagged = { payments: unfiledPays.length, donations: unfiledDons.length };

    // freeze the numbers AFTER filing, so the snapshot includes what was just filed
    const summary = await computeEventSummary(outgoing.id, { isCurrent: false });
    await db.execute(sql`INSERT INTO event_archives (event_id, closed_by, closed_by_name, next_event_id, summary)
      VALUES (${outgoing.id}, ${opts.actor.userId}, ${opts.actor.name}, ${next.id}, ${JSON.stringify(summary)}::jsonb)
      ON CONFLICT (event_id) DO UPDATE SET closed_at = now(), closed_by = EXCLUDED.closed_by, closed_by_name = EXCLUDED.closed_by_name,
        next_event_id = EXCLUDED.next_event_id, summary = EXCLUDED.summary`);
  }

  if (opts.publish && next.status !== "published")
    await db.update(schema.events).set({ status: "published", updatedAt: new Date() }).where(eq(schema.events.id, next.id));
  await setConfig("active_event_slug", next.slug, opts.actor.userId);
  await db.insert(schema.auditLog).values({
    userId: opts.actor.userId,
    action: "event_close_out",
    entityType: "events",
    entityId: outgoing?.id ?? null,
    changes: { closed: outgoing?.name ?? null, now_current: next.name, filed: tagged, published: opts.publish },
  });
  return { archived: outgoing?.name ?? "", tagged, nowCurrent: next.name, published: opts.publish || next.status === "published" };
}

/** Admin tabs filter registrations by event id — a convenience for the pages. */
export async function registrationIdsFor(eventId: string): Promise<Set<string>> {
  const rows = await getDb().select({ id: schema.registrations.id }).from(schema.registrations).where(and(eq(schema.registrations.eventId, eventId)));
  return new Set(rows.map((r) => r.id));
}

export type { Event as LensEvent, Donation as LensDonation };
