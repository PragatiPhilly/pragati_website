"use client";

/**
 * Scroll-driven background wash for the homepage. The whole-page background
 * smoothly shifts from light cream at the top to warm terracotta at the bottom
 * as you scroll down — and back to light on the way up. Colours track scroll
 * position (not a static full-height gradient, which reads as uniform on a long
 * page). Scoped to the homepage; restores the default background on unmount.
 */
import { useEffect } from "react";

// light → dark warm ramp, matched to the theme
const STOPS: [number, number, number][] = [
  [251, 243, 221], // cream
  [249, 226, 165], // soft gold
  [241, 191, 137], // apricot
  [228, 151, 99], // terracotta
  [197, 111, 65], // deep terracotta
];

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

function colorAt(p: number): string {
  const x = Math.max(0, Math.min(1, p)) * (STOPS.length - 1);
  const i = Math.floor(x);
  const t = x - i;
  const a = STOPS[i];
  const b = STOPS[Math.min(i + 1, STOPS.length - 1)];
  return `rgb(${lerp(a[0], b[0], t)}, ${lerp(a[1], b[1], t)}, ${lerp(a[2], b[2], t)})`;
}

export default function ScrollTint() {
  useEffect(() => {
    let raf = 0;
    const apply = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      const top = colorAt(Math.max(0, p - 0.06));
      const bottom = colorAt(Math.min(1, p + 0.06));
      document.body.style.setProperty("background", `linear-gradient(180deg, ${top} 0%, ${bottom} 100%)`, "important");
      document.body.style.backgroundAttachment = "fixed";
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      document.body.style.removeProperty("background");
      document.body.style.removeProperty("background-attachment");
    };
  }, []);

  return null;
}
