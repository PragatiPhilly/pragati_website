/**
 * Plates — what a person eats, as one vocabulary for registration, the walk-in
 * desk, the food line, the kitchen and the coupons.
 *
 * Pure and DEPENDENCY-FREE (client components import it), same rule as
 * lib/auth/sections.ts and lib/desk/constants.ts.
 *
 * Stored in tickets.food_pref (text, no schema change):
 *   veg · non_veg            adult plates
 *   kid_veg · kid_non_veg    kid plates
 *   kid                      kid plate, veg/non-veg never asked (bookings made
 *                            before Kali Pujo 2026). Still served; counted as
 *                            "kid, not chosen".
 *   none                     no meal
 *
 * Who may pick what (spec/18):
 *   adult / student          adult veg · adult non-veg
 *   youth aged ≥ minAdultAge adult veg · adult non-veg · kid veg · kid non-veg
 *   youth under that, under-5  kid veg · kid non-veg
 *   a child whose age we don't know → all four (price never depends on it)
 */

export type FoodPref = "veg" | "non_veg" | "kid_veg" | "kid_non_veg" | "kid" | "none";

/** A plate type at the serving line. `kid` = kid plate with no diet recorded. */
export type Plate = "adult_non_veg" | "adult_veg" | "kid_non_veg" | "kid_veg" | "kid";

/** Display order everywhere: adults first, non-veg first (most common). */
export const PLATES: Plate[] = ["adult_non_veg", "adult_veg", "kid_non_veg", "kid_veg", "kid"];

export const DEFAULT_ADULT_MEAL_MIN_AGE = 12;

const ALL_PREFS: FoodPref[] = ["veg", "non_veg", "kid_veg", "kid_non_veg", "kid", "none"];
export function isFoodPref(v: unknown): v is FoodPref {
  return typeof v === "string" && (ALL_PREFS as string[]).includes(v);
}

/** The plate a stored preference stands for (null = no meal). */
export function plateOf(pref: string | null | undefined): Plate | null {
  switch (pref) {
    case "veg":
      return "adult_veg";
    case "non_veg":
      return "adult_non_veg";
    case "kid_veg":
      return "kid_veg";
    case "kid_non_veg":
      return "kid_non_veg";
    case "kid":
      return "kid";
    default:
      return null;
  }
}

/** The stored preference for a plate. */
export function prefOf(plate: Plate): FoodPref {
  return plate === "adult_veg" ? "veg" : plate === "adult_non_veg" ? "non_veg" : plate;
}

export const isKidPlate = (p: Plate | null) => p === "kid" || p === "kid_veg" || p === "kid_non_veg";
export const isKidPref = (pref: string | null | undefined) => isKidPlate(plateOf(pref));
export const isVegPref = (pref: string | null | undefined) => pref === "veg" || pref === "kid_veg";

/** Words for screens. `short` is the big word on the food line. */
export const PLATE_LABEL: Record<Plate, { short: string; long: string; emoji: string }> = {
  adult_non_veg: { short: "ADULT NON-VEG", long: "Adult non-veg", emoji: "🐟" },
  adult_veg: { short: "ADULT VEG", long: "Adult veg", emoji: "🥬" },
  kid_non_veg: { short: "KID NON-VEG", long: "Kid non-veg", emoji: "🍗" },
  kid_veg: { short: "KID VEG", long: "Kid veg", emoji: "🍚" },
  kid: { short: "KID PLATE", long: "Kid's plate (veg/non-veg not chosen)", emoji: "🧒" },
};

/** A guest-facing sentence for a stored preference. */
export function foodPrefLabel(pref: string | null | undefined): string {
  switch (pref) {
    case "veg":
      return "Veg meal";
    case "non_veg":
      return "Non-veg meal";
    case "kid_veg":
      return "Kid's meal · veg";
    case "kid_non_veg":
      return "Kid's meal · non-veg";
    case "kid":
      return "Kid's meal";
    default:
      return "No meal";
  }
}

export type PlateColors = { veg: string; non_veg: string; kid: string; kid_veg: string };
export const DEFAULT_PLATE_COLORS: PlateColors = { veg: "#3E7C3A", non_veg: "#B3402A", kid: "#2B6CB0", kid_veg: "#7B4FA8" };

export function plateColor(plate: Plate | null, c: Partial<PlateColors> = {}): string {
  const col = { ...DEFAULT_PLATE_COLORS, ...Object.fromEntries(Object.entries(c).filter(([, v]) => !!v)) } as PlateColors;
  switch (plate) {
    case "adult_veg":
      return col.veg;
    case "adult_non_veg":
      return col.non_veg;
    case "kid_veg":
      return col.kid_veg;
    case "kid_non_veg":
    case "kid":
      return col.kid;
    default:
      return "#5b5f66";
  }
}

/** The band a person falls in, as far as plates care. */
export type PlateBand = "adult" | "student" | "youth" | "under5";

/** Which plates this person may choose. */
export function plateChoices(band: PlateBand, age: number | null | undefined, minAdultAge = DEFAULT_ADULT_MEAL_MIN_AGE): Plate[] {
  if (band === "adult" || band === "student") return ["adult_non_veg", "adult_veg"];
  if (band === "under5") return ["kid_non_veg", "kid_veg"];
  if (age === null || age === undefined || Number.isNaN(age) || age >= minAdultAge)
    return ["adult_non_veg", "adult_veg", "kid_non_veg", "kid_veg"];
  return ["kid_non_veg", "kid_veg"];
}

/**
 * Make a requested preference valid for this person — the server's last word.
 * Never refuses and never changes the diet when it can keep it: an 8-year-old
 * sent "veg" becomes "kid_veg". A child sent "none" or the old "kid" gets a kid
 * plate with the diet left open ("kid") — never a guessed diet; an under-5
 * always gets one.
 * Adults/students keep "none" (a no-food pass) and an unknown value → "none".
 */
export function coerceFoodPref(
  requested: string | null | undefined,
  band: PlateBand,
  age: number | null | undefined,
  minAdultAge = DEFAULT_ADULT_MEAL_MIN_AGE,
  /** children only: allow "no meal" (the walk-in desk offers it) */
  kidMayHaveNone = false
): FoodPref {
  const choices = plateChoices(band, age, minAdultAge);
  const isChild = band === "youth" || band === "under5";
  if (!isFoodPref(requested) || requested === "none") {
    if (!isChild) return "none";
    if (kidMayHaveNone && band === "youth" && requested === "none") return "none";
    // A child always eats, but we were not told veg or non-veg — record a kid
    // plate with the diet left open rather than guess one.
    return "kid";
  }
  const plate = plateOf(requested)!;
  if (choices.includes(plate)) return requested;
  // keep the diet, change the size
  const veg = requested === "veg" || requested === "kid_veg";
  if (requested === "kid") {
    // diet unknown; a child keeps the legacy value only if they can't choose
    return isChild ? "kid" : "non_veg";
  }
  const want: Plate = isChild ? (veg ? "kid_veg" : "kid_non_veg") : veg ? "adult_veg" : "adult_non_veg";
  return prefOf(choices.includes(want) ? want : choices[0]);
}

/** Count of plates by type, with a total. */
export type PlateCounts = Record<Plate, number> & { total: number };
export function emptyPlateCounts(): PlateCounts {
  return { adult_non_veg: 0, adult_veg: 0, kid_non_veg: 0, kid_veg: 0, kid: 0, total: 0 };
}
export function addPlate(c: PlateCounts, p: Plate, n = 1): PlateCounts {
  c[p] += n;
  c.total += n;
  return c;
}

/** "2 adult non-veg · 1 kid veg" */
export function platesSentence(c: Partial<Record<Plate, number>>): string {
  return PLATES.filter((p) => (c[p] ?? 0) > 0)
    .map((p) => `${c[p]} ${PLATE_LABEL[p].long.toLowerCase().replace(" (veg/non-veg not chosen)", "")}`)
    .join(" · ");
}
