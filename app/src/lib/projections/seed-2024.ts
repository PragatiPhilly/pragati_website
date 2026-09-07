/**
 * The 2024 workbook, as data.
 *
 * Transcribed from `PnL_Model_2026 2.xlsx`, sheets 2024-Summary-Scenario1..5.
 * Every figure here appears in that file; nothing is invented. The engine fed
 * these values reproduces each sheet's own totals to the cent, which is what
 * tests/projections.test.ts asserts.
 *
 * Scenario 2 is the base; the other four are expressed as diffs from it,
 * because that is what they actually are — three levers in combination
 * (Friday on/off, hall deal, attendance optimism). See spec §1.2.
 */
import {
  d,
  NEUTRAL_MODIFIERS,
  type Confidence,
  type Line,
  type ProjectionDay,
  type ProjectionModel,
  type Head,
} from "./types";

let n = 0;
const L = (head: Head, label: string, dollars: number, extra: Partial<Line> = {}): Line => ({
  id: `s24-${++n}`,
  head,
  label,
  amountCents: d(dollars),
  confidence: "confirmed" as Confidence,
  ...extra,
});

// ── drivers ─────────────────────────────────────────────────────
// Prices: with food 40/90/45, without food 30/60/20. Kids were charged
// NOTHING in 2024 and still ate — which is why every kid is a loss.
// Food cost per head: Fri 0+0+12, Sat 4+10+16, Sun 4+16+16; kids 7/15/15.
const day = (
  key: string,
  label: string,
  att: [number, number, number],
  price: [number, number, number],
  food: [number, number, number, number]
): ProjectionDay => ({
  key,
  label,
  enabled: true,
  driverMode: "computed",
  attendance: { withFood: att[0], withoutFood: att[1], kids: att[2] },
  price: { withFood: d(price[0]), withoutFood: d(price[1]), kids: d(price[2]) },
  foodCost: { breakfast: d(food[0]), lunch: d(food[1]), dinner: d(food[2]), kid: d(food[3]) },
});

function baseDays(): ProjectionDay[] {
  return [
    day("fri", "Friday", [120, 30, 38], [40, 30, 0], [0, 0, 12, 7]),
    day("sat", "Saturday", [270, 125, 70], [90, 60, 0], [4, 10, 16, 15]),
    day("sun", "Sunday", [200, 100, 53], [45, 20, 0], [4, 16, 16, 15]),
    {
      // Kali puja was never driver-driven in 2024 — a flat $4,000 revenue line
      // and a flat $5,000 food line. Modelled as `manual` so the engine leaves
      // it alone and the sheet still reconciles.
      ...day("kalipuja", "Kali puja", [60, 0, 30], [0, 0, 0], [0, 0, 20, 10]),
      driverMode: "manual",
    },
  ];
}

function baseCostLines(): Line[] {
  n = 0;
  return [
    L("hall", "Hall rental", 12000, { note: "100% paid including refundable deposit" }),
    L("hall", "Electrical points + others in hall", 1000),
    L("hall", "Kali puja — hall", 1500),
    L("setup", "Stage + chairs + tables + pipe & drape", 12000),
    L("setup", "Decoration", 1000),
    L("artists", "Artists (Fakira + Sahana + Sanchita)", 21000, { note: "Fri 8,000 · Sat 8,500 · Sun 4,500" }),
    L("sound", "Sound & light", 5500),
    // The computed line. Its amount is ignored by the engine — the value here
    // is the 2024 result, kept so the row reads correctly before a recalc.
    L("food", "Food (breakfast + lunch + dinner)", 24506.3, { computed: true, note: "Driven by attendance × cost per head × buffer" }),
    L("food", "Artist hotel + food", 1200),
    L("food", "Tea / coffee / water / disposables / people", 4000),
    L("food", "Kali puja — food", 5000),
    L("pujo", "Puja items (flowers, sweets) + purohit", 2000),
    L("others", "Misc (U-Haul, transport, deposits)", 1000),
    L("others", "Card / PayPal processing deduction", 1600, { actualSource: "ledger:fees" }),
    L("others", "Magazine print", 650.6, { note: "₹54,000 converted at 83 — printed in India" }),
    L("others", "Gifts and certificates", 1000),
    L("others", "Kali puja — others", 2500),
  ];
}

const STALLS_2024: [string, number, number][] = [
  ["Debi di — Sugar Creation", 700, 1],
  ["Urmi di — Mookherji & Pandeji", 150, 1],
  ["DivSai Boutique — Laxmi", 200, 1],
  ["Vistaar Fashion — saree stall", 350, 1],
  ["Glam of Rish — Charu", 350, 1],
  ["Kinjal — Vani Jewellery", 350, 1],
  ["Preethi — Prakryti Swara jewellery", 175, 1],
  ["Jyothi — Cake Shop", 250, 1],
  ["Sumita + Sambit — Odisha saree & décor", 300, 2],
  ["Sparsh — Debopoma (saree)", 125, 0],
  ["Desi Glams", 350, 0],
  ["Sahid — Dosa Hut + Rizwan's stall", 500, 2],
  ["Obo — Sanjukta Bhowmik", 250, 0],
  ["City of Joy", 200, 0],
  ["Kabob House", 500, 0],
  ["ANV Saree Trunk + Taani Treasures", 200, 0],
  ["La Motif", 375, 0],
  ["Balaji Super Market", 350, 0],
  ["Paanwala", 300, 0],
  ["Ekal", 140, 0],
  ["Gorband", 300, 0],
  ["Muktodhara", 150, 0],
  ["Miyara", 75, 0],
  ["Bangla Bazar", 100, 0],
];

function baseRevenueLines(): Line[] {
  const lines: Line[] = [
    L("carry_forward", "2023 carry forward", 8000),
    // Computed — the engine replaces this with attendance × price.
    L("footfall", "Ticket revenue", 49540, { computed: true, note: "Driven by attendance × price", actualSource: "ledger:registration" }),
    L("footfall", "Kali puja", 4000),

    L("individual", "Sunanda di", 3000),
    L("individual", "Krishna di", 2000),
    L("individual", "Jana di", 1000),
    L("individual", "Atish da", 1000),
    L("individual", "Dilip da", 750),
    L("individual", "Roopali di", 2500),

    L("corporate", "Shanta di", 5000),
    L("corporate", "Sourav — Corp", 1000),
    L("corporate", "Envestment — Kuntal", 0, { confidence: "expected" }),
    L("corporate", "Dragon Gym", 500),
    L("corporate", "NY Life", 0, { confidence: "expected" }),
    L("corporate", "Temple", 700),
    L("corporate", "Brewer Eye", 1250),

    L("magazine", "Magazine sponsorship", 3750, {
      note: "Somnath 500 · Jonak 250 · Subir da 250 · Suparna di 500 · Chandra di 1000 · Sharani 500 · Haimanti 500 · Spandan 250 · Suhita di 250",
    }),
  ];

  for (const [label, amount, tables] of STALLS_2024) {
    lines.push(L("stalls", label, amount, tables ? { tables } : {}));
  }

  // THE THREE ROWS THAT BROKE THE 2024 SHEET. They sat below the roll-up's
  // range, so the headline said 105,730 and the roll-up said 90,730. Here they
  // are ordinary lines flagged `expected`, they are counted exactly once, and
  // the risk panel reports them as unconfirmed. Spec §1.3.1.
  lines.push(L("individual", "Extra individual sponsorship", 5000, { confidence: "expected" }));
  lines.push(L("corporate", "Merck", 5000, { confidence: "expected" }));
  lines.push(L("corporate", "J&J", 5000, { confidence: "expected" }));

  return lines;
}

function base(): ProjectionModel {
  return {
    version: 1,
    year: 2024,
    days: baseDays(),
    // The sheet's row 15 was labelled "with 10% buffer" and multiplied by 1.3.
    buffers: { foodPct: 30, nonFoodUpliftPct: 10 },
    modifiers: { ...NEUTRAL_MODIFIERS },
    costLines: baseCostLines(),
    revenueLines: baseRevenueLines(),
    carryInCents: d(5800), // "Left over from Pratima"
    targetProfitCents: 0,
  };
}

// ── helpers for expressing a scenario as a diff ──────────────────

function setLine(m: ProjectionModel, side: "costLines" | "revenueLines", label: string, dollars: number) {
  const lines = m[side].map((l) => (l.label === label ? { ...l, amountCents: d(dollars) } : l));
  return { ...m, [side]: lines } as ProjectionModel;
}

function setAttendance(m: ProjectionModel, key: string, att: [number, number, number]) {
  return {
    ...m,
    days: m.days.map((day) =>
      day.key === key
        ? { ...day, attendance: { withFood: att[0], withoutFood: att[1], kids: att[2] } }
        : day
    ),
  };
}

function disableDay(m: ProjectionModel, key: string) {
  return { ...m, days: m.days.map((day) => (day.key === key ? { ...day, enabled: false } : day)) };
}

function dropLines(m: ProjectionModel, labels: string[]) {
  return { ...m, revenueLines: m.revenueLines.filter((l) => !labels.includes(l.label)) };
}

/** The three sponsors that existed only on Scenario 2. */
const LATE_SPONSORS = ["Extra individual sponsorship", "Merck", "J&J"];

// ── the five 2024 scenarios ─────────────────────────────────────

export type SeedScenario = {
  name: string;
  description: string;
  model: ProjectionModel;
  isBaseline?: boolean;
};

export function seedScenarios2024(): SeedScenario[] {
  // S2 — full three days, optimistic attendance, cheap hall + own stage.
  const s2 = base();

  // S3 — full three days, conservative attendance, expensive all-in hall.
  let s3 = dropLines(base(), LATE_SPONSORS);
  s3 = setLine(s3, "costLines", "Hall rental", 19000);
  s3 = setAttendance(s3, "fri", [120, 30, 24]);
  s3 = setAttendance(s3, "sat", [200, 100, 50]);
  s3 = setAttendance(s3, "sun", [180, 80, 30]);

  // S4 — drop Friday, venue provides the setup, optimistic attendance.
  let s4 = dropLines(base(), LATE_SPONSORS);
  s4 = setLine(s4, "costLines", "Electrical points + others in hall", 0);
  s4 = setLine(s4, "costLines", "Stage + chairs + tables + pipe & drape", 0);
  s4 = setLine(s4, "costLines", "Artists (Fakira + Sahana + Sanchita)", 19000);
  s4 = disableDay(s4, "fri");

  // S5 — drop Friday, conservative attendance.
  let s5 = { ...s4 };
  s5 = setAttendance(s5, "sat", [200, 100, 50]);
  s5 = setAttendance(s5, "sun", [180, 80, 30]);

  // S1 — not a plan: committed expenses only, revenue deliberately blank.
  const s1: ProjectionModel = {
    ...base(),
    days: base().days.map((day) => ({ ...day, attendance: { withFood: 0, withoutFood: 0, kids: 0 } })),
    costLines: [
      L("hall", "Hall rental", 13420, { note: "25% paid including refundable deposit" }),
      L("artists", "Artists (Fakira + Sahana + Sanchita)", 14000, { note: "Advance $2,000 paid" }),
      L("food", "Food (breakfast + lunch + dinner)", 0, { computed: true }),
      L("food", "Artist hotel + food", 2000),
      L("sound", "Sound & light", 9000),
      L("setup", "Decoration", 1200),
      L("pujo", "Puja items (flowers, sweets) + purohit", 2500),
      L("others", "Misc (U-Haul, transport, deposits)", 1000),
    ],
    revenueLines: [L("footfall", "Ticket revenue", 0, { computed: true })],
    carryInCents: 0,
  };

  return [
    {
      name: "2024 baseline",
      description:
        "The 2024 workbook as committed: full three days, optimistic attendance, cheap hall with our own stage build. Locked — duplicate it to start a new year.",
      model: s2,
      isBaseline: true,
    },
    {
      name: "2024 · S1 — committed only",
      description: "Not a plan. What we were already on the hook for, with revenue deliberately blank.",
      model: s1,
    },
    {
      name: "2024 · S3 — 3 days, conservative",
      description: "Full three days at the $19,000 all-in hall, conservative attendance. The pessimistic case.",
      model: s3,
    },
    {
      name: "2024 · S4 — no Friday, optimistic",
      description: "Drop Friday and the self-built stage; keep optimistic Saturday and Sunday attendance.",
      model: s4,
    },
    {
      name: "2024 · S5 — no Friday, conservative",
      description: "Drop Friday, conservative attendance. Landed within $85 of break-even.",
      model: s5,
    },
  ];
}

/**
 * The 2024 registration pace, transcribed from the sheet's hand-typed footfall
 * snapshots (columns Z:AD). The event ran 25–27 October 2024, so these are 20,
 * 14 and 6 days out. This is the booking curve the forecast (§11.3) fits.
 *
 * The last snapshot — 1,137 against a plan of 1,096 — means 2024 passed its own
 * projection six days before the doors opened, and no spreadsheet said so.
 */
export const PACE_2024: { daysOut: number; heads: number }[] = [
  { daysOut: 20, heads: 771 },
  { daysOut: 14, heads: 921 },
  { daysOut: 6, heads: 1137 },
];
