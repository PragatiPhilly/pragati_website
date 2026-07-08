"use client";

/**
 * The Pujo Journey — a living scene above the registration questions.
 * Your family assembles as little folk figures and walks stop-by-stop
 * along a village path toward the pandal. Each step of the flow moves
 * the group to its landmark; adding a person pops a new figure in.
 */
import { AnimatePresence, motion } from "framer-motion";

const INK = "#2e1a0e";
const SKIN = "#e8b84a";
const BODY_COLORS = ["#b5402a", "#3f6b4a", "#3a5a8c", "#7a4a8c", "#c96a5a", "#a3641a"];

export type JourneyStep = "welcome" | "you" | "party" | "days" | "food" | "review" | "pay" | "done";

const STOP_X: Record<JourneyStep, number> = {
  welcome: 60,
  you: 185,
  party: 320,
  days: 455,
  food: 585,
  review: 712,
  pay: 712,
  done: 845,
};

function Figure({ i, isKid }: { i: number; isKid: boolean }) {
  const h = isKid ? 17 : 25;
  const w = isKid ? 11 : 15;
  const color = BODY_COLORS[i % BODY_COLORS.length];
  const x = (i % 4) * (isKid ? 13 : 17) - 24 + (i > 3 ? 8 : 0);
  const bob = 0.5 + (i % 3) * 0.18;
  return (
    <motion.g
      initial={{ scale: 0, y: -8 }}
      animate={{ scale: 1, y: 0 }}
      exit={{ scale: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 18 }}
      style={{ x }}
    >
      <motion.g animate={{ y: [0, -1.6, 0] }} transition={{ repeat: Infinity, duration: bob, ease: "easeInOut" }}>
        {/* bell body */}
        <path d={`M 0 ${-h} q ${-w * 0.62} ${h * 0.28} ${-w / 2} ${h} L ${w / 2} 0 q ${w * 0.12} ${-h * 0.72} ${-w / 2} ${-h} Z`} fill={color} stroke={INK} strokeWidth="1.1" />
        {/* head */}
        <circle cx="0" cy={-h - 4.5} r={isKid ? 4.2 : 5.6} fill={SKIN} stroke={INK} strokeWidth="1" />
        {/* hair */}
        <path d={`M ${isKid ? -4 : -5.4} ${-h - (isKid ? 6 : 7.4)} a ${isKid ? 4.2 : 5.6} ${isKid ? 4.2 : 5.6} 0 0 1 ${isKid ? 8 : 10.8} 0 z`} fill={INK} />
        {/* eyes */}
        <circle cx={-1.6} cy={-h - 4} r="0.75" fill={INK} />
        <circle cx={1.6} cy={-h - 4} r="0.75" fill={INK} />
      </motion.g>
    </motion.g>
  );
}

function Landmark({ x, active, children, label }: { x: number; active: boolean; children: React.ReactNode; label: string }) {
  return (
    <g transform={`translate(${x} 0)`}>
      {active && (
        <motion.circle
          cy="112"
          r="34"
          fill="var(--marigold-pale)"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.5, 0.85, 0.5] }}
          transition={{ repeat: Infinity, duration: 2.2 }}
        />
      )}
      {children}
      <text y="164" textAnchor="middle" fontSize="10.5" fontWeight={active ? 800 : 500} fill={active ? "var(--sindoor)" : "var(--ink-soft)"} style={{ fontFamily: "var(--font-sans)" }}>
        {label}
      </text>
    </g>
  );
}

export default function JourneyScene({ step, people }: { step: JourneyStep; people: { isKid: boolean }[] }) {
  const groupX = STOP_X[step];
  const shown = people.slice(0, 8);
  const arrived = step === "done";

  return (
    <div className="mb-7 select-none" aria-hidden>
      <svg viewBox="0 0 900 172" className="w-full h-auto">
        {/* distant hills */}
        <path d="M0 128 Q 120 108 260 124 Q 420 106 580 122 Q 740 104 900 124 L 900 132 L 0 132 Z" fill="var(--leaf-green)" opacity="0.28" />
        {/* the path */}
        <path d="M20 140 Q 450 128 880 140" fill="none" stroke="var(--marigold)" strokeWidth="5" strokeLinecap="round" opacity="0.5" />
        <path d="M20 140 Q 450 128 880 140" fill="none" stroke="var(--terracotta)" strokeWidth="1.6" strokeDasharray="1 10" strokeLinecap="round" opacity="0.8" />

        {/* ── landmarks ── */}
        <Landmark x={STOP_X.welcome} active={step === "welcome"} label="স্বাগতম">
          {/* village gate */}
          <rect x="-20" y="96" width="5" height="42" rx="2" fill="var(--terracotta)" />
          <rect x="15" y="96" width="5" height="42" rx="2" fill="var(--terracotta)" />
          <path d="M -22 98 Q 0 86 22 98" fill="none" stroke="var(--sindoor)" strokeWidth="6" strokeLinecap="round" />
          {[-14, -5, 4, 13].map((mx) => (
            <circle key={mx} cx={mx} cy={95 + Math.abs(mx) * 0.16} r="2.4" fill="var(--marigold)" />
          ))}
        </Landmark>

        <Landmark x={STOP_X.you} active={step === "you"} label="তুমি">
          {/* home hut */}
          <rect x="-16" y="112" width="32" height="26" rx="2" fill="var(--marigold-pale)" stroke="var(--terracotta)" strokeWidth="1.6" />
          <path d="M -21 114 L 0 96 L 21 114 Z" fill="var(--terracotta)" />
          <rect x="-4" y="122" width="8" height="16" fill="var(--terracotta-deep)" rx="1" />
        </Landmark>

        <Landmark x={STOP_X.party} active={step === "party"} label="পরিবার">
          {/* banyan with swing */}
          <rect x="-2.5" y="108" width="5" height="30" fill="#7a4a28" rx="2" />
          <circle cx="0" cy="100" r="17" fill="var(--leaf-green)" />
          <circle cx="-12" cy="106" r="11" fill="var(--leaf-deep)" opacity="0.85" />
          <circle cx="12" cy="106" r="11" fill="var(--leaf-deep)" opacity="0.85" />
        </Landmark>

        <Landmark x={STOP_X.days} active={step === "days"} label="দিন">
          {/* lantern string */}
          <path d="M -24 100 Q 0 112 24 100" fill="none" stroke="var(--ink-soft)" strokeWidth="1.4" />
          {[-18, -6, 6, 18].map((mx, i) => (
            <g key={mx}>
              <rect x={mx - 4} y={104 + Math.sin((i + 1) * 1.4) * 3} width="8" height="11" rx="2" fill={["var(--sindoor)", "var(--marigold)", "var(--leaf-green)", "var(--terracotta)"][i]} opacity="0.95" />
            </g>
          ))}
          <rect x="-26" y="98" width="3" height="40" fill="#7a4a28" rx="1.5" />
          <rect x="23" y="98" width="3" height="40" fill="#7a4a28" rx="1.5" />
        </Landmark>

        <Landmark x={STOP_X.food} active={step === "food"} label="ভোগ">
          {/* bhog handi on flame */}
          <ellipse cx="0" cy="122" rx="15" ry="10" fill="var(--terracotta-deep)" />
          <ellipse cx="0" cy="114" rx="11" ry="4" fill="var(--terracotta)" />
          <motion.path
            d="M -6 132 q 6 8 12 0"
            fill="none"
            stroke="var(--marigold-bright)"
            strokeWidth="3.4"
            strokeLinecap="round"
            animate={{ opacity: [1, 0.55, 1] }}
            transition={{ repeat: Infinity, duration: 0.9 }}
          />
          {/* steam */}
          <motion.path d="M 0 108 q 3 -6 0 -12" fill="none" stroke="var(--ink-soft)" strokeWidth="1.6" strokeLinecap="round" animate={{ opacity: [0.7, 0.2, 0.7], y: [0, -3, 0] }} transition={{ repeat: Infinity, duration: 2 }} />
        </Landmark>

        <Landmark x={STOP_X.pay} active={step === "review" || step === "pay"} label="দক্ষিণা">
          {/* dakshina counter */}
          <rect x="-18" y="112" width="36" height="9" rx="2" fill="#7a4a28" />
          <rect x="-15" y="121" width="4" height="17" fill="#5c3a1e" />
          <rect x="11" y="121" width="4" height="17" fill="#5c3a1e" />
          <path d="M -20 112 L 0 100 L 20 112 Z" fill="var(--marigold)" stroke="var(--terracotta)" strokeWidth="1.2" />
          <circle cx="0" cy="108.5" r="2.6" fill="var(--sindoor)" />
        </Landmark>

        <Landmark x={STOP_X.done} active={arrived} label="মণ্ডপ">
          {/* the pandal */}
          <path d="M -30 138 L -30 108 Q -30 88 0 86 Q 30 88 30 108 L 30 138 Z" fill="var(--sindoor)" opacity="0.92" />
          <path d="M -24 138 L -24 110 Q -24 94 0 92 Q 24 94 24 110 L 24 138" fill="none" stroke="var(--marigold-bright)" strokeWidth="2.4" />
          {/* tiny Maa silhouette */}
          <circle cx="0" cy="112" r="5.5" fill="var(--marigold-bright)" />
          <path d="M -7 130 q 0 -12 7 -12 q 7 0 7 12 Z" fill="var(--marigold-bright)" />
          <path d="M -6 106 Q 0 98 6 106" fill="none" stroke="var(--marigold-bright)" strokeWidth="2" strokeLinecap="round" />
        </Landmark>

        {/* ── the walking family ── */}
        <motion.g
          animate={{ x: groupX + (arrived ? -52 : step === "welcome" ? 42 : 0), y: 0 }}
          transition={{ type: "spring", stiffness: 60, damping: 16 }}
        >
          <g transform="translate(0 138)">
            <AnimatePresence>
              {shown.map((p, i) => (
                <Figure key={i} i={i} isKid={p.isKid} />
              ))}
              {shown.length === 0 && <Figure key="ghost" i={0} isKid={false} />}
            </AnimatePresence>
            {/* little dust puff under the group */}
            <ellipse cx="0" cy="3" rx="26" ry="3" fill="var(--terracotta)" opacity="0.15" />
          </g>
        </motion.g>

        {/* celebration petals on arrival */}
        {arrived &&
          [0, 1, 2, 3, 4, 5].map((i) => (
            <motion.circle
              key={i}
              cx={STOP_X.done - 30 + i * 12}
              cy={80}
              r="3"
              fill={i % 2 ? "var(--marigold)" : "var(--sindoor)"}
              initial={{ opacity: 0, y: 0 }}
              animate={{ opacity: [0, 1, 0], y: [0, 46] }}
              transition={{ duration: 1.6, delay: i * 0.18, repeat: Infinity, repeatDelay: 0.8 }}
            />
          ))}
      </svg>
    </div>
  );
}
