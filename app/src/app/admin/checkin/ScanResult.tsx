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

/** The rest of the booking at the gate (spec/18). */
export type VerdictParty = { conf: string; outside: { ticketId: string; name: string; isKid: boolean }[]; plates?: string };

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
      /** Walk-in desk facts the gate has to ACT on — a balance still owed, or
       *  the adult a child is attached to. Shown as their own bar, and they
       *  hold the screen longer than a plain success. */
      notes?: string[];
      /** others on the booking still outside — the screen waits for a decision */
      party?: VerdictParty;
    }
  | { tone: "dup"; name: string; line1: string; line2?: string; party?: VerdictParty }
  /** this pass was already in, but others on the booking are still outside */
  | { tone: "partial"; name: string; line1: string; line2?: string; party?: VerdictParty }
  | { tone: "bad"; name: string; line1: string; line2?: string };

/** Short tone + haptic — the gate often can't look at the screen at all. */
function feedback(tone: "ok" | "dup" | "bad" | "partial") {
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

export default function ScanResult({
  verdict,
  onDismiss,
  busy = false,
  onCheckInOthers,
  onPick,
}: {
  verdict: ScanVerdict | null;
  onDismiss: () => void;
  busy?: boolean;
  onCheckInOthers?: (ticketIds: string[], names: string[]) => void;
  onPick?: (conf: string) => void;
}) {
  const key = verdict ? `${verdict.tone}-${verdict.name}-${verdict.line1 ?? ""}` : "none";
  const played = useRef("");

  useEffect(() => {
    if (!verdict) return;
    if (played.current !== key) {
      played.current = key;
      feedback(verdict.tone);
    }
    // successes clear themselves; problems — and a family still outside — wait for a human
    if (verdict.tone === "ok" && !(verdict.party?.outside.length ?? 0)) {
      const holdLonger = verdict.needsId || (verdict.notes?.length ?? 0) > 0;
      const t = setTimeout(onDismiss, holdLonger ? 6000 : 3200);
      return () => clearTimeout(t);
    }
  }, [key, verdict, onDismiss]);

  if (!verdict) return null;

  const bg =
    verdict.tone === "ok"
      ? verdict.foodWord
        ? verdict.color
        : "#1E6B2A"
      : verdict.tone === "dup"
        ? "#8F1D1D"
        : verdict.tone === "partial"
          ? "#9A5B00"
          : "#414750";
  const party = verdict.tone !== "bad" ? verdict.party : undefined;
  const outside = party?.outside ?? [];

  return (
    <AnimatePresence>
      <motion.div
        key={key}
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 text-center cursor-pointer select-none overflow-y-auto"
        style={{ background: bg, color: "#fff" }}
        onClick={outside.length > 0 ? undefined : onDismiss}
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
          {verdict.tone === "ok" ? "✓" : verdict.tone === "dup" ? "⛔" : verdict.tone === "partial" ? "↻" : "✕"}
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
        {verdict.tone === "ok" &&
          (verdict.notes ?? []).map((n) => (
            <div
              key={n}
              className="mt-4 rounded-2xl px-5 py-3 font-black"
              style={{
                background: n.startsWith("BALANCE") ? "#FFD54A" : "rgba(255,255,255,.22)",
                color: n.startsWith("BALANCE") ? "#4A2E00" : "#fff",
                fontSize: "clamp(14px,3.6vw,20px)",
              }}
            >
              {n}
            </div>
          ))}
        {verdict.tone === "ok" && verdict.timed && !verdict.needsId && (
          <div className="mt-5 rounded-full px-5 py-2 font-bold" style={{ background: "rgba(255,255,255,.22)" }}>
            🎶 Concert pass
          </div>
        )}

        {/* the rest of the family — one tap to let them all in */}
        {outside.length > 0 && onCheckInOthers && (
          <div
            className="mt-6 w-full max-w-md rounded-2xl p-4 text-left cursor-default"
            style={{ background: "rgba(0,0,0,0.22)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-black" style={{ fontSize: "clamp(17px,4.6vw,24px)" }}>
              Still outside on this booking:
            </p>
            <p className="mt-1 font-semibold" style={{ fontSize: "clamp(15px,4vw,20px)" }}>
              {outside.map((o) => `${o.name}${o.isKid ? " 🧒" : ""}`).join(", ")}
            </p>
            {party?.plates && <p className="mt-1 text-sm opacity-85">Food today: {party.plates}</p>}
            <button
              className="mt-3 w-full rounded-xl py-4 font-black disabled:opacity-60"
              style={{ background: "#fff", color: "#1E6B2A", fontSize: "clamp(18px,5.4vw,26px)" }}
              disabled={busy}
              onClick={() => onCheckInOthers(outside.map((o) => o.ticketId), outside.map((o) => o.name))}
            >
              {busy ? "…" : outside.length === 1 ? `✓ CHECK IN ${outside[0].name.split(" ")[0].toUpperCase()}` : `✓ CHECK IN ALL ${outside.length}`}
            </button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {onPick && party && (
                <button className="rounded-xl py-3 font-bold" style={{ background: "rgba(255,255,255,0.2)" }} onClick={() => onPick(party.conf)}>
                  Only some — pick
                </button>
              )}
              <button className="rounded-xl py-3 font-bold" style={{ background: "rgba(255,255,255,0.2)" }} onClick={onDismiss}>
                {verdict.tone === "ok" ? "Just this one" : "Not now"}
              </button>
            </div>
          </div>
        )}

        <p className="absolute bottom-8 text-xs uppercase tracking-[0.2em] opacity-70">
          {outside.length > 0 ? "" : verdict.tone === "ok" ? "Tap to scan the next person" : "Tap to dismiss"}
        </p>
      </motion.div>
    </AnimatePresence>
  );
}
