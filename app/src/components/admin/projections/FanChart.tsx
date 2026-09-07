"use client";

/**
 * The distribution of outcomes — 1,500 Latin-Hypercube draws over Beta-PERT
 * bands on every driver, plotted as a histogram of profit.
 *
 * The question this answers is the one a point estimate cannot: *how likely is
 * this plan to work?* And the second, sharper one: where does the plan you are
 * about to sign sit inside its own distribution? A marker above the 65th
 * percentile means you are presenting an optimistic case as the expectation —
 * which is precisely what the 2024 workbook's Scenario 2 was doing.
 *
 * One series, so no legend box: the title says what is plotted. Bars left of
 * zero take the loss hue, right of zero the gain hue, and the zero line is
 * drawn — polarity by position as well as colour.
 */
import { motion, useReducedMotion } from "framer-motion";
import type { McResult } from "@/lib/projections/forecast";
import { Tip, money0, moneyK, num, pct, useTip } from "./primitives";

const W = 520;
const H = 250;
const M = { top: 20, right: 14, bottom: 46, left: 46 };

export default function FanChart({ mc }: { mc: McResult | null }) {
  const reduced = useReducedMotion();
  const { tip, wrap, show, hide } = useTip();

  if (!mc) {
    return <p className="proj-empty">Running the risk model…</p>;
  }

  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const lo = mc.histogram[0]?.x0 ?? 0;
  const hi = mc.histogram[mc.histogram.length - 1]?.x1 ?? 1;
  const maxN = Math.max(1, ...mc.histogram.map((b) => b.n));

  const x = (v: number) => M.left + ((v - lo) / (hi - lo || 1)) * plotW;
  const barW = plotW / mc.histogram.length;

  const zeroX = lo <= 0 && hi >= 0 ? x(0) : null;
  const good = mc.probSurplus >= 0.7 ? "ok" : mc.probSurplus >= 0.45 ? "warn" : "crit";
  const statusColour = good === "ok" ? "var(--c-ok)" : good === "warn" ? "var(--c-warn)" : "var(--c-crit)";

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: "0.55rem",
        }}
      >
        <span style={{ fontSize: "1.9rem", fontWeight: 800, lineHeight: 1, color: statusColour }}>
          {pct(mc.probSurplus)}
        </span>
        <span style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>
          chance of finishing in surplus, over {num(mc.samples)} simulated years
        </span>
      </div>

      <div className="proj-chartwrap" ref={wrap}>
        <svg className="proj-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Distribution of simulated profit outcomes">
          {/* P10–P90 band: where four years in five land */}
          <rect
            x={x(mc.p10)}
            width={Math.max(1, x(mc.p90) - x(mc.p10))}
            y={M.top}
            height={plotH}
            fill="var(--c-model-soft)"
          />

          {mc.histogram.map((b, i) => {
            const h = (b.n / maxN) * plotH;
            const mid = (b.x0 + b.x1) / 2;
            return (
              <motion.rect
                key={i}
                x={x(b.x0) + 1}
                width={Math.max(1, barW - 2)}
                rx={2}
                fill={mid < 0 ? "var(--c-loss)" : "var(--c-gain)"}
                initial={reduced ? false : { y: M.top + plotH, height: 0 }}
                animate={{ y: M.top + plotH - h, height: h }}
                transition={reduced ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.5, delay: i * 0.006 }}
                onMouseMove={(e) =>
                  show(
                    e,
                    <>
                      {moneyK(b.x0)} to {moneyK(b.x1)}
                      <br />
                      <b>{b.n}</b> of {num(mc.samples)} runs
                    </>
                  )
                }
                onMouseLeave={hide}
                style={{ cursor: "crosshair" }}
              />
            );
          })}

          {zeroX !== null ? (
            <>
              <line x1={zeroX} x2={zeroX} y1={M.top - 6} y2={M.top + plotH} stroke="var(--c-axis)" strokeWidth={1.5} />
              <text x={zeroX} y={M.top - 10} textAnchor="middle" fontSize={10} fontWeight={700} fill="var(--ink-soft)">
                break even
              </text>
            </>
          ) : null}

          {/* the plan, marked inside its own distribution */}
          <motion.g
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.5 }}
          >
            <line
              x1={x(mc.planProfit)}
              x2={x(mc.planProfit)}
              y1={M.top}
              y2={M.top + plotH + 6}
              stroke="var(--ink)"
              strokeWidth={2}
              strokeDasharray="4 3"
            />
            <circle cx={x(mc.planProfit)} cy={M.top} r={4.5} fill="var(--ink)" stroke="var(--card)" strokeWidth={2} />
          </motion.g>

          <line x1={M.left} x2={W - M.right} y1={M.top + plotH} y2={M.top + plotH} stroke="var(--c-axis)" strokeWidth={1} />
          {[mc.p10, mc.p50, mc.p90].map((v, i) => (
            <text
              key={i}
              x={x(v)}
              y={H - M.bottom + 16}
              textAnchor="middle"
              fontSize={10}
              fill="var(--ink-soft)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {moneyK(v)}
            </text>
          ))}
          {[mc.p10, mc.p50, mc.p90].map((v, i) => (
            <text key={`l${i}`} x={x(v)} y={H - M.bottom + 30} textAnchor="middle" fontSize={9} fill="var(--ink-soft)">
              {["P10", "median", "P90"][i]}
            </text>
          ))}
        </svg>
        <Tip tip={tip} />
      </div>

      <p className="proj-tile-foot">
        Four years in five land between <b>{money0(mc.p10)}</b> and <b>{money0(mc.p90)}</b>. Your plan sits at the{" "}
        <b>{pct(mc.planPercentile)}</b> percentile of its own distribution
        {mc.planPercentile > 0.65 ? (
          <span style={{ color: "var(--c-warn)", fontWeight: 700 }}> — that is an optimistic case, not an expectation.</span>
        ) : mc.planPercentile < 0.35 ? (
          <span> — a conservative plan.</span>
        ) : (
          <span> — a fair central estimate.</span>
        )}
      </p>
    </div>
  );
}
