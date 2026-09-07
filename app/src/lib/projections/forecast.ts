/**
 * The predictive layer. Pure TypeScript, no runtime dependency.
 *
 * Four things live here (spec §11):
 *   1. Beta-PERT + Latin Hypercube Monte Carlo  → the distribution of outcomes
 *   2. Sobol variance decomposition (Saltelli)  → which uncertainty MATTERS
 *   3. Booking-curve forecast + Bayesian update → where attendance lands
 *   4. The gap closer and the risk flags        → what to actually do
 *
 * WHY NO LIBRARY: all of this runs in the browser on the super admin's laptop
 * while they drag sliders. A Node-only stats package is useless here, and this
 * is ~400 lines — not worth a supply-chain risk on a production Vercel app.
 * The methods are standard practice; the code is ours and is unit-tested.
 *
 * WHY SEEDED RANDOMNESS: a fan chart that reshuffles on every render teaches
 * people not to trust the number. Same scenario in, same picture out.
 */
import { calculate, marginsFor, type EngineResult } from "./engine";
import type { CostHead, Line, ProjectionModel } from "./types";

// ── random numbers ───────────────────────────────────────────────

/** mulberry32 — small, fast, well-distributed, and seeded. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic seed from a string, so a scenario's fan never moves. */
export function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ── Beta-PERT quantiles ──────────────────────────────────────────
// PERT is the standard three-point cost/schedule risk distribution: it is a
// Beta on [min,max] whose shape is set by where "likely" sits, with λ=4 giving
// the classic mean (min + 4·likely + max)/6.

function logGamma(x: number): number {
  // Lanczos approximation, g=7, n=9.
  const g = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = g[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += g[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the incomplete beta (Lentz's method). */
function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let dd = 1 - (qab * x) / qap;
  if (Math.abs(dd) < FPMIN) dd = FPMIN;
  dd = 1 / dd;
  let h = dd;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    dd = 1 + aa * dd;
    if (Math.abs(dd) < FPMIN) dd = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    dd = 1 / dd;
    h *= dd * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    dd = 1 + aa * dd;
    if (Math.abs(dd) < FPMIN) dd = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    dd = 1 / dd;
    const del = dd * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a,b). */
function betaInc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Inverse of I_x(a,b) by bisection — 60 steps is ~1e-18, far beyond need. */
function betaInv(a: number, b: number, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (betaInc(a, b, mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type Pert = { min: number; likely: number; max: number };

/**
 * A 129-point quantile table for one PERT band, so drawing a sample is an O(1)
 * interpolation instead of a bisection. Building the table costs ~129 betaInv
 * calls (a couple of milliseconds); a Monte Carlo run then draws from it
 * millions of times for free.
 */
export function pertTable(p: Pert, steps = 128): number[] {
  const { min, likely, max } = p;
  if (!(max > min)) return new Array(steps + 1).fill(likely);
  const lambda = 4;
  const alpha = 1 + (lambda * (likely - min)) / (max - min);
  const beta = 1 + (lambda * (max - likely)) / (max - min);
  const table: number[] = new Array(steps + 1);
  for (let i = 0; i <= steps; i++) {
    const q = i / steps;
    table[i] = min + (max - min) * betaInv(alpha, beta, Math.min(0.999999, Math.max(1e-6, q)));
  }
  return table;
}

/** Quantile lookup with linear interpolation. u ∈ [0,1). */
export function fromTable(table: number[], u: number): number {
  const steps = table.length - 1;
  const x = Math.min(0.999999, Math.max(0, u)) * steps;
  const i = Math.floor(x);
  const f = x - i;
  return table[i] + (table[Math.min(steps, i + 1)] - table[i]) * f;
}

/** Latin Hypercube: one stratified, permuted uniform column per dimension. */
export function lhs(n: number, dims: number, rand: () => number): number[][] {
  const cols: number[][] = [];
  for (let d = 0; d < dims; d++) {
    const col = new Array(n);
    for (let i = 0; i < n; i++) col[i] = (i + rand()) / n;
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [col[i], col[j]] = [col[j], col[i]];
    }
    cols.push(col);
  }
  // transpose to one row per sample
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]));
}

// ── the uncertain drivers ────────────────────────────────────────

export type UncertainDriver = {
  key: string;
  label: string;
  /** Multipliers on the planned value, not absolutes — so the defaults are
   *  meaningful without anybody filling in a form. */
  band: Pert;
  apply: (m: ProjectionModel, v: number) => ProjectionModel;
};

function scaleHead(
  m: ProjectionModel,
  side: "costLines" | "revenueLines",
  head: string,
  v: number
): ProjectionModel {
  const scale = (lines: Line[]) =>
    lines.map((l) =>
      l.head === head && !l.computed && !l.locked ? { ...l, amountCents: Math.round(l.amountCents * v) } : l
    );
  return side === "costLines"
    ? { ...m, costLines: scale(m.costLines) }
    : { ...m, revenueLines: scale(m.revenueLines) };
}

/**
 * Sensible default uncertainty, from how these things actually behave: costs
 * overrun more often than they undershoot, sponsorship is the volatile one, and
 * attendance is the big swing. A locked head is excluded entirely — that is
 * what locking means.
 */
export function defaultDrivers(model: ProjectionModel): UncertainDriver[] {
  const headLocked = (head: string) =>
    [...model.costLines, ...model.revenueLines].filter((l) => l.head === head && !l.computed).every((l) => l.locked) &&
    [...model.costLines, ...model.revenueLines].some((l) => l.head === head && !l.computed);

  const all: UncertainDriver[] = [
    {
      key: "attendance",
      label: "Attendance",
      band: { min: 0.7, likely: 1.0, max: 1.25 },
      apply: (m, v) => ({ ...m, modifiers: { ...m.modifiers, attendancePct: m.modifiers.attendancePct * v } }),
    },
    {
      key: "foodCost",
      label: "Food cost per head",
      band: { min: 0.9, likely: 1.0, max: 1.3 },
      apply: (m, v) => ({
        ...m,
        days: m.days.map((day) => ({
          ...day,
          foodCost: {
            breakfast: day.foodCost.breakfast * v,
            lunch: day.foodCost.lunch * v,
            dinner: day.foodCost.dinner * v,
            kid: day.foodCost.kid * v,
          },
        })),
      }),
    },
    { key: "hall", label: "Hall", band: { min: 0.95, likely: 1.0, max: 1.15 }, apply: (m, v) => scaleHead(m, "costLines", "hall", v) },
    { key: "setup", label: "Set up & décor", band: { min: 0.9, likely: 1.0, max: 1.25 }, apply: (m, v) => scaleHead(m, "costLines", "setup", v) },
    { key: "artists", label: "Artists", band: { min: 0.95, likely: 1.0, max: 1.2 }, apply: (m, v) => scaleHead(m, "costLines", "artists", v) },
    { key: "sound", label: "Sound & light", band: { min: 0.95, likely: 1.0, max: 1.2 }, apply: (m, v) => scaleHead(m, "costLines", "sound", v) },
    { key: "others", label: "Other costs", band: { min: 0.9, likely: 1.0, max: 1.3 }, apply: (m, v) => scaleHead(m, "costLines", "others", v) },
    { key: "corporate", label: "Corporate sponsors", band: { min: 0.4, likely: 1.0, max: 1.3 }, apply: (m, v) => scaleHead(m, "revenueLines", "corporate", v) },
    { key: "individual", label: "Individual sponsors", band: { min: 0.6, likely: 1.0, max: 1.25 }, apply: (m, v) => scaleHead(m, "revenueLines", "individual", v) },
    { key: "stalls", label: "Stalls", band: { min: 0.7, likely: 1.0, max: 1.2 }, apply: (m, v) => scaleHead(m, "revenueLines", "stalls", v) },
  ];

  return all.filter((dr) => {
    if (dr.key === "attendance" || dr.key === "foodCost") return true;
    return !headLocked(dr.key);
  });
}

// ── 1. Monte Carlo ───────────────────────────────────────────────

export type McResult = {
  samples: number;
  /** Sorted profit outcomes, in cents. */
  sorted: number[];
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  /** Share of runs that end in surplus. The headline of the whole panel. */
  probSurplus: number;
  /** How bad the bad tail is: the 10th-percentile outcome. */
  valueAtRisk: number;
  /** Deterministic plan, for marking on the chart. */
  planProfit: number;
  /** Where the plan sits in its own distribution, 0–1. Above ~0.65 means the
   *  plan is an optimistic case being presented as the expectation. */
  planPercentile: number;
  histogram: { x0: number; x1: number; n: number }[];
};

const quantile = (sorted: number[], q: number) => {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

export function monteCarlo(
  model: ProjectionModel,
  drivers: UncertainDriver[],
  opts: { samples?: number; seed?: number; bins?: number } = {}
): McResult {
  const n = opts.samples ?? 1500;
  const bins = opts.bins ?? 32;
  const rand = rng(opts.seed ?? seedFrom(JSON.stringify(model.days) + model.year));
  const tables = drivers.map((dr) => pertTable(dr.band));
  const points = lhs(n, drivers.length, rand);

  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let m = model;
    for (let dIdx = 0; dIdx < drivers.length; dIdx++) {
      m = drivers[dIdx].apply(m, fromTable(tables[dIdx], points[i][dIdx]));
    }
    out[i] = calculate(m).profitCents;
  }

  const sorted = [...out].sort((a, b) => a - b);
  const planProfit = calculate(model).profitCents;
  const below = sorted.filter((v) => v <= planProfit).length;

  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const width = (hi - lo) / bins || 1;
  const histogram = Array.from({ length: bins }, (_, i) => ({
    x0: lo + i * width,
    x1: lo + (i + 1) * width,
    n: 0,
  }));
  for (const v of sorted) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / width)));
    histogram[idx].n++;
  }

  return {
    samples: n,
    sorted,
    p10: quantile(sorted, 0.1),
    p50: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
    mean: sorted.reduce((a, b) => a + b, 0) / n,
    probSurplus: sorted.filter((v) => v > 0).length / n,
    valueAtRisk: quantile(sorted, 0.1),
    planProfit,
    planPercentile: below / n,
    histogram,
  };
}

// ── 2. Sobol sensitivity (Saltelli / Jansen) ─────────────────────

export type SobolIndex = {
  key: string;
  label: string;
  /** Share of outcome variance caused by this driver alone. */
  first: number;
  /** Including every interaction it takes part in. total ≫ first means this
   *  driver only bites in combination with another one. */
  total: number;
};

export function sobol(
  model: ProjectionModel,
  drivers: UncertainDriver[],
  opts: { samples?: number; seed?: number } = {}
): SobolIndex[] {
  const n = opts.samples ?? 256;
  const D = drivers.length;
  if (D === 0) return [];
  const rand = rng(opts.seed ?? seedFrom("sobol" + model.year));
  const tables = drivers.map((dr) => pertTable(dr.band));

  const A = lhs(n, D, rand);
  const B = lhs(n, D, rand);

  const evaluate = (u: number[]) => {
    let m = model;
    for (let i = 0; i < D; i++) m = drivers[i].apply(m, fromTable(tables[i], u[i]));
    return calculate(m).profitCents;
  };

  const fA = A.map(evaluate);
  const fB = B.map(evaluate);
  const all = [...fA, ...fB];
  const mean = all.reduce((a, b) => a + b, 0) / all.length;
  const variance = all.reduce((s, v) => s + (v - mean) ** 2, 0) / (all.length - 1);
  if (variance <= 0) return drivers.map((dr) => ({ key: dr.key, label: dr.label, first: 0, total: 0 }));

  return drivers.map((dr, i) => {
    const AB = A.map((row, j) => row.map((v, k) => (k === i ? B[j][k] : v)));
    const fAB = AB.map(evaluate);
    // Saltelli 2010 for first-order, Jansen 1999 for total-order.
    let first = 0;
    let total = 0;
    for (let j = 0; j < n; j++) {
      first += fB[j] * (fAB[j] - fA[j]);
      total += (fA[j] - fAB[j]) ** 2;
    }
    return {
      key: dr.key,
      label: dr.label,
      first: Math.max(0, first / n / variance),
      total: Math.max(0, total / (2 * n) / variance),
    };
  }).sort((a, b) => b.total - a.total);
}

// ── 3. Attendance forecast: booking curve + Bayesian update ──────

export type PaceFit = {
  method: "gompertz" | "log-linear";
  /** Share of the final head count expected to be booked, d days out. */
  fraction: (daysOut: number) => number;
  windowDays: number;
};

/**
 * Fit the baseline year's booking curve. Gompertz N(u) = A·exp(−b·exp(−c·u))
 * with u the fraction of the sales window elapsed; A is grid-searched and
 * (b,c) come from OLS on ln(−ln(N/A)), which is linear in u.
 *
 * If that degenerates — and with three data points it can — we fall back to
 * exponential growth in log space, which is what the 2024 numbers actually
 * look like: they were still accelerating six days out.
 */
export function fitPace(points: { daysOut: number; heads: number }[], windowDays = 60): PaceFit {
  const pts = [...points].filter((p) => p.heads > 0).sort((a, b) => b.daysOut - a.daysOut);
  const u = (daysOut: number) => Math.max(0, Math.min(1, (windowDays - daysOut) / windowDays));

  const logLinear = (): PaceFit => {
    if (pts.length < 2) {
      return { method: "log-linear", fraction: (dOut) => Math.max(0.02, u(dOut)), windowDays };
    }
    const xs = pts.map((p) => u(p.daysOut));
    const ys = pts.map((p) => Math.log(p.heads));
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    const slope = den > 0 ? num / den : 0;
    const intercept = my - slope * mx;
    const at = (x: number) => Math.exp(intercept + slope * x);
    const final = at(1) || 1;
    return { method: "log-linear", fraction: (dOut) => Math.max(0.01, Math.min(1, at(u(dOut)) / final)), windowDays };
  };

  if (pts.length < 3) return logLinear();

  const maxN = Math.max(...pts.map((p) => p.heads));
  let best: { A: number; b: number; c: number; sse: number } | null = null;
  for (let k = 0; k <= 80; k++) {
    const A = maxN * (1.02 + (k / 80) * 1.98); // 1.02× … 3× the largest observation
    const xs: number[] = [];
    const ys: number[] = [];
    for (const p of pts) {
      const ratio = p.heads / A;
      if (ratio <= 0 || ratio >= 1) continue;
      xs.push(u(p.daysOut));
      ys.push(Math.log(-Math.log(ratio)));
    }
    if (xs.length < 3) continue;
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let num = 0;
    let den = 0;
    for (let i = 0; i < xs.length; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    if (den <= 0) continue;
    const slope = num / den; // = −c
    const intercept = my - slope * mx; // = ln b
    const c = -slope;
    const b = Math.exp(intercept);
    if (!(c > 0) || !Number.isFinite(b)) continue;
    let sse = 0;
    for (const p of pts) {
      const pred = A * Math.exp(-b * Math.exp(-c * u(p.daysOut)));
      sse += (pred - p.heads) ** 2;
    }
    if (!best || sse < best.sse) best = { A, b, c, sse };
  }

  if (!best) return logLinear();
  const { A, b, c } = best;
  const at = (x: number) => A * Math.exp(-b * Math.exp(-c * x));
  const final = at(1);
  if (!Number.isFinite(final) || final <= 0) return logLinear();
  return {
    method: "gompertz",
    fraction: (dOut) => Math.max(0.01, Math.min(1, at(u(dOut)) / final)),
    windowDays,
  };
}

export type PaceForecast = {
  method: PaceFit["method"];
  daysOut: number;
  observedHeads: number;
  /** Straight pace projection: observed ÷ expected share by now. */
  naiveFinal: number;
  /** After Bayesian shrinkage toward this year's own trend. */
  forecastFinal: number;
  low: number;
  high: number;
  plannedHeads: number;
  /** forecastFinal − plannedHeads. Positive = you will beat the plan. */
  varianceHeads: number;
  /** 0 with no snapshots, → 1 as evidence accumulates. Drives the "learning"
   *  copy under the chart. */
  confidence: number;
  curve: { daysOut: number; expected: number }[];
};

/**
 * Project the final head count from snapshots taken so far.
 *
 * Prior: "this year behaves like the baseline year" (log-ratio 0, sd τ).
 * Evidence: each snapshot's log(actual ÷ pace-expected), sd σ.
 * Posterior mean is the precision-weighted average — with one snapshot the
 * forecast barely moves off the baseline shape; by the fifth it is this year's.
 */
export function forecastPace(
  fit: PaceFit,
  snapshots: { daysOut: number; heads: number }[],
  plannedHeads: number,
  opts: { tau?: number; sigma?: number } = {}
): PaceForecast {
  const tau = opts.tau ?? 0.18; // how much we allow this year to differ
  const sigma = opts.sigma ?? 0.12; // noise on any single snapshot
  const obs = [...snapshots].filter((s) => s.heads > 0).sort((a, b) => b.daysOut - a.daysOut);

  const curve = Array.from({ length: fit.windowDays + 1 }, (_, i) => {
    const daysOut = fit.windowDays - i;
    return { daysOut, expected: fit.fraction(daysOut) * plannedHeads };
  });

  if (obs.length === 0) {
    return {
      method: fit.method,
      daysOut: fit.windowDays,
      observedHeads: 0,
      naiveFinal: plannedHeads,
      forecastFinal: plannedHeads,
      low: plannedHeads,
      high: plannedHeads,
      plannedHeads,
      varianceHeads: 0,
      confidence: 0,
      curve,
    };
  }

  const latest = obs[obs.length - 1];
  const share = Math.max(0.01, fit.fraction(latest.daysOut));
  const naiveFinal = latest.heads / share;

  // Bayesian update on the log-ratio against the plan's own pace.
  let sumR = 0;
  for (const s of obs) {
    const expected = Math.max(1, fit.fraction(s.daysOut) * plannedHeads);
    sumR += Math.log(Math.max(1, s.heads) / expected);
  }
  const priorPrec = 1 / (tau * tau);
  const dataPrec = obs.length / (sigma * sigma);
  const postMean = (priorPrec * 0 + (1 / (sigma * sigma)) * sumR) / (priorPrec + dataPrec);
  const postSd = Math.sqrt(1 / (priorPrec + dataPrec));

  const forecastFinal = plannedHeads * Math.exp(postMean);
  // Blend the two views: pure pace extrapolation and the shrunk plan ratio.
  const blended = 0.5 * naiveFinal + 0.5 * forecastFinal;

  return {
    method: fit.method,
    daysOut: latest.daysOut,
    observedHeads: latest.heads,
    naiveFinal: Math.round(naiveFinal),
    forecastFinal: Math.round(blended),
    low: Math.round(blended * Math.exp(-1.96 * postSd)),
    high: Math.round(blended * Math.exp(1.96 * postSd)),
    plannedHeads,
    varianceHeads: Math.round(blended - plannedHeads),
    confidence: Math.min(1, dataPrec / (priorPrec + dataPrec)),
    curve,
  };
}

// ── 4. The gap closer ────────────────────────────────────────────

export type GapOption = {
  key: string;
  label: string;
  /** One line a committee member can act on. */
  detail: string;
  feasible: boolean;
  /** Why not, when infeasible. */
  blocker?: string;
};

export type GapAnalysis = {
  gapCents: number; // > 0 = short by this much; < 0 = surplus
  targetCents: number;
  options: GapOption[];
};

const money = (cents: number) =>
  `$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;

export function gapAnalysis(model: ProjectionModel, result: EngineResult): GapAnalysis {
  const target = model.targetProfitCents || 0;
  const gap = target - result.profitCents; // positive = short
  const options: GapOption[] = [];

  if (Math.abs(gap) < 100) {
    return { gapCents: gap, targetCents: target, options };
  }

  const short = gap > 0;
  const need = Math.abs(gap);

  // — attendance, on the best positive-margin segment
  const margins = marginsFor(model);
  const best = margins.filter((m) => m.marginCents > 0).sort((a, b) => b.marginCents - a.marginCents)[0];
  const worst = margins.filter((m) => m.marginCents < 0).sort((a, b) => a.marginCents - b.marginCents)[0];
  if (best) {
    const heads = Math.ceil(need / best.marginCents);
    options.push({
      key: "attendance",
      label: short ? "Sell more tickets" : "Room to lose guests",
      detail: `${heads.toLocaleString("en-US")} more ${best.dayLabel} “${best.segment === "withFood" ? "with food" : best.segment === "withoutFood" ? "without food" : "kids"}” guests — that segment nets ${money(best.marginCents)} a head.`,
      feasible: true,
    });
  } else {
    options.push({
      key: "attendance",
      label: "Sell more tickets",
      detail: "Every segment loses money per head at these prices — more guests makes this worse, not better.",
      feasible: false,
      blocker: "no positive-margin segment",
    });
  }

  // — ticket prices
  const ticketBase = result.ticketRevenueCents;
  if (ticketBase > 0) {
    const uplift = (need / ticketBase) * 100;
    options.push({
      key: "price",
      label: short ? "Raise ticket prices" : "Room to cut prices",
      detail: `${uplift.toFixed(1)}% ${short ? "on" : "off"} every ticket, at the same attendance.`,
      feasible: uplift <= 60,
      blocker: uplift > 60 ? "would need an implausible price rise" : undefined,
    });
  }

  // — sponsorship: 1:1, because it carries no cost
  options.push({
    key: "sponsorship",
    label: short ? "Find more sponsorship" : "Sponsorship headroom",
    detail: `${money(need)} of sponsorship — it is close to pure margin, so it moves the bottom line dollar for dollar.`,
    feasible: true,
  });

  // — stalls
  const stallLines = model.revenueLines.filter((l) => l.head === "stalls" && l.amountCents > 0);
  const avgStall = stallLines.length ? stallLines.reduce((s, l) => s + l.amountCents, 0) / stallLines.length : 0;
  if (avgStall > 0) {
    options.push({
      key: "stalls",
      label: short ? "Sell more stall tables" : "Stall headroom",
      detail: `${Math.ceil(need / avgStall)} more stalls at your average rate of ${money(avgStall)}.`,
      feasible: Math.ceil(need / avgStall) <= 30,
      blocker: Math.ceil(need / avgStall) > 30 ? "more stalls than the hall holds" : undefined,
    });
  }

  // — controllable cost
  const controllable = (["setup", "artists", "sound", "others", "pujo"] as CostHead[]).reduce(
    (s, h) => s + (result.costByHead[h] || 0),
    0
  );
  if (controllable > 0) {
    const trim = (need / controllable) * 100;
    options.push({
      key: "cost",
      label: short ? "Trim controllable costs" : "Extra budget available",
      detail: `${trim.toFixed(1)}% ${short ? "off" : "onto"} artists, sound, set-up, pujo and other costs (${money(controllable)} today).`,
      feasible: trim <= 50,
      blocker: trim > 50 ? "would cut over half the discretionary budget" : undefined,
    });
  }

  // — drop a day: re-run the model rather than estimate
  if (short) {
    for (const day of model.days) {
      if (!day.enabled || day.driverMode !== "computed") continue;
      const without = calculate({
        ...model,
        days: model.days.map((x) => (x.key === day.key ? { ...x, enabled: false } : x)),
      });
      const delta = without.profitCents - result.profitCents;
      if (delta > 0) {
        options.push({
          key: `drop-${day.key}`,
          label: `Drop ${day.label}`,
          detail: `Cancelling ${day.label} improves the bottom line by ${money(delta)} — it currently costs more than it brings in.`,
          feasible: true,
        });
      }
    }
  }

  if (worst && short) {
    options.push({
      key: "reprice-worst",
      label: `Reprice ${worst.dayLabel}`,
      detail: `${worst.dayLabel} “${worst.segment === "withFood" ? "with food" : "kids"}” loses ${money(worst.marginCents)} per head. Pricing it at cost alone recovers ${money(Math.abs(worst.marginCents) * worst.heads)}.`,
      feasible: true,
    });
  }

  return { gapCents: gap, targetCents: target, options };
}

// ── risk flags ───────────────────────────────────────────────────

export type RiskFlag = {
  key: string;
  level: "critical" | "warn" | "ok";
  title: string;
  detail: string;
};

export function riskFlags(model: ProjectionModel, result: EngineResult): RiskFlag[] {
  const flags: RiskFlag[] = [];

  // 1 — negative-margin segments
  const negative = result.margins.filter((m) => m.marginCents < 0 && m.heads > 0);
  if (negative.length) {
    const worstLoss = negative.reduce((s, m) => s + Math.abs(m.marginCents) * m.heads, 0);
    flags.push({
      key: "margin",
      level: "critical",
      title: `${negative.length} segment${negative.length > 1 ? "s" : ""} lose money on every sale`,
      detail: `${negative
        .map((m) => `${m.dayLabel} ${m.segment === "withFood" ? "with food" : m.segment === "kids" ? "kids" : "without food"} (${money(m.marginCents)}/head)`)
        .join(", ")}. Together they cost ${money(worstLoss)} at planned attendance.`,
    });
  } else {
    flags.push({ key: "margin", level: "ok", title: "Every segment covers its own food", detail: "No ticket type loses money per head." });
  }

  // 2 — unconfirmed revenue (the 2024 bug, as a live gauge)
  const unconfirmedShare = result.totalRevenueCents > 0 ? result.unconfirmedRevenueCents / result.totalRevenueCents : 0;
  if (result.unconfirmedRevenueCents > 0) {
    const wouldFlip = result.profitCents > 0 && result.profitCents - result.unconfirmedRevenueCents < 0;
    flags.push({
      key: "unconfirmed",
      level: wouldFlip ? "critical" : unconfirmedShare > 0.15 ? "warn" : "ok",
      title: `${(unconfirmedShare * 100).toFixed(0)}% of revenue is not confirmed`,
      detail: wouldFlip
        ? `${money(result.unconfirmedRevenueCents)} is expected or stretch. Without it this plan loses ${money(result.profitCents - result.unconfirmedRevenueCents)} — the surplus is entirely money nobody has promised.`
        : `${money(result.unconfirmedRevenueCents)} is marked expected or stretch rather than confirmed.`,
    });
  }

  // 3 — concentration
  const all = model.revenueLines.filter((l) => !l.computed);
  const biggest = [...all].sort((a, b) => b.amountCents - a.amountCents)[0];
  if (biggest && result.totalRevenueCents > 0) {
    const share = biggest.amountCents / result.totalRevenueCents;
    if (share > 0.15) {
      flags.push({
        key: "concentration",
        level: share > 0.25 ? "critical" : "warn",
        title: `One line is ${(share * 100).toFixed(0)}% of all revenue`,
        detail: `“${biggest.label}” at ${money(biggest.amountCents)}. If it withdraws, the year goes with it.`,
      });
    }
  }

  // 4 — attendance stress test
  const stressed = calculate({
    ...model,
    modifiers: { ...model.modifiers, attendancePct: model.modifiers.attendancePct * 0.8 },
  });
  flags.push({
    key: "stress",
    level: stressed.profitCents < 0 && result.profitCents >= 0 ? "warn" : stressed.profitCents < 0 ? "critical" : "ok",
    title: `If attendance lands 20% low: ${stressed.profitCents < 0 ? "loss" : "still positive"}`,
    detail: `Profit would be ${money(stressed.profitCents)}${stressed.profitCents < 0 ? " — a loss" : ""}, a swing of ${money(result.profitCents - stressed.profitCents)}.`,
  });

  // 5 — cash floor
  if (result.cashAfterCarryInCents < 0) {
    flags.push({
      key: "cash",
      level: "critical",
      title: "The year ends with no cash to seed the next one",
      detail: `Closing position ${money(result.cashAfterCarryInCents)}. Next year's committee cannot pay a hall deposit from this.`,
    });
  }

  return flags;
}
