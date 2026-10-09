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

export type MealRow = { meal: Meal; adultNonVeg: number; adultVeg: number; kid: number; total: number };
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
    meals: mealsFor(d.key).map((meal) => ({ meal, adultNonVeg: 0, adultVeg: 0, kid: 0, total: 0 })),
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
      if (tt.ageBand === "concert") d.concertOnly++;
      else if (!tt.withFood || !t.foodPref || t.foodPref === "none") d.noFood++;
      if (tt.ageBand === "child_under_5" || (t.attendeeAge !== null && t.attendeeAge < 5)) d.under5++;
    }
    for (const p of plates) {
      const def = couponDef(p.key);
      const row = byKey.get(def.day)?.meals.find((m) => m.meal === def.meal);
      if (!row) continue;
      if (def.who === "Kid") row.kid++;
      else if (p.veg) row.adultVeg++;
      else row.adultNonVeg++;
      row.total++;
    }
  }
  return out;
}
