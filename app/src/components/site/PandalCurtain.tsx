"use client";

/**
 * Pandal curtain reveal.
 *
 * On the first visit of a browser session, two draped panels — the red-and-gold
 * cloth of a pujo pandal, complete with a scalloped hem and a gold tie-back cord
 * — part from the centre to reveal the banner beneath, then unmount entirely.
 *
 * It runs ONCE per session (sessionStorage), so it feels like arriving at the
 * pandal rather than a gimmick that replays on every navigation. Anyone who has
 * asked for reduced motion skips straight to the revealed state.
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const KEY = "pragati-curtain-shown";

function Panel({ side }: { side: "left" | "right" }) {
  const isLeft = side === "left";
  return (
    <div
      className="absolute inset-y-0 w-1/2 overflow-hidden"
      style={{
        [isLeft ? "left" : "right"]: 0,
        background: isLeft
          ? "linear-gradient(100deg, #8F2718 0%, #B3402A 55%, #9A2E1C 100%)"
          : "linear-gradient(260deg, #8F2718 0%, #B3402A 55%, #9A2E1C 100%)",
        boxShadow: isLeft ? "inset -14px 0 26px -12px rgba(0,0,0,.55)" : "inset 14px 0 26px -12px rgba(0,0,0,.55)",
      } as React.CSSProperties}
    >
      {/* vertical folds in the cloth */}
      {[14, 32, 50, 68, 86].map((x) => (
        <span
          key={x}
          className="absolute inset-y-0"
          style={{
            left: `${x}%`,
            width: 10,
            background: "linear-gradient(90deg, rgba(0,0,0,.22), rgba(255,255,255,.10), rgba(0,0,0,.22))",
            opacity: 0.55,
          }}
        />
      ))}
      {/* gold hem + scalloped edge */}
      <span className="absolute inset-x-0 bottom-0" style={{ height: 5, background: "linear-gradient(90deg,#F2A63B,#FFD88A,#F2A63B)" }} />
      <span
        className="absolute inset-x-0"
        style={{
          bottom: -7,
          height: 14,
          backgroundImage: "radial-gradient(circle at 10px 0, #F2A63B 6px, transparent 6.5px)",
          backgroundSize: "20px 14px",
          backgroundRepeat: "repeat-x",
        }}
      />
      {/* tie-back cord toward the outer edge */}
      <span
        className="absolute rounded-full"
        style={{
          top: "38%",
          [isLeft ? "left" : "right"]: "10%",
          width: 12,
          height: 12,
          background: "#FFD88A",
          boxShadow: "0 0 12px rgba(255,216,138,.9)",
        } as React.CSSProperties}
      />
    </div>
  );
}

export default function PandalCurtain({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  // null = undecided (SSR/first paint), true/false once we've checked the session
  const [play, setPlay] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      if (reduce || sessionStorage.getItem(KEY)) {
        setPlay(false);
        return;
      }
      sessionStorage.setItem(KEY, "1");
      setPlay(true);
    } catch {
      setPlay(false); // private mode / storage blocked — just show the banner
    }
  }, [reduce]);

  return (
    <div className="relative">
      {children}
      <AnimatePresence>
        {play && (
          <motion.div
            className="absolute inset-0 z-[5] overflow-hidden rounded-2xl pointer-events-none"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onAnimationComplete={() => setPlay(false)}
          >
            <motion.div
              className="absolute inset-0"
              initial={{ x: 0 }}
              animate={{ x: "-102%" }}
              transition={{ duration: 1.15, delay: 0.35, ease: [0.76, 0, 0.24, 1] }}
            >
              <Panel side="left" />
            </motion.div>
            <motion.div
              className="absolute inset-0"
              initial={{ x: 0 }}
              animate={{ x: "102%" }}
              transition={{ duration: 1.15, delay: 0.35, ease: [0.76, 0, 0.24, 1] }}
            >
              <Panel side="right" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
