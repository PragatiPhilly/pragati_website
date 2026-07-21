"use client";

import { useEffect, useRef } from "react";

/**
 * Depth-parallax hero built from a single pandal photo sliced into three planes:
 *   far  — softly blurred backdrop (roof, curtains, gold carving)
 *   mid  — the sharp idol mass
 *   near — the front flower row + red stage
 * The blurred far plane sits behind everything, so when the nearer planes drift
 * the gaps only reveal soft focus — depth, not holes. Motion is driven by the
 * pointer (and a slow Ken Burns idle); it respects prefers-reduced-motion.
 */
export default function HeroParallax({ className = "" }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLImageElement>(null);
  const midRef = useRef<HTMLImageElement>(null);
  const nearRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const layers = [
      { el: farRef.current, mx: 6, my: 4 },
      { el: midRef.current, mx: 16, my: 9 },
      { el: nearRef.current, mx: 30, my: 16 },
    ];

    let tx = 0, ty = 0, cx = 0, cy = 0, scroll = 0, raf = 0;

    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect();
      tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
    };
    const onLeave = () => { tx = 0; ty = 0; };
    const onScroll = () => {
      const r = wrap.getBoundingClientRect();
      scroll = Math.max(-1, Math.min(1, r.top / window.innerHeight));
    };

    const tick = () => {
      cx += (tx - cx) * 0.06;
      cy += (ty - cy) * 0.06;
      for (const L of layers) {
        if (!L.el) continue;
        const px = -cx * L.mx;
        const py = -cy * L.my - scroll * L.mx * 0.5;
        L.el.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) scale(1.16)`;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "3 / 2",
        borderRadius: 26,
        overflow: "hidden",
        boxShadow: "0 28px 70px rgba(0,0,0,0.32)",
        background: "#100b08",
      }}
    >
      <style>{`
        @keyframes hpKen { 0%{transform:scale(1)} 50%{transform:scale(1.05)} 100%{transform:scale(1)} }
        .hp-frame{position:absolute;inset:0;animation:hpKen 28s ease-in-out infinite}
        .hp-layer{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.16);will-change:transform;backface-visibility:hidden}
        @media (prefers-reduced-motion: reduce){.hp-frame{animation:none}.hp-layer{transform:scale(1.06)!important}}
      `}</style>
      <div className="hp-frame">
        {/* eslint-disable @next/next/no-img-element */}
        <img ref={farRef} className="hp-layer" src="/hero/far.jpg" alt="" aria-hidden loading="eager" />
        <img ref={midRef} className="hp-layer" src="/hero/mid.webp" alt="" aria-hidden loading="eager" />
        <img ref={nearRef} className="hp-layer" src="/hero/near.webp" alt="Durga Pujo celebration at Pragati" loading="eager" />
        {/* eslint-enable @next/next/no-img-element */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(120% 90% at 50% 12%, transparent 55%, rgba(0,0,0,0.28) 100%), linear-gradient(to top, rgba(20,6,10,0.35), transparent 40%)",
          }}
        />
      </div>
    </div>
  );
}
