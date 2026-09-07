/**
 * The projection model — shape, heads, and defaults.
 *
 * Spec: spec/14-projections.md. Decoded from the 2024 workbook, whose entire
 * calculation chain is two formulas (ticket revenue and food cost); everything
 * else in that spreadsheet was typed by hand.
 *
 * MONEY IS ALWAYS CENTS, integers, like the rest of this codebase. The workbook
 * is in dollars; seed-2024.ts is the only place that converts.
 *
 * This module is pure data and pure types — no imports, no I/O. It is imported
 * by client components, so it must never reach for the database (the same trap
 * documented in lib/auth/sections.ts).
 */

export type CostHead = "hall" | "setup" | "artists" | "sound" | "food" | "pujo" | "others";
export type RevenueHead =
  | "footfall"
  | "stalls"
  | "corporate"
  | "individual"
  | "magazine"
  | "carry_forward";
export type Head = CostHead | RevenueHead;

/** The three people-types the 2024 sheet counts separately, because they cost
 *  and earn completely different amounts. */
export type Segment = "withFood" | "withoutFood" | "kids";
export const SEGMENTS: Segment[] = ["withFood", "withoutFood", "kids"];

/**
 * How sure we are of a line. This exists because the 2024 workbook's headline
 * revenue silently included three *expected* sponsors that its own roll-up
 * excluded — a $15,000 disagreement that turned a −$6,727 year into a
 * "+$8,273 profit". Confidence is a property of the line, so it can never
 * again depend on which row a formula happened to stop at.
 */
export type Confidence = "confirmed" | "expected" | "stretch";
export const CONFIDENCE_WEIGHT: Record<Confidence, number> = {
  confirmed: 1,
  expected: 0.6,
  stretch: 0.25,
};

/** Where a line's "actual" comes from. The ledger is read-only to us. */
export type ActualSource =
  | "manual"
  | "ledger:registration"
  | "ledger:donation"
  | "ledger:membership"
  | "ledger:fees";

export type ProjectionDay = {
  key: string;
  label: string;
  /** The S4/S5 lever: "what if we don't do Friday at all". */
  enabled: boolean;
  /** computed = driven by the attendance/price/food drivers.
   *  manual   = a flat line instead, which is how 2024 treated Kali puja. */
  driverMode: "computed" | "manual";
  attendance: Record<Segment, number>;
  /** Per-person ticket price in cents, per segment. 2024 charged kids nothing. */
  price: Record<Segment, number>;
  /** Per-person food cost in cents. Adult cost is the three meals summed. */
  foodCost: { breakfast: number; lunch: number; dinner: number; kid: number };
};

export type Line = {
  id: string;
  head: Head;
  label: string;
  amountCents: number;
  confidence: Confidence;
  /** Driven by the model, not typed: the footfall revenue line and the main
   *  food cost line. Shown locked in the UI with a "driven by attendance" tag. */
  computed?: boolean;
  actualCents?: number | null;
  actualSource?: ActualSource;
  /** Stalls only — the sheet's "No of tables" column. */
  tables?: number;
  /** Pinned by a super admin: excluded from the gap closer and held fixed in
   *  the Monte Carlo. "The hall contract is signed, stop offering to change it." */
  locked?: boolean;
  note?: string;
};

/**
 * Global multipliers, applied on top of the entered values and reversible in
 * one click. Percentages, so 100 = unchanged.
 */
export type Modifiers = {
  attendancePct: number;
  pricePct: number;
  costPct: number;
  sponsorshipPct: number;
};

export const NEUTRAL_MODIFIERS: Modifiers = {
  attendancePct: 100,
  pricePct: 100,
  costPct: 100,
  sponsorshipPct: 100,
};

export type ProjectionModel = {
  version: 1;
  year: number;
  days: ProjectionDay[];
  /** The sheet's two magic numbers, named at last. foodPct was labelled "10%"
   *  in 2024 and was actually 30. */
  buffers: { foodPct: number; nonFoodUpliftPct: number };
  modifiers: Modifiers;
  costLines: Line[];
  revenueLines: Line[];
  /** "Left over from Pratima" — cash in hand before the year starts. Distinct
   *  from the carry_forward REVENUE head; the 2024 sheet had both. */
  carryInCents: number;
  /** What the committee wants to end the year with. Gap closer targets this. */
  targetProfitCents: number;
  notes?: string;
};

// ── head metadata (labels, slider ranges, ordering) ──────────────

export type HeadMeta = {
  key: Head;
  label: string;
  hint: string;
  /** Slider bounds in cents, anchored on 2024 actuals ±50% (spec §10). */
  min: number;
  max: number;
  step: number;
};

const K = 100_00; // $100 in cents, the usual step

export const COST_HEADS: HeadMeta[] = [
  { key: "hall", label: "Hall rental", hint: "Venue, electrical points, and the Kali puja hall", min: 0, max: 2_900_000, step: K },
  { key: "setup", label: "Set up & décor", hint: "Stage, chairs, tables, pipe & drape, decoration", min: 0, max: 2_000_000, step: K },
  { key: "artists", label: "Artists", hint: "Performer fees, per day", min: 0, max: 3_200_000, step: K },
  { key: "sound", label: "Sound & light", hint: "The single largest line nobody negotiates", min: 0, max: 1_200_000, step: K },
  { key: "food", label: "Food", hint: "Driven by attendance — set cost per head below", min: 0, max: 6_000_000, step: K },
  { key: "pujo", label: "Pujo", hint: "Flowers, sweets, purohit", min: 0, max: 600_000, step: 50_00 },
  { key: "others", label: "Others", hint: "Transport, magazine print, gifts, card fees", min: 0, max: 1_200_000, step: 50_00 },
];

export const REVENUE_HEADS: HeadMeta[] = [
  { key: "footfall", label: "Footfall", hint: "Ticket revenue — driven by attendance and price", min: 0, max: 12_000_000, step: K },
  { key: "stalls", label: "Stalls", hint: "Vendor tables — count × rate", min: 0, max: 2_000_000, step: 25_00 },
  { key: "corporate", label: "Corporate sponsors", hint: "Companies. Nearly pure margin.", min: 0, max: 2_500_000, step: 50_00 },
  { key: "individual", label: "Individual sponsors", hint: "Named patrons. Nearly pure margin.", min: 0, max: 2_500_000, step: 50_00 },
  { key: "magazine", label: "Magazine", hint: "Advertisement sponsorship in the souvenir", min: 0, max: 1_000_000, step: 25_00 },
  { key: "carry_forward", label: "Carry forward", hint: "Last year's leftover, counted as income", min: 0, max: 2_500_000, step: K },
];


/** Sponsorship heads — what the sponsorshipPct modifier scales. */
export const SPONSORSHIP_HEADS: RevenueHead[] = ["corporate", "individual", "magazine"];

export const SEGMENT_LABEL: Record<Segment, string> = {
  withFood: "With food",
  withoutFood: "Without food",
  kids: "Kids under 12",
};

export function newId(): string {
  // crypto.randomUUID exists in both the Node and browser runtimes this app targets.
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `l${Date.now()}${Math.random()}`;
}

/** Dollars → cents, rounded. The workbook is the only source of dollars. */
export function d(dollars: number): number {
  return Math.round(dollars * 100);
}
