"use client";

/**
 * Where planned attendance sits against the attendance that pays for the year.
 *
 * The arc is a status meter, not a series: the fill carries severity and always
 * ships with the number and a sentence, never colour alone. When no amount of
 * attendance reaches break-even — because every segment loses money per head —
 * it says exactly that instead of drawing a needle off the end.
 */
import { motion, useReducedMotion } from "framer-motion";
import { num } from "./primitives";

const W = 300;
const H = 176;
const CX = W / 2;
const CY = 152;
const R = 116;
const THICK = 17;

function polar(angleDeg: number, radius: number) {
  const a = ((angleDeg - 180) * Math.PI) / 180;
  return { x: CX + radius * Math.cos(a), y: CY + radius * Math.sin(a) };
}

function arcPath(from: number, to: number, radius: number) {
  const s = polar(from, radius);
  const e = polar(to, radius);
  return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${to - from > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

export default function BreakEvenArc({
  currentHeads,
  breakEvenHeads,
  reachable,
}: {
  currentHeads: number;
  breakEvenHeads: number;
  reachable: boolean;
}) {
  const reduced = useReducedMotion();

  if (!reachable) {
    return (
      <div className="proj-empty" style={{ padding: "1.6rem 0.5rem" }}>
        <p style={{ margin: 0, fontWeight: 700, color: "var(--c-crit)" }}>⚠ Break-even is unreachable</p>
        <p style={{ margin: "0.45rem 0 0" }}>
          Every ticket segment loses money once food is counted, so selling more seats moves the bottom line the
          wrong way. Raise a price or cut a food cost before this chart means anything.
        </p>
      </div>
    );
  }

  // The scale runs to 1.6× break-even so being comfortably ahead still reads.
  const scaleMax = Math.max(breakEvenHeads * 1.6, currentHeads * 1.15, 1);
  const toAngle = (v: number) => Math.max(0, Math.min(180, (v / scaleMax) * 180));
  const needle = toAngle(currentHeads);
  const beAngle = toAngle(breakEvenHeads);

  const ratio = breakEvenHeads > 0 ? currentHeads / breakEvenHeads : 0;
  const status = ratio >= 1.15 ? "ok" : ratio >= 1 ? "warn" : "crit";
  const colour = status === "ok" ? "var(--c-ok)" : status === "warn" ? "var(--c-warn)" : "var(--c-crit)";
  const icon = status === "ok" ? "✓" : status === "warn" ? "!" : "✕";
  const shortfall = Math.max(0, Math.round(breakEvenHeads - currentHeads));

  return (
    <div>
      <svg className="proj-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Break-even attendance meter">
        {/* track: a lighter step of the same idea, so state reads across the whole bar */}
        <path d={arcPath(0, 180, R)} fill="none" stroke="var(--c-grid)" strokeWidth={THICK} strokeLinecap="round" />
        <motion.path
          d={arcPath(0, Math.max(needle, 0.6), R)}
          fill="none"
          stroke={colour}
          strokeWidth={THICK}
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 60, damping: 18 }}
        />

        {/* break-even marker */}
        <motion.line
          x1={polar(beAngle, R - THICK / 2 - 5).x}
          y1={polar(beAngle, R - THICK / 2 - 5).y}
          x2={polar(beAngle, R + THICK / 2 + 5).x}
          y2={polar(beAngle, R + THICK / 2 + 5).y}
          stroke="var(--ink)"
          strokeWidth={2.5}
          strokeLinecap="round"
          animate={{ opacity: 1 }}
          initial={reduced ? false : { opacity: 0 }}
          transition={{ delay: 0.3 }}
        />
        <text
          x={polar(beAngle, R + THICK / 2 + 17).x}
          y={polar(beAngle, R + THICK / 2 + 17).y}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill="var(--ink-soft)"
        >
          {num(breakEvenHeads)}
        </text>

        <text x={CX} y={CY - 42} textAnchor="middle" fontSize={34} fontWeight={800} fill="var(--ink)">
          {num(currentHeads)}
        </text>
        <text x={CX} y={CY - 22} textAnchor="middle" fontSize={11} fill="var(--ink-soft)">
          guests planned
        </text>
        <text x={4} y={CY + 16} fontSize={10} fill="var(--ink-soft)" textAnchor="start">
          0
        </text>
        <text x={W - 4} y={CY + 16} fontSize={10} fill="var(--ink-soft)" textAnchor="end">
          {num(scaleMax)}
        </text>
      </svg>

      <p className="proj-tile-foot" style={{ marginTop: "0.15rem", color: colour, fontWeight: 700 }}>
        {icon}{" "}
        {status === "crit"
          ? `${num(shortfall)} guests short of break-even`
          : status === "warn"
            ? "Only just above break-even"
            : `${num(currentHeads - breakEvenHeads)} guests of headroom`}
      </p>
      <p className="proj-tile-foot" style={{ marginTop: "0.15rem" }}>
        Break-even needs <b>{num(breakEvenHeads)}</b>{" "}
        guests at today&rsquo;s mix of days and ticket types.
      </p>
    </div>
  );
}

