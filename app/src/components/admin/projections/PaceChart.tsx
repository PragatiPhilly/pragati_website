"use client";

/**
 * The booking curve: how registrations accumulate as the event approaches, and
 * where they are heading.
 *
 * This is the automated version of the 2024 sheet's hand-typed "Foot fall as of
 * 19 Oct" columns. In 2024 those three snapshots showed the year passing its own
 * projection six days before the doors opened — and nothing in the spreadsheet
 * said so, because a hand-typed column does not compare itself to anything.
 *
 * ONE hue does the work here. Booked-so-far is the solid line, the forecast is
 * the same line continued as a dash with its credible band as a 10% wash, and
 * the plan is a neutral grey reference — a dash pattern carries identity, not a
 * second colour. That keeps this chart safe under any colour vision.
 */
import { motion, useReducedMotion } from "framer-motion";
import type { PaceForecast } from "@/lib/projections/forecast";
import { Legend, Tip, num, useTip } from "./primitives";

const W = 520;
const H = 250;
const M = { top: 22, right: 58, bottom: 44, left: 48 };

export default function PaceChart({
  forecast,
  snapshots,
}: {
  forecast: PaceForecast;
  snapshots: { daysOut: number; heads: number }[];
}) {
  const reduced = useReducedMotion();
  const { tip, wrap, show, hide } = useTip();

  const obs = [...snapshots].filter((s) => s.heads > 0).sort((a, b) => b.daysOut - a.daysOut);
  if (obs.length === 0) {
    return (
      <div className="proj-empty">
        <p style={{ margin: 0, fontWeight: 700 }}>No snapshots yet</p>
        <p style={{ margin: "0.45rem 0 0" }}>
          Take a snapshot now and again each week, and this chart will project where registrations land —
          and start correcting itself as the evidence comes in.
        </p>
      </div>
    );
  }

  const maxDays = Math.max(forecast.curve.length ? forecast.curve[0].daysOut : 60, ...obs.map((o) => o.daysOut));
  const yMax = Math.max(forecast.plannedHeads, forecast.high, ...obs.map((o) => o.heads)) * 1.12 || 1;
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  // Days out runs high → low, so the event day is on the right.
  const x = (daysOut: number) => M.left + ((maxDays - daysOut) / (maxDays || 1)) * plotW;
  const y = (heads: number) => M.top + (1 - heads / yMax) * plotH;

  const planPath = forecast.curve.map((c, i) => `${i === 0 ? "M" : "L"} ${x(c.daysOut)} ${y(c.expected)}`).join(" ");
  const obsPath = obs.map((o, i) => `${i === 0 ? "M" : "L"} ${x(o.daysOut)} ${y(o.heads)}`).join(" ");
  const last = obs[obs.length - 1];
  const forecastPath = `M ${x(last.daysOut)} ${y(last.heads)} L ${x(0)} ${y(forecast.forecastFinal)}`;
  const bandPath = `M ${x(last.daysOut)} ${y(last.heads)} L ${x(0)} ${y(forecast.high)} L ${x(0)} ${y(forecast.low)} Z`;

  const ahead = forecast.varianceHeads >= 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "1.6rem", fontWeight: 800, lineHeight: 1 }}>{num(forecast.forecastFinal)}</span>
        <span style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>
          guests forecast · plan is {num(forecast.plannedHeads)} ·{" "}
          <b style={{ color: ahead ? "var(--c-ok)" : "var(--c-crit)" }}>
            {ahead ? "+" : "−"}
            {num(Math.abs(forecast.varianceHeads))}
          </b>
        </span>
      </div>

      <div className="proj-chartwrap" ref={wrap}>
        <svg className="proj-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Registrations booked so far against the plan, with a forecast to event day">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={M.left} x2={W - M.right} y1={y(yMax * f)} y2={y(yMax * f)} stroke="var(--c-grid)" strokeWidth={1} />
              <text x={M.left - 8} y={y(yMax * f) + 4} textAnchor="end" fontSize={10} fill="var(--ink-soft)" style={{ fontVariantNumeric: "tabular-nums" }}>
                {num(yMax * f)}
              </text>
            </g>
          ))}

          {/* credible band */}
          <motion.path
            d={bandPath}
            fill="var(--c-model)"
            fillOpacity={0.1}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0 : 0.55 }}
          />

          {/* the plan's own pace — a neutral reference, not a peer series */}
          <path d={planPath} fill="none" stroke="var(--c-axis)" strokeWidth={1.5} strokeDasharray="2 4" />

          {/* booked so far */}
          <motion.path
            d={obsPath}
            fill="none"
            stroke="var(--c-model)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.7, ease: "easeOut" }}
          />

          {/* the same line, projected */}
          <motion.path
            d={forecastPath}
            fill="none"
            stroke="var(--c-model)"
            strokeWidth={2}
            strokeDasharray="6 4"
            strokeLinecap="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={reduced ? { duration: 0 } : { duration: 0.5, delay: 0.6, ease: "easeOut" }}
          />

          {obs.map((o) => (
            <circle
              key={o.daysOut}
              cx={x(o.daysOut)}
              cy={y(o.heads)}
              r={4.5}
              fill="var(--c-model)"
              stroke="var(--card)"
              strokeWidth={2}
              onMouseMove={(e) =>
                show(
                  e,
                  <>
                    {o.daysOut} days out
                    <br />
                    <b>{num(o.heads)}</b> booked
                  </>
                )
              }
              onMouseLeave={hide}
              style={{ cursor: "crosshair" }}
            />
          ))}

          {/* direct end-labels: the endpoint and the plan, nothing else */}
          <text x={x(0) + 6} y={y(forecast.forecastFinal) + 4} fontSize={11} fontWeight={700} fill="var(--ink)">
            {num(forecast.forecastFinal)}
          </text>
          <text x={x(0) + 6} y={y(forecast.plannedHeads) + 4} fontSize={10} fill="var(--ink-soft)">
            plan
          </text>

          <line x1={M.left} x2={W - M.right} y1={M.top + plotH} y2={M.top + plotH} stroke="var(--c-axis)" strokeWidth={1} />
          <text x={M.left} y={H - 20} fontSize={10} fill="var(--ink-soft)">
            {maxDays} days out
          </text>
          <text x={W - M.right} y={H - 20} fontSize={10} fill="var(--ink-soft)" textAnchor="end">
            event day
          </text>
        </svg>
        <Tip tip={tip} />
      </div>

      <Legend
        items={[
          { colour: "var(--c-model)", label: "Booked so far", line: true },
          { colour: "var(--c-axis)", label: "Plan's own pace", line: true },
        ]}
      />
      <p className="proj-tile-foot">
        Fitted with a {forecast.method === "gompertz" ? "Gompertz booking curve" : "log-linear pace curve"}{" "}
        on the
        baseline year, then corrected toward this year&rsquo;s own trend as snapshots arrive. Confidence{" "}
        <b>{Math.round(forecast.confidence * 100)}%</b> — it narrows with every snapshot you take.
      </p>
    </div>
  );
}
