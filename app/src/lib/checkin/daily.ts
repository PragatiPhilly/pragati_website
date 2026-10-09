/**
 * Per-day check-in.
 *
 * Before this, a ticket checked in ONCE, ever: a 3-day pass scanned on Friday
 * read "already used" on Saturday, and a Sunday ticket scanned on Saturday was
 * let in (and then "used up" for Sunday). Now, on an event day:
 *
 *   - a ticket can be checked in once PER DAY it covers;
 *   - a ticket that doesn't cover today is refused at the scan, with the days
 *     it is for (staff can still override from the lookup list);
 *   - tickets.checked_in_at keeps being written with the LATEST check-in, so
 *     every screen that asks "has this pass been used?" behaves as before.
 *
 * Check-ins made before this shipped (only tickets.checked_in_at) still count
 * for the day they happened on. Outside the event dates nothing changes: the
 * old once-only rule applies.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

let ensured: Promise<void> | null = null;

export function ensureDailyCheckins(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await getDb().execute(sql`CREATE TABLE IF NOT EXISTS ticket_day_checkins (
      ticket_id text NOT NULL,
      day_key text NOT NULL,
      checked_in_at timestamptz NOT NULL DEFAULT now(),
      checked_in_by text,
      PRIMARY KEY (ticket_id, day_key)
    );`);
  })().catch((e) => {
    ensured = null;
    throw e;
  });
  return ensured;
}

export type EventDayLite = { key: string; date: string; label?: string };

const TZ = "America/New_York";

/** "YYYY-MM-DD" in New York for an instant (default: now). */
export function nyYmd(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Today's event day, or null when today isn't one of the event's dates. */
export function todayOf(days: EventDayLite[], now: Date = new Date()): EventDayLite | null {
  const ymd = nyYmd(now);
  return days.find((d) => d.date === ymd) ?? null;
}

/** The event days a ticket admits on. */
export function coveredDays(ticketDayKey: string | null, passDayKeys: unknown, days: EventDayLite[]): string[] {
  if (ticketDayKey && ticketDayKey !== "all") return [ticketDayKey];
  const keys = Array.isArray(passDayKeys) ? (passDayKeys as string[]) : [];
  return keys.length ? keys : days.map((d) => d.key);
}

export function daysLabel(keys: string[], days: EventDayLite[]): string {
  return keys.map((k) => (days.find((d) => d.key === k)?.label ?? k).split(",")[0]).join(" & ");
}

export type DailyState = {
  /** null = not an event day → the old once-only rule applies */
  today: EventDayLite | null;
  covered: string[];
  wrongDay: boolean;
  /** When this ticket was let in TODAY (or, outside event days, ever). */
  inAt: Date | null;
};

type Ticket = typeof schema.tickets.$inferSelect;

export async function dailyState(ticket: Ticket, passDayKeys: unknown, days: EventDayLite[], now: Date = new Date()): Promise<DailyState> {
  const today = todayOf(days, now);
  const covered = coveredDays(ticket.dayKey, passDayKeys, days);
  if (!today) return { today: null, covered, wrongDay: false, inAt: ticket.checkedInAt };
  const inAt = (await inTodayMap([ticket], today)).get(ticket.id) ?? null;
  return { today, covered, wrongDay: !covered.includes(today.key), inAt };
}

/**
 * For each ticket, when it was let in on `today` (absent = not in today).
 * A day row, or — for check-ins made before day rows existed — a
 * tickets.checked_in_at that falls on today's date.
 */
export async function inTodayMap(tickets: Pick<Ticket, "id" | "checkedInAt">[], today: EventDayLite): Promise<Map<string, Date>> {
  await ensureDailyCheckins();
  const out = new Map<string, Date>();
  for (const t of tickets) if (t.checkedInAt && nyYmd(t.checkedInAt) === today.date) out.set(t.id, t.checkedInAt);
  const ids = tickets.map((t) => t.id);
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await getDb()
      .select()
      .from(schema.ticketDayCheckins)
      .where(and(inArray(schema.ticketDayCheckins.ticketId, ids.slice(i, i + 500)), eq(schema.ticketDayCheckins.dayKey, today.key)));
    for (const r of rows) out.set(r.ticketId, r.checkedInAt);
  }
  return out;
}

/** Let a ticket in now. `today` null = not an event day (old behaviour). */
export async function recordCheckin(ticketId: string, today: EventDayLite | null, staffId: string): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.update(schema.tickets).set({ checkedInAt: now, checkedInBy: staffId }).where(eq(schema.tickets.id, ticketId));
  if (today) {
    await ensureDailyCheckins();
    await db
      .insert(schema.ticketDayCheckins)
      .values({ ticketId, dayKey: today.key, checkedInAt: now, checkedInBy: staffId })
      .onConflictDoNothing();
  }
}

/** Undo TODAY's check-in only. Earlier days stay recorded. */
export async function undoCheckinToday(ticket: Ticket, today: EventDayLite | null): Promise<void> {
  const db = getDb();
  if (!today) {
    await db.update(schema.tickets).set({ checkedInAt: null, checkedInBy: null }).where(eq(schema.tickets.id, ticket.id));
    return;
  }
  await ensureDailyCheckins();
  await db
    .delete(schema.ticketDayCheckins)
    .where(and(eq(schema.ticketDayCheckins.ticketId, ticket.id), eq(schema.ticketDayCheckins.dayKey, today.key)));
  if (ticket.checkedInAt && nyYmd(ticket.checkedInAt) === today.date) {
    // Fall back to the most recent earlier day, if any.
    const rest = await db.select().from(schema.ticketDayCheckins).where(eq(schema.ticketDayCheckins.ticketId, ticket.id));
    const latest = rest.sort((a, b) => +b.checkedInAt - +a.checkedInAt)[0];
    await db
      .update(schema.tickets)
      .set({ checkedInAt: latest?.checkedInAt ?? null, checkedInBy: latest?.checkedInBy ?? null })
      .where(eq(schema.tickets.id, ticket.id));
  }
}

/** Does this registration admit at the gate? Same rule the QR scan applies. */
export function regAdmits(r: { status: string; source: string; deskState: string | null; admittedUnsettledAt: Date | null } | undefined): boolean {
  if (!r) return false;
  const isDesk = r.source === "desk" || !!r.deskState;
  if (isDesk && r.deskState === "voided") return false;
  return r.status === "paid" || (isDesk && !!r.admittedUnsettledAt);
}

/** Inside today vs expected today, for one event. null when today isn't an event day. */
export async function todayCounts(eventId: string, days: EventDayLite[]): Promise<{ today: EventDayLite; inside: number; expected: number } | null> {
  const today = todayOf(days);
  if (!today) return null;
  const db = getDb();
  const regs = (await db.select().from(schema.registrations).where(eq(schema.registrations.eventId, eventId))).filter(regAdmits);
  if (regs.length === 0) return { today, inside: 0, expected: 0 };
  const regIds = new Set(regs.map((r) => r.id));
  const rows = await db
    .select({ t: schema.tickets, dayKeys: schema.ticketTypes.dayKeys, band: schema.ticketTypes.ageBand })
    .from(schema.tickets)
    .innerJoin(schema.ticketTypes, eq(schema.ticketTypes.id, schema.tickets.ticketTypeId))
    .where(eq(schema.ticketTypes.eventId, eventId));
  const { voidedTicketIds } = await import("@/lib/refunds");
  const voided = await voidedTicketIds();
  const todays = rows
    .filter((x) => regIds.has(x.t.registrationId) && x.band !== "addon" && !voided.has(x.t.id))
    .filter((x) => coveredDays(x.t.dayKey, x.dayKeys, days).includes(today.key))
    .map((x) => x.t);
  const inMap = await inTodayMap(todays, today);
  return { today, inside: todays.filter((t) => inMap.has(t.id)).length, expected: todays.length };
}
