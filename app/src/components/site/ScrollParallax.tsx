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

// Kali Pujo: hibiscus (জবা, Maa Kali's flower), a diya, the trishul and the
// downward-triangle yantra — drawn in lamp-gold so they glow on the night sky.
const KALI_MOTIFS = [
  { top: "12%", left: "3%", size: 130, speed: 0.1, rotate: -12, kind: "hibiscus", color: "var(--sindoor)" },
  { top: "38%", right: "4%", size: 150, speed: -0.06, rotate: 8, kind: "yantra", color: "var(--marigold)" },
  { top: "64%", left: "5%", size: 110, speed: 0.14, rotate: 0, kind: "diya", color: "var(--marigold-bright)" },
  { top: "84%", right: "8%", size: 140, speed: 0.05, rotate: -6, kind: "trishul", color: "var(--marigold)" },
] as const;

type Kind = "lotus" | "paisley" | "hibiscus" | "yantra" | "diya" | "trishul";

function Motif({ kind, color }: { kind: Kind; color: string }) {
  if (kind === "hibiscus") {
    return (
      <svg viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="2.2" style={{ width: "100%", height: "100%" }}>
        {[0, 72, 144, 216, 288].map((r) => (
          <path key={r} transform={`rotate(${r} 50 50)`} d="M50 50 C40 38 34 22 42 12 C47 6 53 6 58 12 C66 22 60 38 50 50 Z" />
        ))}
        <path d="M50 50 L66 30" strokeWidth="1.6" />
        <circle cx="67" cy="28" r="2.6" fill={color} stroke="none" />
      </svg>
    );
  }
  if (kind === "yantra") {
    return (
      <svg viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="1.8" style={{ width: "100%", height: "100%" }}>
        <circle cx="50" cy="50" r="44" />
        <circle cx="50" cy="50" r="38" />
        <polygon points="50,86 14,26 86,26" />
        <polygon points="50,74 24,32 76,32" />
        <polygon points="50,62 34,38 66,38" />
        <circle cx="50" cy="44" r="3" fill={color} stroke="none" />
      </svg>
    );
  }
  if (kind === "diya") {
    return (
      <svg viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="2.2" style={{ width: "100%", height: "100%" }}>
        <path d="M14 58 C22 80 78 80 86 58 Z" />
        <path d="M86 58 L94 52" />
        <path d="M50 52 C42 40 46 26 50 16 C54 26 58 40 50 52 Z" />
        <path d="M50 46 C47 40 48 33 50 28 C52 33 53 40 50 46 Z" fill={color} stroke="none" opacity="0.6" />
      </svg>
    );
  }
  if (kind === "trishul") {
    return (
      <svg viewBox="0 0 100 100" fill="none" stroke={color} strokeWidth="2.2" style={{ width: "100%", height: "100%" }}>
        <path d="M50 94 L50 18" />
        <path d="M50 14 C46 22 46 30 50 36 C54 30 54 22 50 14 Z" />
        <path d="M26 20 C26 38 36 44 50 44 C64 44 74 38 74 20" />
        <path d="M22 16 L26 24 L30 16" />
        <path d="M70 16 L74 24 L78 16" />
        <circle cx="50" cy="56" r="4" />
      </svg>
    );
  }
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

export default function ScrollParallax({ theme }: { theme?: string }) {
  const motifs = theme === "kali" ? KALI_MOTIFS : MOTIFS;
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
      {motifs.map((m, i) => (
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
            opacity: theme === "kali" ? 0.18 : 0.14,
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
