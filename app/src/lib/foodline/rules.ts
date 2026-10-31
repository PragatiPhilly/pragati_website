/**
 * Food line rules — pure, so the scan screen, the dashboard and the tests all
 * agree on "does this pass get a plate in this meal window, and which plate?".
 *
 * The meal WINDOW is the truth for the food line: an admin opens "Saturday ·
 * Dinner" (Admin → Scan setup / Food line) and every pass with food that covers
 * Saturday is owed one plate in it. Same exceptions as the coupons / kitchen
 * (lib/coupons/rules.ts):
 *   - adult / student pass without food        → no plate
 *   - concert-only adult                        → no plate
 *   - concert-only child                        → a kid plate, dinner only
 *   - children's passes always include food; an under-5 ALWAYS gets a plate
 *   - add-on extras (parking, …)                → not a meal plate here
 */
import { plateOf, type Plate } from "@/lib/food";

export type WindowLite = { kind: string; dayKey: string };

export type PassLite = {
  ageBand: string;
  withFood: boolean;
  dayKeys: unknown;
};

export type TicketLite = {
  dayKey: string | null;
  foodPref: string | null;
  attendeeAge: number | null;
};

const KID_BANDS = new Set(["child_5_18", "child_5_12", "child_5_11", "child_12_17", "child_under_5"]);

/** Days a ticket covers (same rule as lib/checkin/daily.ts coveredDays). */
export function ticketCovers(t: Pick<TicketLite, "dayKey">, pass: Pick<PassLite, "dayKeys">, eventDayKeys: string[]): string[] {
  if (t.dayKey && t.dayKey !== "all") return [t.dayKey];
  const keys = Array.isArray(pass.dayKeys) ? (pass.dayKeys as string[]) : [];
  return keys.length ? keys : eventDayKeys;
}

export type PlateVerdict =
  | { plate: Plate }
  | { plate: null; why: "not_today" | "no_food_pass" | "concert" | "not_eating" | "addon" };

export const NO_PLATE_WHY: Record<Exclude<PlateVerdict, { plate: Plate }>["why"], string> = {
  not_today: "Pass not for today",
  no_food_pass: "Pass without food",
  concert: "Concert only — no meal",
  not_eating: "Not eating",
  addon: "Extra pass — not a meal",
};

export function isUnder5(t: Pick<TicketLite, "attendeeAge">, pass: Pick<PassLite, "ageBand">): boolean {
  return pass.ageBand === "child_under_5" || (KID_BANDS.has(pass.ageBand) && t.attendeeAge !== null && t.attendeeAge < 5);
}

export function isChild(t: Pick<TicketLite, "attendeeAge">, pass: Pick<PassLite, "ageBand">): boolean {
  return KID_BANDS.has(pass.ageBand) || (t.attendeeAge !== null && t.attendeeAge < 18);
}

/** The plate this ticket is owed in this window, or why there is none. */
export function plateForWindow(t: TicketLite, pass: PassLite, w: WindowLite, eventDayKeys: string[]): PlateVerdict {
  if (pass.ageBand === "addon") return { plate: null, why: "addon" };
  if (w.dayKey !== "all" && !ticketCovers(t, pass, eventDayKeys).includes(w.dayKey)) return { plate: null, why: "not_today" };
  if (pass.ageBand === "concert") {
    const kid = (t.attendeeAge !== null && t.attendeeAge < 18) || plateOf(t.foodPref)?.startsWith("kid");
    if (kid && w.kind === "dinner") return { plate: plateOf(t.foodPref) && plateOf(t.foodPref)!.startsWith("kid") ? plateOf(t.foodPref)! : "kid" };
    return { plate: null, why: "concert" };
  }
  const plate = plateOf(t.foodPref);
  if (isUnder5(t, pass)) return { plate: plate && plate.startsWith("kid") ? plate : "kid" };
  if (KID_BANDS.has(pass.ageBand)) return plate ? { plate } : { plate: null, why: "not_eating" };
  if (!pass.withFood) return { plate: null, why: "no_food_pass" };
  return plate ? { plate } : { plate: null, why: "not_eating" };
}
