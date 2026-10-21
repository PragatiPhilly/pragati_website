"use client";

/**
 * Kali Pujo — the Amavasya night sky behind every public page (spec/17).
 *
 * Ported from the v4 prototype's scroll-driven sky, made smoother:
 *  - The sky is five stacked, fixed gradient layers. Scrolling cross-fades
 *    between neighbours (layer i fully on, layer i+1 at opacity t), which is an
 *    exact blend — no hard jumps between "stops" like the prototype had.
 *  - Scroll position is eased (lerp) so the colour glides after the wheel stops,
 *    and the animation loop sleeps once it has caught up — no idle CPU.
 *  - Only `opacity` changes, so it stays on the compositor (smooth on phones).
 *  - prefers-reduced-motion: the sky still follows the page, but jumps
 *    straight to the right colour and the twinkle/lanterns are switched off
 *    in CSS.
 *
 * Every stop is deliberately dark so text contrast holds anywhere on the page.
 */
import { useEffect, useRef } from "react";
import KaliFireworks from "./KaliFireworks";

// সন্ধ্যা dusk → রাত deep night → প্রদীপ diya glow → নিশি পুজো midnight → অমাবস্যা
const STOPS = [
  "radial-gradient(ellipse 90% 60% at 72% 96%, rgba(232,169,60,0.26) 0%, transparent 60%), radial-gradient(ellipse 70% 55% at 18% 18%, rgba(70,38,120,0.55) 0%, transparent 60%), linear-gradient(180deg, #0a1230 0%, #1a0e3a 58%, #2a0f22 100%)",
  "radial-gradient(ellipse 70% 55% at 30% 30%, rgba(92,56,150,0.42) 0%, transparent 60%), radial-gradient(ellipse 70% 55% at 82% 78%, rgba(200,16,46,0.2) 0%, transparent 60%), linear-gradient(180deg, #110a2c 0%, #1c1040 55%, #29102e 100%)",
  "radial-gradient(ellipse 80% 60% at 50% 72%, rgba(246,201,94,0.22) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 12% 28%, rgba(232,169,60,0.12) 0%, transparent 55%), linear-gradient(180deg, #0d0f2c 0%, #1e1236 55%, #301428 100%)",
  "radial-gradient(ellipse 80% 60% at 50% 55%, rgba(200,16,46,0.3) 0%, transparent 60%), radial-gradient(ellipse 50% 45% at 86% 18%, rgba(246,201,94,0.1) 0%, transparent 55%), linear-gradient(180deg, #07081c 0%, #190a24 50%, #2c0a18 100%)",
  "radial-gradient(ellipse 70% 50% at 60% 12%, rgba(255,244,214,0.08) 0%, transparent 55%), linear-gradient(180deg, #050818 0%, #0a1230 70%, #06060e 100%)",
];

export default function KaliSky() {
  const layers = useRef<(HTMLDivElement | null)[]>([]);
  const stars = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let shown = -1; // eased progress actually painted
    let raf = 0;

    const target = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };

    const paint = (p: number) => {
      const x = p * (STOPS.length - 1);
      const i = Math.min(STOPS.length - 2, Math.floor(x));
      const t = x - i;
      layers.current.forEach((el, k) => {
        if (!el) return;
        el.style.opacity = k < i ? "0" : k === i ? "1" : k === i + 1 ? t.toFixed(3) : "0";
      });
      // stars are brightest in the deep-night stops, softer in the lamp glow
      if (stars.current) stars.current.style.opacity = (0.65 + 0.35 * Math.abs(Math.cos(p * Math.PI * 1.5))).toFixed(3);
    };

    const loop = () => {
      const goal = target();
      shown = shown < 0 || reduce ? goal : shown + (goal - shown) * 0.08;
      paint(shown);
      raf = Math.abs(goal - shown) > 0.0004 ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => {
      if (!raf) raf = requestAnimationFrame(loop);
    };

    loop();
    window.addEventListener("scroll", wake, { passive: true });
    window.addEventListener("resize", wake, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", wake);
      window.removeEventListener("resize", wake);
    };
  }, []);

  return (
    <div className="kali-sky" aria-hidden>
      {STOPS.map((bg, k) => (
        <div
          key={k}
          ref={(el) => {
            layers.current[k] = el;
          }}
          className="kali-sky-layer"
          style={{ background: bg, opacity: k === 0 ? 1 : 0 }}
        />
      ))}
      <div ref={stars} className="kali-stars">
        <div className="kali-stars-a" />
        <div className="kali-stars-b" />
        <div className="kali-stars-c" />
      </div>
      <KaliFireworks />
      <span className="kali-shooting s1" />
      <span className="kali-shooting s2" />
      {/* sky lanterns (ফানুস) drifting up, very slowly */}
      {[
        { left: "8%", d: "0s", t: "38s", s: 1 },
        { left: "27%", d: "-14s", t: "46s", s: 0.7 },
        { left: "63%", d: "-6s", t: "42s", s: 0.85 },
        { left: "84%", d: "-25s", t: "50s", s: 0.65 },
        { left: "46%", d: "-33s", t: "55s", s: 0.55 },
      ].map((l, i) => (
        <span
          key={i}
          className="kali-lantern"
          style={{ left: l.left, animationDelay: l.d, animationDuration: l.t, ["--s" as string]: l.s }}
        />
      ))}
    </div>
  );
}
