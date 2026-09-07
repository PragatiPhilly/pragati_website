/**
 * The deterministic calculation engine.
 *
 * Pure: no I/O, no database, no React. Runs client-side on every slider drag
 * (it is arithmetic over ~60 rows, so there is no round trip and no debounce)
 * and server-side for saved totals and snapshots. Unit-tested against the 2024
 * workbook's own numbers in tests/projections.test.ts.
 *
 * THE TWO FORMULAS THE WHOLE SPREADSHEET RESTS ON (spec §1.1):
 *   revenueWithFood    = Σ_d withFood[d] × priceWithFood[d]
 *   revenueWithoutFood = Σ_d withoutFood[d] × priceWithoutFood[d] × (1 + uplift)
 *   foodCost[d]        = (withFood[d]×adultFood[d] + kids[d]×kidFood[d]) × (1 + buffer)
 *
 * One rule inherited from the workbook's worst bug: THERE IS EXACTLY ONE TOTAL,
 * computed once, from the head totals. A revenue figure can never again
 * disagree with the sum of its own parts because a formula's range stopped a
 * few rows early.
 */
import {
  CONFIDENCE_WEIGHT,
  COST_HEADS,
  REVENUE_HEADS,
  SEGMENTS,
  SPONSORSHIP_HEADS,
  type CostHead,
  type Line,
  type ProjectionDay,
  type ProjectionModel,
  type RevenueHead,
  type Segment,
} from "./types";

export type MarginCell = {
  dayKey: string;
  dayLabel: string;
  segment: Segment;
  /** Ticket price this person pays, after the no-food uplift and price modifier. */
  priceCents: number;
  /** What feeding them costs, after the buffer. Zero for without-food guests. */
  foodCents: number;
  /** priceCents − foodCents. Negative means every extra sale loses money. */
  marginCents: number;
  heads: number;
};

export type DayResult = {
  key: string;
  label: string;
  enabled: boolean;
  driverMode: "computed" | "manual";
  heads: Record<Segment, number>;
  totalHeads: number;
  ticketRevenueCents: number;
  foodCostCents: number;
  contributionCents: number;
};

export type BreakEven = {
  /** Multiplier on the current attendance mix that lands profit on target. */
  scale: number;
  /** That multiplier applied to today's head count. */
  heads: number;
  currentHeads: number;
  /** False when total contribution per head is ≤ 0 — no amount of attendance
   *  fixes it, which is the single most important thing this can tell you. */
  reachable: boolean;
};

export type EngineResult = {
  days: DayResult[];
  margins: MarginCell[];

  ticketRevenueCents: number;
  computedFoodCostCents: number;

  costByHead: Record<CostHead, number>;
  revenueByHead: Record<RevenueHead, number>;

  totalRevenueCents: number;
  totalExpenseCents: number;
  profitCents: number;
  /** Profit plus the cash we started the year holding. The number that decides
   *  whether next year's committee can pay a deposit. */
  cashAfterCarryInCents: number;

  fixedCostCents: number;
  variableCostCents: number;

  /** Revenue weighted by how sure we are of it (confirmed 1.0 / expected 0.6 /
   *  stretch 0.25) — the honest version of the headline. */
  riskAdjustedRevenueCents: number;
  confirmedRevenueCents: number;
  unconfirmedRevenueCents: number;

  totalHeads: number;
  headsBySegment: Record<Segment, number>;
  contributionPerHeadCents: number;

  breakEven: BreakEven;
};

const zeroCost = (): Record<CostHead, number> =>
  Object.fromEntries(COST_HEADS.map((h) => [h.key, 0])) as Record<CostHead, number>;
const zeroRevenue = (): Record<RevenueHead, number> =>
  Object.fromEntries(REVENUE_HEADS.map((h) => [h.key, 0])) as Record<RevenueHead, number>;

const pct = (n: number) => (Number.isFinite(n) ? n : 100) / 100;
const r = (n: number) => Math.round(n);

/** Adult food cost per head for a day, in cents (breakfast + lunch + dinner). */
export function adultFoodCents(day: ProjectionDay): number {
  const f = day.foodCost;
  return (f.breakfast || 0) + (f.lunch || 0) + (f.dinner || 0);
}

/**
 * A line's effective amount after the global modifiers. Costs scale with
 * costPct; sponsorship revenue with sponsorshipPct; everything else is left
 * alone (you do not inflate last year's leftover).
 */
export function effectiveLineCents(line: Line, model: ProjectionModel, side: "cost" | "revenue"): number {
  const base = line.amountCents || 0;
  if (side === "cost") return r(base * pct(model.modifiers.costPct));
  if (SPONSORSHIP_HEADS.includes(line.head as RevenueHead)) {
    return r(base * pct(model.modifiers.sponsorshipPct));
  }
  return base;
}

/**
 * Per-day, per-segment contribution margin — the truth the 2024 sheet buried.
 * At 2024 prices a Sunday with-food ticket is −$1.80 and a kid is −$19.50: the
 * more you sold, the more you lost.
 */
export function marginsFor(model: ProjectionModel): MarginCell[] {
  const priceM = pct(model.modifiers.pricePct);
  const costM = pct(model.modifiers.costPct);
  const uplift = 1 + (model.buffers.nonFoodUpliftPct || 0) / 100;
  const buffer = 1 + (model.buffers.foodPct || 0) / 100;
  const out: MarginCell[] = [];

  for (const day of model.days) {
    if (!day.enabled || day.driverMode !== "computed") continue;
    const adult = adultFoodCents(day) * costM * buffer;
    const kid = (day.foodCost.kid || 0) * costM * buffer;
    for (const segment of SEGMENTS) {
      const rawPrice = (day.price[segment] || 0) * priceM;
      const priceCents = segment === "withoutFood" ? rawPrice * uplift : rawPrice;
      const foodCents = segment === "withFood" ? adult : segment === "kids" ? kid : 0;
      out.push({
        dayKey: day.key,
        dayLabel: day.label,
        segment,
        priceCents: r(priceCents),
        foodCents: r(foodCents),
        marginCents: r(priceCents - foodCents),
        heads: r((day.attendance[segment] || 0) * pct(model.modifiers.attendancePct)),
      });
    }
  }
  return out;
}

export function calculate(model: ProjectionModel): EngineResult {
  const attM = pct(model.modifiers.attendancePct);
  const priceM = pct(model.modifiers.pricePct);
  const costM = pct(model.modifiers.costPct);
  const uplift = 1 + (model.buffers.nonFoodUpliftPct || 0) / 100;
  const buffer = 1 + (model.buffers.foodPct || 0) / 100;

  const days: DayResult[] = [];
  let ticketRevenueCents = 0;
  let computedFoodCostCents = 0;
  const headsBySegment: Record<Segment, number> = { withFood: 0, withoutFood: 0, kids: 0 };

  for (const day of model.days) {
    const heads = {
      withFood: r((day.attendance.withFood || 0) * attM),
      withoutFood: r((day.attendance.withoutFood || 0) * attM),
      kids: r((day.attendance.kids || 0) * attM),
    };
    // A disabled day contributes nothing at all — no heads, no food, no revenue.
    // That is the whole "drop Friday" lever from scenarios 4 and 5.
    const live = day.enabled && day.driverMode === "computed";

    // Revenue. The no-food uplift is applied per head; it is linear, so this is
    // identical to the sheet's ×1.1 on the subtotal, and it lets each segment
    // carry its own honest margin.
    const rev = live
      ? heads.withFood * (day.price.withFood || 0) * priceM +
        heads.withoutFood * (day.price.withoutFood || 0) * priceM * uplift +
        heads.kids * (day.price.kids || 0) * priceM
      : 0;

    // Food. Without-food guests do not eat; kids eat a cheaper plate.
    const food = live
      ? (heads.withFood * adultFoodCents(day) + heads.kids * (day.foodCost.kid || 0)) * costM * buffer
      : 0;

    if (day.enabled) {
      headsBySegment.withFood += heads.withFood;
      headsBySegment.withoutFood += heads.withoutFood;
      headsBySegment.kids += heads.kids;
    }
    ticketRevenueCents += rev;
    computedFoodCostCents += food;

    days.push({
      key: day.key,
      label: day.label,
      enabled: day.enabled,
      driverMode: day.driverMode,
      heads,
      totalHeads: heads.withFood + heads.withoutFood + heads.kids,
      ticketRevenueCents: r(rev),
      foodCostCents: r(food),
      contributionCents: r(rev - food),
    });
  }

  ticketRevenueCents = r(ticketRevenueCents);
  computedFoodCostCents = r(computedFoodCostCents);

  // ── heads ──────────────────────────────────────────────────────
  const costByHead = zeroCost();
  const revenueByHead = zeroRevenue();

  for (const line of model.costLines) {
    if (line.computed) continue; // replaced by the driver-derived figure below
    costByHead[line.head as CostHead] += effectiveLineCents(line, model, "cost");
  }
  costByHead.food += computedFoodCostCents;

  let confirmed = 0;
  let riskAdjusted = 0;
  for (const line of model.revenueLines) {
    if (line.computed) continue;
    const amount = effectiveLineCents(line, model, "revenue");
    revenueByHead[line.head as RevenueHead] += amount;
    if (line.confidence === "confirmed") confirmed += amount;
    riskAdjusted += amount * CONFIDENCE_WEIGHT[line.confidence];
  }
  revenueByHead.footfall += ticketRevenueCents;
  // Ticket money is as confirmed as revenue gets once it is sold; before the
  // event it is a forecast, but it is OUR forecast, not a sponsor's promise.
  confirmed += ticketRevenueCents;
  riskAdjusted += ticketRevenueCents;

  const totalRevenueCents = r(Object.values(revenueByHead).reduce((a, b) => a + b, 0));
  const totalExpenseCents = r(Object.values(costByHead).reduce((a, b) => a + b, 0));
  const profitCents = totalRevenueCents - totalExpenseCents;

  // ── break-even (spec §11.4) ────────────────────────────────────
  // Hold the current attendance mix and scale it until profit hits target.
  const margins = marginsFor(model);
  const contributionCents = margins.reduce((s, m) => s + m.marginCents * m.heads, 0);
  const totalHeads = headsBySegment.withFood + headsBySegment.withoutFood + headsBySegment.kids;
  const target = model.targetProfitCents || 0;
  // Everything that is not driven by attendance: fixed cost minus non-ticket revenue.
  const fixedCostCents = totalExpenseCents - computedFoodCostCents;
  const nonTicketRevenue = totalRevenueCents - ticketRevenueCents;
  const needed = fixedCostCents - nonTicketRevenue + target;
  const reachable = contributionCents > 0;
  const scale = reachable ? needed / contributionCents : Infinity;

  return {
    days,
    margins,
    ticketRevenueCents,
    computedFoodCostCents,
    costByHead,
    revenueByHead,
    totalRevenueCents,
    totalExpenseCents,
    profitCents,
    cashAfterCarryInCents: profitCents + (model.carryInCents || 0),
    fixedCostCents,
    variableCostCents: computedFoodCostCents,
    riskAdjustedRevenueCents: r(riskAdjusted),
    confirmedRevenueCents: r(confirmed),
    unconfirmedRevenueCents: r(totalRevenueCents - confirmed),
    totalHeads,
    headsBySegment,
    contributionPerHeadCents: totalHeads > 0 ? r(contributionCents / totalHeads) : 0,
    breakEven: {
      scale: reachable ? scale : Infinity,
      heads: reachable ? Math.max(0, r(totalHeads * scale)) : Infinity,
      currentHeads: totalHeads,
      reachable,
    },
  };
}

// ── head-slider plumbing ─────────────────────────────────────────

/** Current total for one head, after modifiers (what the slider displays). */
export function headTotal(model: ProjectionModel, head: string, result: EngineResult): number {
  if (COST_HEADS.some((h) => h.key === head)) return result.costByHead[head as CostHead] ?? 0;
  return result.revenueByHead[head as RevenueHead] ?? 0;
}

/**
 * Move a whole head to a new total by scaling its lines proportionally.
 *
 * Proportional because that is what someone means by dragging "Artists" from
 * 21k to 19k — they are not choosing which performer takes the cut, they are
 * sizing the envelope. Locked lines hold their value and the remainder is
 * spread across the rest; a head of all-zero lines gets the amount on its first
 * unlocked line, so the slider is never a no-op.
 */
export function setHeadTotal(model: ProjectionModel, head: string, targetCents: number): ProjectionModel {
  const side: "cost" | "revenue" = COST_HEADS.some((h) => h.key === head) ? "cost" : "revenue";
  const key = side === "cost" ? "costLines" : "revenueLines";
  const lines = model[key];
  const inHead = lines.filter((l) => l.head === head && !l.computed);
  if (inHead.length === 0) return model;

  const lockedTotal = inHead.filter((l) => l.locked).reduce((s, l) => s + l.amountCents, 0);
  const movable = inHead.filter((l) => !l.locked);
  if (movable.length === 0) return model;

  // The slider shows post-modifier money, so undo the modifier before writing
  // back to the lines — otherwise dragging with a 110% modifier on would
  // silently inflate the stored plan.
  const m =
    side === "cost"
      ? pct(model.modifiers.costPct)
      : SPONSORSHIP_HEADS.includes(head as RevenueHead)
        ? pct(model.modifiers.sponsorshipPct)
        : 1;
  const rawTarget = Math.max(0, targetCents / (m || 1));

  const movableTotal = movable.reduce((s, l) => s + l.amountCents, 0);
  const remainder = Math.max(0, rawTarget - lockedTotal);

  const next = lines.map((l) => {
    if (l.head !== head || l.computed || l.locked) return l;
    if (movableTotal <= 0) {
      return l.id === movable[0].id ? { ...l, amountCents: r(remainder) } : l;
    }
    return { ...l, amountCents: r((l.amountCents / movableTotal) * remainder) };
  });

  return { ...model, [key]: next } as ProjectionModel;
}

/**
 * Fold the modifiers into the underlying lines and reset them to 100 — for
 * when an exploration becomes the plan.
 */
export function bakeModifiers(model: ProjectionModel): ProjectionModel {
  const attM = pct(model.modifiers.attendancePct);
  const priceM = pct(model.modifiers.pricePct);
  const costM = pct(model.modifiers.costPct);

  return {
    ...model,
    days: model.days.map((day) => ({
      ...day,
      attendance: {
        withFood: r((day.attendance.withFood || 0) * attM),
        withoutFood: r((day.attendance.withoutFood || 0) * attM),
        kids: r((day.attendance.kids || 0) * attM),
      },
      price: {
        withFood: r((day.price.withFood || 0) * priceM),
        withoutFood: r((day.price.withoutFood || 0) * priceM),
        kids: r((day.price.kids || 0) * priceM),
      },
      foodCost: {
        breakfast: r((day.foodCost.breakfast || 0) * costM),
        lunch: r((day.foodCost.lunch || 0) * costM),
        dinner: r((day.foodCost.dinner || 0) * costM),
        kid: r((day.foodCost.kid || 0) * costM),
      },
    })),
    costLines: model.costLines.map((l) => ({ ...l, amountCents: effectiveLineCents(l, model, "cost") })),
    revenueLines: model.revenueLines.map((l) => ({
      ...l,
      amountCents: effectiveLineCents(l, model, "revenue"),
    })),
    modifiers: { attendancePct: 100, pricePct: 100, costPct: 100, sponsorshipPct: 100 },
  };
}
