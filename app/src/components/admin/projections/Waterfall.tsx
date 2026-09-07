"use client";

/**
 * The bridge: every revenue head lifting the line, every cost head pulling it
 * down, and where it lands. This is the one chart that explains the whole
 * spreadsheet in a glance, so it gets the most room.
 *
 * Colour does one job here — POLARITY, not identity. Up bars are the gain hue,
 * down bars the loss hue, the final bar a neutral total. Which head a bar is
 * comes from its axis label, not its colour, which is why this needs no
 * categorical palette and no legend beyond three entries.
 *
 * Every bar also carries a signed value in its tooltip and, above a size
 * threshold, on its cap — the secondary encoding the gain/loss pair requires.
 */
import { motion, useReducedMotion } from "framer-motion";
import { Legend, Tip, moneyK, moneySigned, useTip } from "./primitives";

export type WaterfallStep = {
  key: string;
  label: string;
  /** Signed: positive lifts the running total, negative pulls it down. */
  deltaCents: number;
  /** True for the closing bar, which is drawn from zero rather than as a step. */
  total?: boolean;
  detail?: string;
};

const W = 900;
const H = 360;
const M = { top: 30, right: 10, bottom: 104, left: 62 };

export default function Waterfall({ steps }: { steps: WaterfallStep[] }) {
  const reduced = useReducedMotion();
  const { tip, wrap, show, hide } = useTip();

  const live = steps.filter((s) => s.total || s.deltaCents !== 0);
  if (live.length === 0) {
    return <p className="proj-empty">Nothing to bridge yet — add a revenue or cost line.</p>;
  }

  // Running totals give each bar its span.
  let running = 0;
  const bars = live.map((s) => {
    const from = s.total ? 0 : running;
    const to = s.total ? s.deltaCents : running + s.deltaCents;
    if (!s.total) running = to;
    return { ...s, from, to, lo: Math.min(from, to), hi: Math.max(from, to) };
  });

  const lo = Math.min(0, ...bars.map((b) => b.lo));
  const hi = Math.max(0, ...bars.map((b) => b.hi));
  const pad = (hi - lo) * 0.08 || 1000;
  const yMin = lo - pad;
  const yMax = hi + pad;

  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const y = (v: number) => M.top + ((yMax - v) / (yMax - yMin)) * plotH;
  const band = plotW / bars.length;
  const barW = Math.min(30, band * 0.56);

  // Round ticks, and always include zero — the baseline is the whole point.
  const ticks: number[] = [];
  const rawStep = (yMax - yMin) / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, rawStep))));
  const stepSize = Math.ceil(rawStep / mag) * mag;
  for (let t = Math.ceil(yMin / stepSize) * stepSize; t <= yMax; t += stepSize) ticks.push(t);
  if (!ticks.includes(0) && yMin < 0 && yMax > 0) ticks.push(0);

  const biggest = Math.max(...bars.map((b) => Math.abs(b.total ? b.to : b.deltaCents)));

  return (
    <div className="proj-chartwrap" ref={wrap}>
      <svg
        className="proj-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Waterfall from revenue heads through cost heads to the bottom line"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(t)}
              y2={y(t)}
              stroke={t === 0 ? "var(--c-axis)" : "var(--c-grid)"}
              strokeWidth={1}
            />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--ink-soft)" style={{ fontVariantNumeric: "tabular-nums" }}>
              {moneyK(t)}
            </text>
          </g>
        ))}

        {bars.map((b, i) => {
          const cx = M.left + band * i + band / 2;
          const top = y(b.hi);
          const height = Math.max(2, y(b.lo) - y(b.hi));
          const colour = b.total ? "var(--c-model)" : b.deltaCents >= 0 ? "var(--c-gain)" : "var(--c-loss)";
          const showLabel = Math.abs(b.total ? b.to : b.deltaCents) >= biggest * 0.18;
          const next = bars[i + 1];

          return (
            <g key={b.key}>
              {/* connector to the next bar's starting level — hairline, recessive */}
              {next && !next.total ? (
                <line
                  x1={cx + barW / 2}
                  x2={M.left + band * (i + 1) + band / 2 - barW / 2}
                  y1={y(b.to)}
                  y2={y(b.to)}
                  stroke="var(--c-grid)"
                  strokeWidth={1}
                />
              ) : null}

              <motion.rect
                x={cx - barW / 2}
                width={barW}
                rx={4}
                fill={colour}
                initial={reduced ? false : { y: y(0), height: 0, opacity: 0 }}
                animate={{ y: top, height, opacity: 1 }}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", bounce: 0, duration: 0.55, delay: i * 0.035 }
                }
                onMouseMove={(e) =>
                  show(
                    e,
                    <>
                      {b.label}
                      <br />
                      <b>{moneySigned(b.total ? b.to : b.deltaCents)}</b>
                      {b.detail ? (
                        <>
                          <br />
                          <span style={{ opacity: 0.75 }}>{b.detail}</span>
                        </>
                      ) : null}
                    </>
                  )
                }
                onMouseLeave={hide}
                style={{ cursor: "crosshair" }}
              />

              {showLabel ? (
                <text
                  x={cx}
                  y={top - 7}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill="var(--ink)"
                  style={{ fontVariantNumeric: "tabular-nums", pointerEvents: "none" }}
                >
                  {moneySigned(b.total ? b.to : b.deltaCents)}
                </text>
              ) : null}

              <text
                x={cx}
                y={H - M.bottom + 16}
                fontSize={11}
                fill="var(--ink-soft)"
                textAnchor="end"
                transform={`rotate(-40 ${cx} ${H - M.bottom + 16})`}
              >
                {b.label}
              </text>
            </g>
          );
        })}
      </svg>

      <Legend
        items={[
          { colour: "var(--c-gain)", label: "Money in (+)" },
          { colour: "var(--c-loss)", label: "Money out (−)" },
          { colour: "var(--c-model)", label: "Bottom line" },
        ]}
      />
      <Tip tip={tip} />
    </div>
  );
}
