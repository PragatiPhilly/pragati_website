"use client";

/**
 * The scan verdict, as a full-bleed takeover.
 *
 * A gate is loud, bright, and moving fast. The volunteer is holding a phone at
 * waist height and glancing down for well under a second, so the verdict has to
 * be readable at arm's length in sunlight and unmistakable in peripheral vision:
 *
 *   · the whole screen becomes the colour of the answer (green in / red repeat)
 *   · for food scans the screen becomes the FOOD colour and the meal word is
 *     the biggest thing on it — the server never has to read a name
 *   · anything requiring human judgement (student ID, repeat scan) is a
 *     separate high-contrast bar that does not auto-dismiss as fast
 *   · a short beep + haptic buzz so it works without looking at all
 *
 * Success clears itself so the next person can be scanned immediately;
 * problems stay until dismissed, because someone has to act on them.
 */
import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type ScanVerdict =
  | {
      tone: "ok";
      /** big meal word for food scans — when set it dominates the screen */
      foodWord?: string;
      color: string;
      name: string;
      line1?: string;
      line2?: string;
      needsId?: boolean;
      timed?: boolean;
    }
  | { tone: "dup"; name: string; line1: string; line2?: string }
  | { tone: "bad"; name: string; line1: string; line2?: string };

/** Short tone + haptic — the gate often can't look at the screen at all. */
function feedback(tone: "ok" | "dup" | "bad") {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(tone === "ok" ? 60 : [90, 70, 90]);
    }
    const Ctx =
      typeof window !== "undefined"
        ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        : undefined;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    // rising major third for success, low buzz for anything else
    osc.type = tone === "ok" ? "sine" : "square";
    osc.frequency.setValueAtTime(tone === "ok" ? 660 : 180, ctx.currentTime);
    if (tone === "ok") osc.frequency.setValueAtTime(880, ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (tone === "ok" ? 0.22 : 0.4));
    osc.start();
    osc.stop(ctx.currentTime + (tone === "ok" ? 0.24 : 0.42));
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* audio/haptics are a bonus — never break the scan */
  }
}

export default function ScanResult({ verdict, onDismiss }: { verdict: ScanVerdict | null; onDismiss: () => void }) {
  const key = verdict ? `${verdict.tone}-${verdict.name}-${verdict.line1 ?? ""}` : "none";
  const played = useRef("");

  useEffect(() => {
    if (!verdict) return;
    if (played.current !== key) {
      played.current = key;
      feedback(verdict.tone);
    }
    // successes clear themselves; problems wait for a human
    if (verdict.tone === "ok") {
      const t = setTimeout(onDismiss, verdict.needsId ? 6000 : 3200);
      return () => clearTimeout(t);
    }
  }, [key, verdict, onDismiss]);

  if (!verdict) return null;

  const bg =
    verdict.tone === "ok" ? (verdict.foodWord ? verdict.color : "#1E6B2A") : verdict.tone === "dup" ? "#8F1D1D" : "#414750";

  return (
    <AnimatePresence>
      <motion.div
        key={key}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 text-center cursor-pointer select-none"
        style={{ background: bg, color: "#fff" }}
        onClick={onDismiss}
        role="status"
        aria-live="assertive"
      >
        {/* the answer, in one glyph */}
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 18 }}
          className="leading-none"
          style={{ fontSize: "clamp(56px,16vw,120px)" }}
        >
          {verdict.tone === "ok" ? "✓" : verdict.tone === "dup" ? "⛔" : "✕"}
        </motion.div>

        {/* food word dominates a meal scan */}
        {verdict.tone === "ok" && verdict.foodWord && (
          <p className="font-black tracking-tight mt-1" style={{ fontSize: "clamp(40px,13vw,96px)", lineHeight: 1 }}>
            {verdict.foodWord}
          </p>
        )}

        <p
          className="font-black mt-4"
          style={{ fontSize: verdict.tone === "ok" && verdict.foodWord ? "clamp(22px,5vw,34px)" : "clamp(30px,8vw,58px)", lineHeight: 1.1 }}
        >
          {verdict.name}
        </p>

        {verdict.line1 && (
          <p className="mt-3 font-semibold opacity-95" style={{ fontSize: "clamp(15px,3.6vw,22px)" }}>
            {verdict.line1}
          </p>
        )}
        {verdict.line2 && (
          <p className="mt-1.5 opacity-80" style={{ fontSize: "clamp(13px,3vw,17px)" }}>
            {verdict.line2}
          </p>
        )}

        {/* things a human must act on */}
        {verdict.tone === "ok" && verdict.needsId && (
          <motion.div
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 1.1, repeat: Infinity }}
            className="mt-6 rounded-2xl px-6 py-4 font-black"
            style={{ background: "#FFD54A", color: "#4A2E00", fontSize: "clamp(16px,4.4vw,26px)" }}
          >
            🎓 CHECK STUDENT ID
          </motion.div>
        )}
        {verdict.tone === "ok" && verdict.timed && !verdict.needsId && (
          <div className="mt-5 rounded-full px-5 py-2 font-bold" style={{ background: "rgba(255,255,255,.22)" }}>
            🎶 Concert pass
          </div>
        )}

        <p className="absolute bottom-8 text-xs uppercase tracking-[0.2em] opacity-70">
          {verdict.tone === "ok" ? "Tap to scan the next person" : "Tap to dismiss"}
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
