"use client";

/**
 * Two different questions, deliberately side by side.
 *
 *  · TORNADO — "which lever moves the number most", each driver pushed ±20%.
 *    Useful, but it says as much about the ±20% as about the world.
 *  · SOBOL   — "of the uncertainty in the outcome, how much does each driver
 *    actually cause", from the same Monte Carlo bands. A driver whose TOTAL
 *    index far exceeds its FIRST-order index only bites in combination with
 *    something else, which is worth knowing before a committee spends an hour
 *    arguing about it.
 *
 * Tornado bars are diverging (up-side gain hue, down-side loss hue, zero line
 * drawn). The Sobol pair is ORDINAL — one hue, two steps — because total-order
 * contains first-order; two categorical hues would imply they are independent.
 */
import { motion, useReducedMotion } from "framer-motion";
import type { SobolIndex } from "@/lib/projections/forecast";
import { Legend, Tip, moneyK, moneySigned, pct, useTip } from "./primitives";

export type TornadoRow = { key: string; label: string; downCents: number; upCents: number };

const W = 520;
const ROW = 26;
const M = { top: 24, right: 16, bottom: 26, left: 128 };

export function Tornado({ rows }: { rows: TornadoRow[] }) {
  const reduced = useReducedMotion();
  const { tip, wrap, show, hide } = useTip();
  if (rows.length === 0) return <p className="proj-empty">No movable drivers — everything is pinned.</p>;

  const H = M.top + rows.length * ROW + M.bottom;
  const span = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.downCents), Math.abs(r.upCents)]));
  const plotW = W - M.left - M.right;
  const cx = M.left + plotW / 2;
  const x = (v: number) => cx + (v / span) * (plotW / 2);

  return (
    <div className="proj-chartwrap" ref={wrap}>
      <svg className="proj-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Effect on profit of moving each driver plus or minus 20 percent">
        <line x1={cx} x2={cx} y1={M.top - 8} y2={H - M.bottom} stroke="var(--c-axis)" strokeWidth={1.5} />
        <text x={cx} y={M.top - 12} textAnchor="middle" fontSize={10} fill="var(--ink-soft)">
          plan
        </text>

        {rows.map((r, i) => {
          const yTop = M.top + i * ROW + 4;
          const h = ROW - 10;
          return (
            <g key={r.key}>
              <text x={M.left - 10} y={yTop + h / 2 + 4} textAnchor="end" fontSize={11} fill="var(--ink)">
                {r.label}
              </text>
              {[
                { v: r.downCents, label: "−20%" },
                { v: r.upCents, label: "+20%" },
              ].map((side) => {
                const from = Math.min(cx, x(side.v));
                const width = Math.max(1.5, Math.abs(x(side.v) - cx));
                return (
                  <motion.rect
                    key={side.label}
                    y={yTop}
                    height={h}
                    rx={3}
                    fill={side.v >= 0 ? "var(--c-gain)" : "var(--c-loss)"}
                    initial={reduced ? false : { x: cx, width: 0 }}
                    animate={{ x: from, width }}
                    transition={reduced ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.5, delay: i * 0.03 }}
                    onMouseMove={(e) =>
                      show(
                        e,
                        <>
                          {r.label} {side.label}
                          <br />
                          profit <b>{moneySigned(side.v)}</b>
                        </>
                      )
                    }
                    onMouseLeave={hide}
                    style={{ cursor: "crosshair" }}
                  />
                );
              })}
            </g>
          );
        })}

        <text x={M.left} y={H - 8} fontSize={10} fill="var(--ink-soft)">
          {moneyK(-span)}
        </text>
        <text x={W - M.right} y={H - 8} fontSize={10} fill="var(--ink-soft)" textAnchor="end">
          {moneyK(span)}
        </text>
      </svg>
      <Legend
        items={[
          { colour: "var(--c-gain)", label: "Improves the bottom line" },
          { colour: "var(--c-loss)", label: "Worsens it" },
        ]}
      />
      <Tip tip={tip} />
    </div>
  );
}

export function SobolChart({ indices }: { indices: SobolIndex[] }) {
  const reduced = useReducedMotion();
  const { tip, wrap, show, hide } = useTip();
  if (indices.length === 0) return <p className="proj-empty">Running the variance decomposition…</p>;

  const rows = indices.slice(0, 8);
  const H = M.top + rows.length * ROW + M.bottom;
  const plotW = W - M.left - M.right;
  const span = Math.max(0.05, ...rows.map((r) => r.total));
  const w = (v: number) => (v / span) * plotW;

  const interacting = rows.find((r) => r.total > r.first * 1.6 && r.total > 0.08);

  return (
    <div>
      <div className="proj-chartwrap" ref={wrap}>
        <svg className="proj-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Share of outcome variance caused by each driver">
          {rows.map((r, i) => {
            const yTop = M.top + i * ROW + 3;
            const h = ROW - 9;
            return (
              <g key={r.key}>
                <text x={M.left - 10} y={yTop + h / 2 + 4} textAnchor="end" fontSize={11} fill="var(--ink)">
                  {r.label}
                </text>
                {/* total-order behind, first-order in front: nesting shown by overlap */}
                <motion.rect
                  x={M.left}
                  y={yTop}
                  height={h}
                  rx={3}
                  fill="var(--c-ord-1)"
                  initial={reduced ? false : { width: 0 }}
                  animate={{ width: Math.max(1.5, w(r.total)) }}
                  transition={reduced ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.5, delay: i * 0.03 }}
                  onMouseMove={(e) =>
                    show(
                      e,
                      <>
                        {r.label}
                        <br />
                        first-order <b>{pct(r.first, 1)}</b>
                        <br />
                        total (with interactions) <b>{pct(r.total, 1)}</b>
                      </>
                    )
                  }
                  onMouseLeave={hide}
                  style={{ cursor: "crosshair" }}
                />
                <motion.rect
                  x={M.left}
                  y={yTop + 2}
                  height={h - 4}
                  rx={2}
                  fill="var(--c-ord-2)"
                  initial={reduced ? false : { width: 0 }}
                  animate={{ width: Math.max(1, w(Math.min(r.first, r.total))) }}
                  transition={reduced ? { duration: 0 } : { type: "spring", bounce: 0, duration: 0.5, delay: 0.05 + i * 0.03 }}
                  style={{ pointerEvents: "none" }}
                />
                <text
                  x={M.left + Math.max(1.5, w(r.total)) + 6}
                  y={yTop + h / 2 + 4}
                  fontSize={10}
                  fontWeight={700}
                  fill="var(--ink-soft)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {pct(r.total, 0)}
                </text>
              </g>
            );
          })}
        </svg>
        <Tip tip={tip} />
      </div>
      <Legend
        items={[
          { colour: "var(--c-ord-2)", label: "On its own (first-order)" },
          { colour: "var(--c-ord-1)", label: "Including interactions (total)" },
        ]}
      />
      {interacting ? (
        <p className="proj-tile-foot">
          <b>{interacting.label}</b> matters mostly in combination with another driver — on its own it explains{" "}
          {pct(interacting.first, 0)} of the swing, but {pct(interacting.total, 0)} once interactions are counted.
        </p>
      ) : null}
    </div>
  );
}
