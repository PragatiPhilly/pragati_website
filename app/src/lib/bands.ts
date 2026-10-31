/**
 * Age bands for passes — one list for checkout, the registration page, the
 * walk-in desk and every report. Pure and dependency-free (client-safe).
 *
 *   adult · student · concert · addon · all   (as before)
 *   child_under_5                              under 5
 *   child_5_18                                 one price for every child 5–17 (Durga Pujo 2026)
 *   child_5_11  + child_12_17                  split child prices (Kali Pujo 2026: $15 / $25)
 *   child_5_12                                 legacy "youth" — treated like child_5_18
 *
 * A child picks the most specific band the event actually sells: a 14-year-old
 * uses child_12_17 if the event has one, else the single child_5_18 price.
 * 18+ is always an adult.
 */
export const TEEN_FROM_AGE = 12;

export const YOUTH_BANDS = ["child_5_18", "child_5_12", "child_5_11", "child_12_17"] as const;
export const KID_BANDS = new Set<string>([...YOUTH_BANDS, "child_under_5"]);

export const isYouthBand = (b: string) => (YOUTH_BANDS as readonly string[]).includes(b);

/** The youth band a child of this age belongs to (null age = unknown). */
export function youthBandFor(age: number | null | undefined): "child_5_11" | "child_12_17" | "child_5_18" {
  if (age === null || age === undefined || Number.isNaN(age)) return "child_5_18";
  return age >= TEEN_FROM_AGE ? "child_12_17" : "child_5_11";
}

/** Bands to try for a child's band, most specific first. */
export function youthBandOrder(band: string): string[] {
  if (band === "child_12_17") return ["child_12_17", "child_5_18", "child_5_12"];
  if (band === "child_5_11") return ["child_5_11", "child_5_18", "child_5_12"];
  return ["child_5_18", "child_5_12"]; // age unknown: only a single child price can apply
}

/**
 * Of an event's passes, the ones that serve this band — the first band in the
 * order that has any live pass (plus "all" passes). Mirrors checkout exactly.
 */
export function passesForBand<T extends { ageBand: string }>(passes: T[], band: string): T[] {
  const usable = passes.filter((t) => t.ageBand !== "concert" && t.ageBand !== "addon");
  const order = isYouthBand(band) ? youthBandOrder(band) : [band];
  for (const b of order) {
    const hit = usable.filter((t) => t.ageBand === b);
    if (hit.length) return [...hit, ...usable.filter((t) => t.ageBand === "all")];
  }
  return usable.filter((t) => t.ageBand === "all");
}

/** Does this event price children 5–11 and 12–17 differently? */
export const hasSplitYouth = (passes: { ageBand: string }[]) =>
  passes.some((t) => t.ageBand === "child_5_11" || t.ageBand === "child_12_17");

export const BAND_LABEL: Record<string, string> = {
  adult: "Adult",
  student: "Student",
  child_5_18: "Youth (5–18)",
  child_5_12: "Youth",
  child_5_11: "Child (5–11)",
  child_12_17: "Youth (12–17)",
  child_under_5: "Under 5",
  concert: "Concert",
  addon: "Add-on",
  all: "Everyone",
};
