"use client";

/** Opt-in dhaak heartbeat: tap to play a soft synthesized dhaak rhythm
 *  (Web Audio, no files). While playing, the page pulses to the beat. */
import { useEffect, useRef, useState } from "react";

const BAR = 0.86; // seconds per bar ≈ 140bpm feel

export default function DhaakButton() {
  const [playing, setPlaying] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dhaak-playing", playing);
    return () => document.documentElement.classList.remove("dhaak-playing");
  }, [playing]);

  const hit = (ctx: AudioContext, t: number, freq: number, gain: number, dur: number) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };

  const scheduleBar = (ctx: AudioContext, t0: number) => {
    // dha  dhin  dha-dha  dhin  (folk-ish, soft)
    hit(ctx, t0, 82, 0.24, 0.3);
    hit(ctx, t0 + BAR * 0.25, 160, 0.1, 0.14);
    hit(ctx, t0 + BAR * 0.5, 82, 0.2, 0.26);
    hit(ctx, t0 + BAR * 0.625, 96, 0.14, 0.18);
    hit(ctx, t0 + BAR * 0.75, 160, 0.1, 0.14);
  };

  const toggle = async () => {
    if (playing) {
      if (timerRef.current) clearInterval(timerRef.current);
      await ctxRef.current?.close();
      ctxRef.current = null;
      setPlaying(false);
      return;
    }
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    ctxRef.current = ctx;
    let next = ctx.currentTime + 0.05;
    scheduleBar(ctx, next);
    timerRef.current = setInterval(() => {
      if (!ctxRef.current) return;
      next += BAR;
      scheduleBar(ctxRef.current, next);
    }, BAR * 1000);
    setPlaying(true);
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      ctxRef.current?.close();
    },
    []
  );

  return (
    <button
      onClick={toggle}
      aria-label={playing ? "Stop the dhaak" : "Play the dhaak"}
      title={playing ? "Stop the dhaak" : "শুনুন — the dhaak"}
      className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full grid place-items-center text-2xl transition-transform hover:scale-110"
      style={{
        background: playing ? "var(--sindoor)" : "var(--card)",
        border: "2px solid var(--sindoor)",
        boxShadow: "0 8px 24px rgba(200,16,46,0.3)",
      }}
    >
      <span className={playing ? "dhaak-beat" : ""}>🥁</span>
    </button>
  );
}
