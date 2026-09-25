/**
 * The engine has one job before anything else: reproduce the 2024 workbook.
 *
 * Every figure asserted below was read out of `PnL_Model_2026 2.xlsx` — the
 * scenario sheets' own totals, not numbers this code produced. If a change to
 * the engine breaks one of these, the engine is wrong, not the test.
 */
import { describe, it, expect } from "vitest";
import { calculate, marginsFor, setHeadTotal, bakeModifiers } from "../src/lib/projections/engine";
import { seedScenarios2024, PACE_2024 } from "../src/lib/projections/seed-2024";
import {
  defaultDrivers,
  fitPace,
  forecastPace,
  gapAnalysis,
  monteCarlo,
  pertTable,
  riskFlags,
  sobol,
  lhs,
  rng,
} from "../src/lib/projections/forecast";
import type { ProjectionModel } from "../src/lib/projections/types";

const seeds = seedScenarios2024();
const byName = (fragment: string): ProjectionModel =>
  seeds.find((s) => s.name.includes(fragment))!.model;

const S2 = byName("2024 baseline"); // full 3 days, optimistic — workbook Scenario 2
const S1 = byName("S1");
const S3 = byName("S3");
const S4 = byName("S4");
const S5 = byName("S5");

const D = (dollars: number) => Math.round(dollars * 100);
/** The workbook carries a repeating decimal (₹54,000 ÷ 83), so a dollar of
 *  slack is the honest tolerance — not a loose test. */
const near = (actual: number, expectedDollars: number, slackDollars = 1) =>
  expect(Math.abs(actual - D(expectedDollars))).toBeLessThanOrEqual(D(slackDollars));

describe("engine reproduces the 2024 workbook", () => {
  it("computes food cost exactly as row 15 does", () => {
    // (120×12 + 38×7)×1.3 + (270×30 + 70×15)×1.3 + (200×36 + 53×15)×1.3
    expect(calculate(S2).computedFoodCostCents).toBe(D(24506.3));
  });

  it("computes ticket revenue exactly as M10 + M11 do", () => {
    // 38,100 with food + 11,440 without (the ×1.1 uplift)
    expect(calculate(S2).ticketRevenueCents).toBe(D(49540));
  });

  it("matches Scenario 2's expense and revenue totals", () => {
    const r = calculate(S2);
    near(r.totalExpenseCents, 97456.9);
    expect(r.totalRevenueCents).toBe(D(105730));
    near(r.profitCents, 8273.1);
  });

  it.each([
    ["Scenario 1 — committed only", S1, 43120, 0],
    ["Scenario 3 — 3 days, conservative", S3, 99825.0, 81440],
    ["Scenario 4 — no Friday, optimistic", S4, 80239.1, 84940],
    ["Scenario 5 — no Friday, conservative", S5, 75734.6, 75650],
  ])("matches %s", (_name, model, expense, revenue) => {
    const r = calculate(model);
    near(r.totalExpenseCents, expense);
    near(r.totalRevenueCents, revenue);
  });

  it("lands Scenario 5 within $85 of break-even, as the sheet did", () => {
    near(calculate(S5).profitCents, -84.6, 1);
  });

  it("head roll-ups always equal the totals — the 2024 bug cannot recur", () => {
    for (const m of [S1, S2, S3, S4, S5]) {
      const r = calculate(m);
      const revSum = Object.values(r.revenueByHead).reduce((a, b) => a + b, 0);
      const costSum = Object.values(r.costByHead).reduce((a, b) => a + b, 0);
      expect(revSum).toBe(r.totalRevenueCents);
      expect(costSum).toBe(r.totalExpenseCents);
      expect(r.profitCents).toBe(r.totalRevenueCents - r.totalExpenseCents);
    }
  });

  it("reports the $15,000 of unconfirmed revenue that flattered Scenario 2", () => {
    const r = calculate(S2);
    expect(r.unconfirmedRevenueCents).toBe(D(15000));
    // Without it, the celebrated +$8,273 is a loss.
    expect(r.profitCents - r.unconfirmedRevenueCents).toBeLessThan(0);
  });
});

describe("contribution margin — the truth the sheet buried", () => {
  const margins = marginsFor(S2);
  const cell = (day: string, segment: string) => margins.find((m) => m.dayKey === day && m.segment === segment)!;

  it("a $45 Sunday plate loses $1.80", () => {
    expect(cell("sun", "withFood").marginCents).toBe(D(-1.8));
  });

  it("kids lose money on every day, because they eat and pay nothing", () => {
    expect(cell("fri", "kids").marginCents).toBe(D(-9.1));
    expect(cell("sat", "kids").marginCents).toBe(D(-19.5));
    expect(cell("sun", "kids").marginCents).toBe(D(-19.5));
  });

  it("Saturday is the day that pays for the year", () => {
    expect(cell("sat", "withFood").marginCents).toBe(D(51));
  });

  it("without-food guests carry the ×1.1 uplift and no food cost", () => {
    expect(cell("sat", "withoutFood").marginCents).toBe(D(66));
    expect(cell("sat", "withoutFood").foodCents).toBe(0);
  });
});

describe("break-even", () => {
  it("scaling attendance to the break-even point lands profit on target", () => {
    const r = calculate(S2);
    expect(r.breakEven.reachable).toBe(true);
    const scaled: ProjectionModel = {
      ...S2,
      modifiers: { ...S2.modifiers, attendancePct: 100 * r.breakEven.scale },
    };
    // Within a dollar or two of zero, allowing for integer head counts.
    expect(Math.abs(calculate(scaled).profitCents)).toBeLessThan(D(120));
  });

  it("reports unreachable when every segment loses money per head", () => {
    const doomed: ProjectionModel = {
      ...S2,
      days: S2.days.map((d) => ({ ...d, price: { withFood: 0, withoutFood: 0, kids: 0 } })),
    };
    expect(calculate(doomed).breakEven.reachable).toBe(false);
  });
});

describe("modifiers", () => {
  it("attendance and price modifiers multiply revenue as expected", () => {
    const base = calculate(S2).ticketRevenueCents;
    const up = calculate({ ...S2, modifiers: { ...S2.modifiers, attendancePct: 110 } }).ticketRevenueCents;
    expect(up).toBeGreaterThan(base);
    expect(up / base).toBeCloseTo(1.1, 2);
  });

  it("baking modifiers in leaves the totals unchanged and resets them to 100", () => {
    const modified: ProjectionModel = { ...S2, modifiers: { attendancePct: 115, pricePct: 105, costPct: 108, sponsorshipPct: 90 } };
    const before = calculate(modified);
    const baked = bakeModifiers(modified);
    const after = calculate(baked);
    expect(baked.modifiers).toEqual({ attendancePct: 100, pricePct: 100, costPct: 100, sponsorshipPct: 100 });
    // Rounding to whole guests and whole cents moves this a little, never much.
    expect(Math.abs(after.profitCents - before.profitCents)).toBeLessThan(D(500));
  });

  it("a head slider moves the head total and nothing else", () => {
    const next = setHeadTotal(S2, "artists", D(15000));
    const r = calculate(next);
    expect(r.costByHead.artists).toBe(D(15000));
    expect(r.costByHead.hall).toBe(calculate(S2).costByHead.hall);
  });

  it("a head slider respects pinned lines", () => {
    const pinned: ProjectionModel = {
      ...S2,
      costLines: S2.costLines.map((l) => (l.label === "Hall rental" ? { ...l, locked: true } : l)),
    };
    const next = setHeadTotal(pinned, "hall", D(30000));
    const hall = next.costLines.find((l) => l.label === "Hall rental")!;
    expect(hall.amountCents).toBe(D(12000)); // untouched
    expect(calculate(next).costByHead.hall).toBe(D(30000));
  });
});

describe("risk flags and the gap closer", () => {
  it("flags the negative-margin segments and the unconfirmed revenue", () => {
    const flags = riskFlags(S2, calculate(S2));
    expect(flags.find((f) => f.key === "margin")?.level).toBe("critical");
    expect(flags.find((f) => f.key === "unconfirmed")?.level).toBe("critical");
  });

  it("offers ways to close a gap, and refuses the ones that would make it worse", () => {
    const short: ProjectionModel = { ...S2, targetProfitCents: D(40000) };
    const g = gapAnalysis(short, calculate(short));
    expect(g.gapCents).toBeGreaterThan(0);
    expect(g.options.length).toBeGreaterThan(2);
    const sponsorship = g.options.find((o) => o.key === "sponsorship")!;
    expect(sponsorship.feasible).toBe(true);
  });

  it("says nothing when the plan is already on target", () => {
    const onTarget: ProjectionModel = { ...S2, targetProfitCents: calculate(S2).profitCents };
    expect(gapAnalysis(onTarget, calculate(onTarget)).options).toHaveLength(0);
  });
});

describe("the predictive layer", () => {
  it("PERT quantiles are monotone and span the band", () => {
    const t = pertTable({ min: 0.7, likely: 1, max: 1.3 }, 64);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1]);
    expect(t[0]).toBeGreaterThanOrEqual(0.7);
    expect(t[t.length - 1]).toBeLessThanOrEqual(1.3);
    // λ=4 PERT mean = (min + 4·likely + max)/6 = 1.0 here.
    const mean = t.reduce((a, b) => a + b, 0) / t.length;
    expect(mean).toBeCloseTo(1.0, 1);
  });

  it("Latin Hypercube covers every stratum exactly once per dimension", () => {
    const rows = lhs(50, 3, rng(7));
    for (let d = 0; d < 3; d++) {
      const strata = new Set(rows.map((r) => Math.floor(r[d] * 50)));
      expect(strata.size).toBe(50);
    }
  });

  it("the Monte Carlo is deterministic for the same scenario", () => {
    const drivers = defaultDrivers(S2);
    const a = monteCarlo(S2, drivers, { samples: 300, seed: 42 });
    const b = monteCarlo(S2, drivers, { samples: 300, seed: 42 });
    expect(a.p50).toBe(b.p50);
    expect(a.probSurplus).toBe(b.probSurplus);
  });

  it("the plan sits inside its own distribution, and Scenario 2 sits high in it", () => {
    const mc = monteCarlo(S2, defaultDrivers(S2), { samples: 600, seed: 1 });
    expect(mc.p10).toBeLessThanOrEqual(mc.p50);
    expect(mc.p50).toBeLessThanOrEqual(mc.p90);
    expect(mc.probSurplus).toBeGreaterThanOrEqual(0);
    expect(mc.probSurplus).toBeLessThanOrEqual(1);
    expect(mc.planPercentile).toBeGreaterThanOrEqual(0);
    expect(mc.planPercentile).toBeLessThanOrEqual(1);
  });

  it("Sobol indices are bounded and rank attendance among the top drivers", () => {
    const idx = sobol(S2, defaultDrivers(S2), { samples: 96 });
    expect(idx.length).toBeGreaterThan(3);
    for (const i of idx) {
      expect(i.first).toBeGreaterThanOrEqual(0);
      expect(i.total).toBeGreaterThanOrEqual(0);
      expect(i.total).toBeLessThanOrEqual(1.5); // estimator noise at this sample size
    }
    expect(idx.slice(0, 3).map((i) => i.key)).toContain("attendance");
  });

  it("the pace curve is monotone and reaches 1 on event day", () => {
    const fit = fitPace(PACE_2024);
    let prev = -1;
    for (let d = 60; d >= 0; d--) {
      const f = fit.fraction(d);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(fit.fraction(0)).toBeCloseTo(1, 5);
  });

  it("the forecast moves toward this year's own trend as snapshots arrive", () => {
    const fit = fitPace(PACE_2024);
    const planned = 1096;
    const none = forecastPace(fit, [], planned);
    expect(none.forecastFinal).toBe(planned);
    expect(none.confidence).toBe(0);

    const one = forecastPace(fit, [{ daysOut: 20, heads: 900 }], planned);
    const five = forecastPace(
      fit,
      [20, 17, 14, 10, 6].map((daysOut, i) => ({ daysOut, heads: 900 + i * 90 })),
      planned
    );
    expect(five.confidence).toBeGreaterThan(one.confidence);
    // Running ahead of the plan should forecast above it.
    expect(five.forecastFinal).toBeGreaterThan(planned);
    expect(five.low).toBeLessThanOrEqual(five.forecastFinal);
    expect(five.high).toBeGreaterThanOrEqual(five.forecastFinal);
  });

  it("reproduces the 2024 finding: the year passed its own projection before the doors opened", () => {
    const fit = fitPace(PACE_2024);
    const f = forecastPace(fit, PACE_2024, 1096);
    expect(f.forecastFinal).toBeGreaterThan(1096);
  });
});

describe("CSV export", () => {
  it("carries the summary, the drivers, the margins and every line", async () => {
    const { toCsv, csvFilename } = await import("../src/lib/projections/export");
    const csv = toCsv(S2, calculate(S2), "2024 baseline");
    // dollars, not cents — this opens in Excel
    expect(csv).toContain("Total revenue,105730.00");
    expect(csv).toContain("Total expenses,97456.90");
    expect(csv).toContain("Profit / loss,8273.10");
    expect(csv).toContain("DRIVERS");
    expect(csv).toContain("CONTRIBUTION MARGIN PER GUEST");
    // the Sunday loss is in the file, not just on the screen
    expect(csv).toMatch(/Sunday,With food,45\.00,46\.80,-1\.80/);
    expect(csv).toContain("REVENUE LINES");
    expect(csv).toContain("COST LINES");
    // every non-computed line appears exactly once
    for (const l of [...S2.costLines, ...S2.revenueLines].filter((x) => !x.computed)) {
      expect(csv).toContain(l.label.replace(/"/g, '""'));
    }
    expect(csvFilename(S2, "2024 baseline")).toMatch(/^pragati-projection-2024-2024-baseline-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it("escapes commas and quotes so the columns do not shift", async () => {
    const { toCsv } = await import("../src/lib/projections/export");
    const tricky: ProjectionModel = {
      ...S2,
      revenueLines: [
        ...S2.revenueLines,
        { id: "x1", head: "corporate", label: 'Acme, Inc. "the sponsor"', amountCents: 100000, confidence: "confirmed" },
      ],
    };
    const csv = toCsv(tricky, calculate(tricky), "test");
    expect(csv).toContain('"Acme, Inc. ""the sponsor"""');
  });

  it("records that modifiers were applied, so a printed sheet is not misread", async () => {
    const { toCsv } = await import("../src/lib/projections/export");
    const modified: ProjectionModel = { ...S2, modifiers: { ...S2.modifiers, attendancePct: 120 } };
    expect(toCsv(modified, calculate(modified), "t")).toContain("What-if modifiers applied");
    expect(toCsv(S2, calculate(S2), "t")).not.toContain("What-if modifiers applied");
  });
});

describe("building from live site data", () => {
  const makePull = (over: Record<string, unknown> = {}) => ({
    eventId: "e1",
    eventName: "Durga Pujo 2026",
    days: [
      { key: "fri", label: "Friday", date: "2026-10-16" },
      { key: "sat", label: "Saturday", date: "2026-10-17" },
      { key: "sun", label: "Sunday", date: "2026-10-18" },
    ],
    attendance: {
      fri: { withFood: 8, withoutFood: 3, kids: 7 },
      sat: { withFood: 13, withoutFood: 5, kids: 10 },
      sun: { withFood: 9, withoutFood: 3, kids: 9 },
    },
    realisedPrice: {
      fri: { withFood: 3500, withoutFood: 2400, kids: 900 },
      sat: { withFood: 3900, withoutFood: 2600, kids: 1000 },
      sun: { withFood: 3700, withoutFood: 2400, kids: 950 },
    },
    listPrice: {
      fri: { withFood: 5000, withoutFood: 3500, kids: 1200 },
      sat: { withFood: 5000, withoutFood: 3500, kids: 1200 },
      sun: { withFood: 5000, withoutFood: 3500, kids: 1200 },
    },
    ticketRevenueCents: 161000,
    ticketOutstandingCents: 0,
    donationCents: 75000,
    donationLines: [{ id: "d1", label: "Dragon Gym", amountCents: 50000 }],
    membershipCents: 11000,
    feeCents: 4830,
    totalHeads: 67,
    ticketFaceValueCents: 161000,
    asOf: new Date().toISOString(),
    ...over,
  });

  it("classifies a sold ticket into the right segment", async () => {
    const { classifySegment } = await import("../src/lib/projections/from-live");
    // THE BUG THIS GUARDS: child_5_18 is this app's youth band. An earlier list
    // named bands that do not exist here, so every youth counted as an adult.
    expect(classifySegment({ ageBand: "child_5_18", foodPref: "kid", typeWithFood: true })).toBe("kids");
    expect(classifySegment({ ageBand: "child_under_5", foodPref: "kid", typeWithFood: true })).toBe("kids");
    expect(classifySegment({ ageBand: "adult", foodPref: "non_veg", typeWithFood: true })).toBe("withFood");
    expect(classifySegment({ ageBand: "adult", foodPref: "none", typeWithFood: false })).toBe("withoutFood");
    // a with-food ticket type whose buyer picked nothing still is not fed
    expect(classifySegment({ ageBand: "adult", foodPref: null, typeWithFood: true })).toBe("withoutFood");
    expect(classifySegment({ ageBand: "student", foodPref: "veg", typeWithFood: true })).toBe("withFood");
    expect(classifySegment({ ageBand: "concert", foodPref: "none", typeWithFood: false })).toBe("withoutFood");
    // an add-on is a parking space, not a person
    expect(classifySegment({ ageBand: "addon", foodPref: "none", typeWithFood: false })).toBeNull();
  });

  it("takes attendance and realised prices from the site, and costs from last year", async () => {
    const { buildFromLive } = await import("../src/lib/projections/from-live");
    const { model, dayProvenance, summary } = buildFromLive(makePull(), {
      year: 2026,
      carryFrom: S2,
      escalationPct: 0,
      includeDonations: true,
      includeMembership: false,
    });

    const sat = model.days.find((d) => d.key === "sat")!;
    expect(sat.attendance).toEqual({ withFood: 13, withoutFood: 5, kids: 10 });
    expect(sat.price.withFood).toBe(3900); // what people PAID, not the list price
    expect(dayProvenance.sat.attendance).toBe("live");
    // catering is never sold through this website
    expect(dayProvenance.sat.foodCost).toBe("carried");
    expect(sat.foodCost.dinner).toBe(S2.days.find((d) => d.key === "sat")!.foodCost.dinner);

    // the hall is last year's number, untouched
    const hall = model.costLines.find((l) => l.label === "Hall rental")!;
    expect(hall.amountCents).toBe(S2.costLines.find((l) => l.label === "Hall rental")!.amountCents);
    // card fees are the one cost the ledger knows exactly
    const fees = model.costLines.find((l) => l.actualSource === "ledger:fees")!;
    expect(fees.amountCents).toBe(4830);
    expect(summary.headsPulled).toBe(67);
  });

  it("zeroes last year's sponsors instead of carrying their money forward", async () => {
    const { buildFromLive } = await import("../src/lib/projections/from-live");
    const { model } = buildFromLive(makePull(), {
      year: 2026,
      carryFrom: S2,
      escalationPct: 0,
      includeDonations: false,
      includeMembership: false,
    });
    const sponsors = model.revenueLines.filter(
      (l) => (l.head === "corporate" || l.head === "individual" || l.head === "magazine") && !l.computed
    );
    expect(sponsors.length).toBeGreaterThan(5);
    // the names survive as a checklist; not one dollar does
    expect(sponsors.every((l) => l.amountCents === 0)).toBe(true);
    expect(sponsors.every((l) => l.confidence === "expected")).toBe(true);
    expect(sponsors.some((l) => l.label === "Sunanda di")).toBe(true);
    // stalls are not sponsorship — they carry
    expect(model.revenueLines.filter((l) => l.head === "stalls").some((l) => l.amountCents > 0)).toBe(true);
  });

  it("escalation reaches the carried costs AND the per-head food cost", async () => {
    const { buildFromLive } = await import("../src/lib/projections/from-live");
    const { model } = buildFromLive(makePull(), {
      year: 2026,
      carryFrom: S2,
      escalationPct: 10,
      includeDonations: false,
      includeMembership: false,
    });
    const hall = model.costLines.find((l) => l.label === "Hall rental")!;
    expect(hall.amountCents).toBe(Math.round(D(12000) * 1.1));
    const sat = model.days.find((d) => d.key === "sat")!;
    expect(sat.foodCost.dinner).toBe(Math.round(D(16) * 1.1));
  });

  it("falls back to last year when nothing has sold yet", async () => {
    const { buildFromLive } = await import("../src/lib/projections/from-live");
    const empty = makePull({
      attendance: { fri: { withFood: 0, withoutFood: 0, kids: 0 } },
      realisedPrice: { fri: { withFood: 0, withoutFood: 0, kids: 0 } },
      listPrice: { fri: { withFood: 0, withoutFood: 0, kids: 0 } },
      days: [{ key: "fri", label: "Friday", date: "2026-10-16" }],
      ticketRevenueCents: 0,
      totalHeads: 0,
    });
    const { model, dayProvenance } = buildFromLive(empty, {
      year: 2026,
      carryFrom: S2,
      escalationPct: 0,
      includeDonations: false,
      includeMembership: false,
    });
    expect(dayProvenance.fri.attendance).toBe("carried");
    const fri = model.days.find((d) => d.key === "fri")!;
    expect(fri.attendance).toEqual(S2.days.find((d) => d.key === "fri")!.attendance);
    // the days last year had that this event does not are kept, disabled
    expect(model.days.find((d) => d.key === "kalipuja")?.enabled).toBe(false);
  });

  it("adds website gifts only when asked, and never invents a carry-in", async () => {
    const { buildFromLive } = await import("../src/lib/projections/from-live");
    const withGifts = buildFromLive(makePull(), { year: 2026, carryFrom: S2, escalationPct: 0, includeDonations: true, includeMembership: true });
    const without = buildFromLive(makePull(), { year: 2026, carryFrom: S2, escalationPct: 0, includeDonations: false, includeMembership: false });
    expect(withGifts.model.revenueLines.some((l) => l.label === "Website donations (unallocated)")).toBe(true);
    expect(withGifts.model.revenueLines.some((l) => l.label === "Membership dues")).toBe(true);
    expect(without.model.revenueLines.some((l) => l.label.startsWith("Website donations"))).toBe(false);
    // last year's closing cash is a bank fact nobody has typed yet
    expect(withGifts.model.carryInCents).toBe(0);
  });

  it("fills only the ledger-backed lines when pulling actuals", async () => {
    const { applyActuals } = await import("../src/lib/projections/from-live");
    const typed: ProjectionModel = {
      ...S2,
      costLines: S2.costLines.map((l) => (l.label === "Hall rental" ? { ...l, actualCents: D(13333) } : l)),
    };
    const { model, filled } = applyActuals(typed, makePull());
    expect(filled).toBeGreaterThan(0);
    // the computed ticket line takes the ledger figure
    expect(model.revenueLines.find((l) => l.computed)!.actualCents).toBe(161000);
    expect(model.costLines.find((l) => l.actualSource === "ledger:fees")!.actualCents).toBe(4830);
    // a number a human typed is never overwritten
    expect(model.costLines.find((l) => l.label === "Hall rental")!.actualCents).toBe(D(13333));
    // and a line the ledger knows nothing about stays empty
    expect(model.costLines.find((l) => l.label === "Artists (Fakira + Sahana + Sanchita)")!.actualCents ?? null).toBeNull();
  });
});

describe("safety", () => {
  it("the actuals module exports no mutation", async () => {
    const mod = await import("../src/lib/projections/actuals");
    const names = Object.keys(mod);
    expect(names).toContain("getActuals");
    for (const n of names) {
      expect(n).not.toMatch(/^(set|save|write|update|insert|delete|settle|void)/i);
    }
  });

  it("the engine is pure — calculating never mutates the model", () => {
    const before = JSON.stringify(S2);
    calculate(S2);
    marginsFor(S2);
    gapAnalysis(S2, calculate(S2));
    riskFlags(S2, calculate(S2));
    monteCarlo(S2, defaultDrivers(S2), { samples: 50, seed: 3 });
    expect(JSON.stringify(S2)).toBe(before);
  });
});
