"use client";

/**
 * Ambient festive motifs (lotus + paisley) fixed to the viewport that drift at
 * different speeds as the page scrolls — a soft parallax layer behind all
 * content. Purely decorative: pointer-events-none, aria-hidden, and disabled
 * for prefers-reduced-motion.
 */
import { useEffect, useRef } from "react";

const MOTIFS = [
  { top: "12%", left: "3%", size: 140, speed: 0.10, rotate: -14, kind: "lotus", color: "var(--marigold)" },
  { top: "40%", right: "4%", size: 170, speed: -0.06, rotate: 10, kind: "paisley", color: "var(--terracotta)" },
  { top: "66%", left: "6%", size: 120, speed: 0.15, rotate: 16, kind: "paisley", color: "var(--sindoor)" },
  { top: "86%", right: "9%", size: 150, speed: 0.05, rotate: -8, kind: "lotus", color: "var(--terracotta)" },
] as const;

function Motif({ kind, color }: { kind: "lotus" | "paisley"; color: string }) {
  if (kind === "lotus") {
    return (
      <svg viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="2.2" style={{ width: "100%", height: "100%" }}>
        <path d="M50 78 C50 55 50 30 50 18 C58 32 60 55 50 78 Z" />
        <path d="M50 78 C36 60 26 42 22 30 C40 38 52 56 50 78 Z" />
        <path d="M50 78 C64 60 74 42 78 30 C60 38 48 56 50 78 Z" />
        <path d="M50 80 C30 76 16 66 8 58 C30 60 46 66 50 80 Z" />
        <path d="M50 80 C70 76 84 66 92 58 C70 60 54 66 50 80 Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="2.2" style={{ width: "100%", height: "100%" }}>
      <path d="M62 12 C30 18 18 46 30 72 C40 92 72 90 78 66 C82 48 66 44 56 54 C48 62 58 74 70 70" />
      <circle cx="46" cy="60" r="5" fill={color} stroke="none" />
    </svg>
  );
}

export default function ScrollParallax() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = ref.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-speed]"));
    let raf = 0;
    const apply = () => {
      const y = window.scrollY;
      for (const it of items) {
        const s = parseFloat(it.dataset.speed || "0");
        const r = it.dataset.rotate || "0";
        it.style.transform = `translate3d(0, ${(y * s).toFixed(1)}px, 0) rotate(${r}deg)`;
      }
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div ref={ref} className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {MOTIFS.map((m, i) => (
        <div
          key={i}
          data-speed={m.speed}
          data-rotate={m.rotate}
          style={{
            position: "absolute",
            top: m.top,
            left: "left" in m ? (m as { left?: string }).left : undefined,
            right: "right" in m ? (m as { right?: string }).right : undefined,
            width: m.size,
            height: m.size,
            opacity: 0.14,
            filter: "blur(0.4px)",
            transform: `rotate(${m.rotate}deg)`,
            willChange: "transform",
          }}
        >
          <Motif kind={m.kind} color={m.color} />
        </div>
      ))}
    </div>
  );
}
