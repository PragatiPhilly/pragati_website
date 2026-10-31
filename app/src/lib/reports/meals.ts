/**
 * Plates per meal — the caterer's number — and heads per day.
 *
 * Built on the SAME rules as the printed coupons (lib/coupons/rules.ts), so the
 * kitchen count and the coupon count can never disagree:
 *   Friday = dinner; Saturday/Sunday = lunch + dinner; concert-only kids eat
 *   dinner that night, concert-only adults don't; no-food passes don't.
 * Counts PAID bookings plus walk-ins a staff member let in before they had
 * fully paid (they are inside and eating). Unpaid bookings are shown separately
 * as "could still come".
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { couponDef, couponsForTicket, mealsFor, standingOf, ticketDays, whoIs, type CouponTicket, type Meal } from "@/lib/coupons/rules";

/** `kid` = ALL kid plates; split into kidNonVeg / kidVeg / kidUnknown (older
 *  bookings and concert-only kids, where veg/non-veg was never asked). */
export type MealRow = {
  /** Lunch / Dinner (or Breakfast when a breakfast window is set up) */
  meal: Meal | "Breakfast";
  adultNonVeg: number;
  adultVeg: number;
  kid: number;
  kidNonVeg: number;
  kidVeg: number;
  kidUnknown: number;
  total: number;
};
export type DayReport = {
  key: string;
  label: string;
  meals: MealRow[];
  /** people with a pass for this day (paid / admitted), by kind */
  people: number;
  adults: number;
  kids: number;
  concertOnly: number;
  noFood: number;
  under5: number;
  /** plates that unpaid bookings would add if they pay */
  pendingPlates: number;
};

type Day = { key: string; label: string };

export async function mealReport(eventId: string, days: Day[]): Promise<DayReport[]> {
  const db = getDb();
  // The meals the event ACTUALLY serves are the windows set up in Scan setup
  // (e.g. Kali Pujo: Saturday dinner only). Only an event with no windows set
  // up falls back to the old fixed Durga Pujo pattern below.
  try {
    const { ensureScanTables } = await import("@/lib/scans/ensure");
    await ensureScanTables();
    const windows = await db.select().from(schema.scanSessions).where(eq(schema.scanSessions.eventId, eventId));
    if (windows.length > 0) return windowMealReport(eventId, days, windows);
  } catch {
    /* fall through to the fixed pattern */
  }
  const regs = await db.select().from(schema.registrations).where(eq(schema.registrations.eventId, eventId));
  const standing = new Map(regs.map((r) => [r.id, standingOf(r)]));
  const rows = await db
    .select({ t: schema.tickets, tt: schema.ticketTypes })
    .from(schema.tickets)
    .innerJoin(schema.ticketTypes, eq(schema.ticketTypes.id, schema.tickets.ticketTypeId))
    .where(eq(schema.ticketTypes.eventId, eventId));
  const dayKeys = days.map((d) => d.key);
  const { voidedTicketIds } = await import("@/lib/refunds");
  const voided = await voidedTicketIds();

  const out: DayReport[] = days.map((d) => ({
    key: d.key,
    label: d.label,
    meals: mealsFor(d.key).map((meal) => ({ meal, adultNonVeg: 0, adultVeg: 0, kid: 0, kidNonVeg: 0, kidVeg: 0, kidUnknown: 0, total: 0 })),
    people: 0,
    adults: 0,
    kids: 0,
    concertOnly: 0,
    noFood: 0,
    under5: 0,
    pendingPlates: 0,
  }));
  const byKey = new Map(out.map((d) => [d.key, d]));

  for (const { t, tt } of rows) {
    if (tt.ageBand === "addon" || voided.has(t.id)) continue;
    const s = standing.get(t.registrationId);
    if (s === "skip" || s === undefined) continue;
    const ct: CouponTicket = {
      ageBand: tt.ageBand,
      passWithFood: tt.withFood,
      passDayKeys: Array.isArray(tt.dayKeys) ? (tt.dayKeys as string[]) : null,
      dayKey: t.dayKey,
      foodPref: t.foodPref,
      age: t.attendeeAge,
    };
    const plates = couponsForTicket(ct, dayKeys);
    if (s === "unpaid") {
      for (const p of plates) {
        const d = byKey.get(couponDef(p.key).day);
        if (d) d.pendingPlates++;
      }
      continue;
    }
    for (const dk of ticketDays(ct, dayKeys)) {
      const d = byKey.get(dk);
      if (!d) continue;
      d.people++;
      if (whoIs(ct) === "Kid") d.kids++;
      else d.adults++;
      const u5 = tt.ageBand === "child_under_5" || (t.attendeeAge !== null && t.attendeeAge < 5);
      if (tt.ageBand === "concert") d.concertOnly++;
      else if (!u5 && (plates.length === 0 || !t.foodPref || t.foodPref === "none")) d.noFood++;
      if (u5) d.under5++;
    }
    for (const p of plates) {
      const def = couponDef(p.key);
      const row = byKey.get(def.day)?.meals.find((m) => m.meal === def.meal);
      if (!row) continue;
      if (def.who === "Kid") {
        row.kid++;
        if (t.foodPref === "kid_veg") row.kidVeg++;
        else if (t.foodPref === "kid_non_veg") row.kidNonVeg++;
        else row.kidUnknown++;
      } else if (p.veg) row.adultVeg++;
      else row.adultNonVeg++;
      row.total++;
    }
  }
  return out;
}


const KIND_LABEL: Record<string, Meal | "Breakfast"> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" };
const KIND_ORDER: Record<string, number> = { breakfast: 0, lunch: 1, dinner: 2 };

/** Plates per configured meal window — the same rule the food line uses (lib/foodline/rules.ts). */
async function windowMealReport(eventId: string, days: Day[], windows: (typeof schema.scanSessions.$inferSelect)[]): Promise<DayReport[]> {
  const db = getDb();
  const { plateForWindow, isUnder5, isChild } = await import("@/lib/foodline/rules");
  const regs = await db.select().from(schema.registrations).where(eq(schema.registrations.eventId, eventId));
  const standing = new Map(regs.map((r) => [r.id, standingOf(r)]));
  const rows = await db
    .select({ t: schema.tickets, tt: schema.ticketTypes })
    .from(schema.tickets)
    .innerJoin(schema.ticketTypes, eq(schema.ticketTypes.id, schema.tickets.ticketTypeId))
    .where(eq(schema.ticketTypes.eventId, eventId));
  const { voidedTicketIds } = await import("@/lib/refunds");
  const voided = await voidedTicketIds();
  const dayKeys = days.map((d) => d.key);
  const live = rows.filter((x) => x.tt.ageBand !== "addon" && !voided.has(x.t.id));

  return days
    .map((d) => {
      const wins = windows.filter((w) => w.dayKey === d.key || w.dayKey === "all").sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
      const out: DayReport = { key: d.key, label: d.label, meals: [], people: 0, adults: 0, kids: 0, concertOnly: 0, noFood: 0, under5: 0, pendingPlates: 0 };
      for (const w of wins) {
        const row: MealRow = { meal: KIND_LABEL[w.kind] ?? "Dinner", adultNonVeg: 0, adultVeg: 0, kid: 0, kidNonVeg: 0, kidVeg: 0, kidUnknown: 0, total: 0 };
        for (const { t, tt } of live) {
          const s = standing.get(t.registrationId);
          if (!s || s === "skip") continue;
          const v = plateForWindow(t, tt, { kind: w.kind, dayKey: d.key }, dayKeys);
          if (!v.plate) continue;
          if (s === "unpaid") {
            out.pendingPlates++;
            continue;
          }
          row.total++;
          if (v.plate === "adult_non_veg") row.adultNonVeg++;
          else if (v.plate === "adult_veg") row.adultVeg++;
          else {
            row.kid++;
            if (v.plate === "kid_veg") row.kidVeg++;
            else if (v.plate === "kid_non_veg") row.kidNonVeg++;
            else row.kidUnknown++;
          }
        }
        out.meals.push(row);
      }
      // heads for the day (paid / admitted passes covering it)
      for (const { t, tt } of live) {
        const s = standing.get(t.registrationId);
        if (s !== "ready" && s !== "owes") continue;
        const covers = plateForWindow(t, tt, { kind: "dinner", dayKey: d.key }, dayKeys);
        if (covers.plate === null && covers.why === "not_today") continue;
        out.people++;
        if (isChild(t, tt)) out.kids++;
        else out.adults++;
        if (tt.ageBand === "concert") out.concertOnly++;
        else if (covers.plate === null) out.noFood++;
        if (isUnder5(t, tt)) out.under5++;
      }
      return out;
    })
    .filter((d) => d.meals.length > 0 || d.people > 0);
}
