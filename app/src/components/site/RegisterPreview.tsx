"use client";

/** Looping, anonymous preview of the registration conversation. */
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const STEPS = [
  { q: "Who's coming?", chips: ["🧑", "🧑", "🧒", "+ add"] },
  { q: "Which days?", chips: ["🎉 All 3 days", "Sat only"] },
  { q: "Bhog? 🍛", chips: ["🐟 Non-veg", "🥬 Veg", "🍚 Kid's meal"] },
  { q: "Done! Tickets on the way 🎟", chips: ["PRG-2026-····"] },
];

export default function RegisterPreview() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % STEPS.length), 2600);
    return () => clearInterval(t);
  }, []);
  const step = STEPS[i];

  return (
    <div className="flex flex-col items-center justify-center gap-5 min-h-56">
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 26, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -26, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          className="rounded-3xl p-6 w-full max-w-sm"
          style={{ background: "rgba(251,246,236,0.1)", backdropFilter: "blur(8px)", border: "1px solid rgba(251,246,236,0.2)" }}
        >
          <p className="font-[family-name:var(--font-display)] text-xl font-bold mb-4 text-center" style={{ color: "var(--cream)" }}>
            {step.q}
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {step.chips.map((chip, j) => (
              <motion.span
                key={chip + j}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 + j * 0.12 }}
                className="text-sm font-semibold rounded-full px-4 py-2"
                style={{ background: "var(--marigold-pale)", color: "var(--sindoor-deep)" }}
              >
                {chip}
              </motion.span>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="flex gap-2.5">
        {STEPS.map((_, j) => (
          <span
            key={j}
            className="w-2 h-2 rounded-full transition-all duration-300"
            style={{ background: j === i ? "var(--marigold-bright)" : "rgba(251,246,236,0.3)", transform: j === i ? "scale(1.35)" : "none" }}
          />
        ))}
      </div>
    </div>
  );
}
