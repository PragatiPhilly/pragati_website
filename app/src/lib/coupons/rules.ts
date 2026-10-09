/**
 * Food-coupon rules for the Coupon desk (Admin → Coupon desk).
 *
 * Pure — no database, no React — so the same rules can be unit-tested and
 * shown on screen. These are the rules the paper Coupon Desk pages used:
 *
 *   - Friday = dinner only. Saturday and Sunday = lunch + dinner.
 *   - A full / combo pass gives coupons for every day it covers.
 *   - "Without food" passes and add-on extras give no coupons.
 *   - Concert-only: a KID gets the kid dinner coupon for that night;
 *     an adult gets none.
 *   - Students get the adult coupons.
 *   - Veg is not a separate colour — each coupon carries a "veg" count.
 */

export type Who = "Adult" | "Kid";
export type Meal = "Lunch" | "Dinner";

export type CouponDef = {
  key: string;
  who: Who;
  day: string;
  meal: Meal;
  /** Physical coupon colour. */
  color: string;
  /** Text printed on the adult coupons; kid coupons carry a smiley. */
  print: string;
  /** Adult "Ticket" coupons are the large ones. */
  big?: boolean;
};

/** The colour legend of the printed coupons, Durga Pujo 2026. */
export const COUPON_LEGEND: CouponDef[] = [
  { key: "A_fri_D", who: "Adult", day: "fri", meal: "Dinner", color: "#f26a21", print: "Keep this coupon" },
  { key: "K_fri_D", who: "Kid", day: "fri", meal: "Dinner", color: "#f7a6b4", print: "☺" },
  { key: "A_sat_L", who: "Adult", day: "sat", meal: "Lunch", color: "#28a6df", print: "Keep this coupon" },
  { key: "A_sat_D", who: "Adult", day: "sat", meal: "Dinner", color: "#fcc52b", print: "Ticket", big: true },
  { key: "K_sat_L", who: "Kid", day: "sat", meal: "Lunch", color: "#3fa84b", print: "☺" },
  { key: "K_sat_D", who: "Kid", day: "sat", meal: "Dinner", color: "#e0353c", print: "☺" },
  { key: "A_sun_L", who: "Adult", day: "sun", meal: "Lunch", color: "#f6a9b9", print: "Ticket", big: true },
  { key: "A_sun_D", who: "Adult", day: "sun", meal: "Dinner", color: "#b28fdb", print: "Ticket", big: true },
  { key: "K_sun_L", who: "Kid", day: "sun", meal: "Lunch", color: "#ffd31f", print: "☺" },
  { key: "K_sun_D", who: "Kid", day: "sun", meal: "Dinner", color: "#f88a2c", print: "☺" },
];

const LEGEND_BY_KEY = new Map(COUPON_LEGEND.map((c) => [c.key, c]));

/** Meals served per day. A day not listed gets lunch + dinner. */
const MEALS_BY_DAY: Record<string, Meal[]> = { fri: ["Dinner"], sat: ["Lunch", "Dinner"], sun: ["Lunch", "Dinner"] };
export const mealsFor = (day: string): Meal[] => MEALS_BY_DAY[day] ?? ["Lunch", "Dinner"];

export const couponKey = (who: Who, day: string, meal: Meal) => `${who === "Adult" ? "A" : "K"}_${day}_${meal === "Lunch" ? "L" : "D"}`;

/** Legend entry for a key — a neutral grey for a day the printed legend doesn't cover. */
export function couponDef(key: string): CouponDef {
  const known = LEGEND_BY_KEY.get(key);
  if (known) return known;
  const [w, day, m] = key.split("_");
  return { key, who: w === "K" ? "Kid" : "Adult", day, meal: m === "L" ? "Lunch" : "Dinner", color: "#9a9a9a", print: "—" };
}

/** One ticket, as far as the coupon rules care. */
export type CouponTicket = {
  ageBand: string; // the pass's band: adult | student | child_5_18 | child_5_12 | child_under_5 | concert | addon | all
  passWithFood: boolean;
  passDayKeys: string[] | null;
  dayKey: string | null; // 'all' / null = every day the pass covers
  foodPref: string | null; // veg | non_veg | kid | none
  age: number | null;
};

const KID_BANDS = new Set(["child_5_18", "child_5_12", "child_under_5"]);

export function whoIs(t: Pick<CouponTicket, "ageBand" | "foodPref" | "age">): Who {
  if (KID_BANDS.has(t.ageBand)) return "Kid";
  if (t.ageBand === "adult" || t.ageBand === "student") return "Adult";
  // concert / "all" passes carry no age in the band — use the person.
  if (t.foodPref === "kid") return "Kid";
  if (t.age !== null && t.age < 18) return "Kid";
  return "Adult";
}

/** The days a ticket covers. */
export function ticketDays(t: Pick<CouponTicket, "dayKey" | "passDayKeys">, eventDays: string[]): string[] {
  if (t.dayKey && t.dayKey !== "all") return [t.dayKey];
  return t.passDayKeys && t.passDayKeys.length ? t.passDayKeys : eventDays;
}

/** Coupons one ticket earns: [{ key, veg }]. Empty for no-food / add-on / adult concert. */
export function couponsForTicket(t: CouponTicket, eventDays: string[]): { key: string; veg: boolean }[] {
  if (t.ageBand === "addon") return [];
  const who = whoIs(t);
  const days = ticketDays(t, eventDays);
  if (t.ageBand === "concert") {
    // A concert-only kid still eats dinner that night; a concert-only adult does not.
    return who === "Kid" ? days.map((d) => ({ key: couponKey("Kid", d, "Dinner"), veg: false })) : [];
  }
  if (!t.passWithFood) return [];
  if (!t.foodPref || t.foodPref === "none") return [];
  const veg = t.foodPref === "veg";
  return days.flatMap((d) => mealsFor(d).map((m) => ({ key: couponKey(who, d, m), veg })));
}

export type CouponTally = { counts: Record<string, number>; veg: Record<string, number> };

export function emptyTally(): CouponTally {
  return { counts: {}, veg: {} };
}

export function addToTally(tally: CouponTally, t: CouponTicket, eventDays: string[]): CouponTally {
  for (const c of couponsForTicket(t, eventDays)) {
    tally.counts[c.key] = (tally.counts[c.key] ?? 0) + 1;
    if (c.veg) tally.veg[c.key] = (tally.veg[c.key] ?? 0) + 1;
  }
  return tally;
}

/** Keys in legend order (then any off-legend keys), only those with a count. */
export function orderedKeys(tally: CouponTally): string[] {
  const legend = COUPON_LEGEND.map((c) => c.key).filter((k) => (tally.counts[k] ?? 0) > 0);
  const extra = Object.keys(tally.counts)
    .filter((k) => !LEGEND_BY_KEY.has(k) && tally.counts[k] > 0)
    .sort();
  return [...legend, ...extra];
}

/**
 * Which registrations count for coupons.
 *  - "ready":  paid.
 *  - "owes":   a walk-in desk order a staff member admitted before it was fully
 *              paid. They are inside and eating, so they count — flagged.
 *  - "unpaid": still waiting for money (card not completed, Zelle unverified,
 *              an open desk order). Never hand out — shown only on request.
 *  - "skip":   cancelled, voided, or a desk draft.
 */
export type RegStanding = "ready" | "owes" | "unpaid" | "skip";

export function standingOf(r: { status: string; source: string; deskState: string | null; admittedUnsettledAt: Date | string | null }): RegStanding {
  if (r.deskState === "voided" || r.deskState === "draft") return "skip";
  if (r.status === "cancelled" || r.status.startsWith("cancelled")) return "skip";
  if (r.status === "paid") return "ready";
  if (r.source === "desk" && r.admittedUnsettledAt) return "owes";
  if (r.status === "pending_payment" || r.status === "pending_zelle_verification" || r.source === "desk") return "unpaid";
  return "skip";
}
