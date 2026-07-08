"use client";

/** Self-drawing alpona divider — strokes draw themselves when scrolled into view. */
import { useEffect, useRef } from "react";

const VARIANTS = {
  lotus: (
    <g strokeWidth="1.5" fill="none" strokeLinecap="round">
      <path d="M50 30 Q150 5 250 30 Q350 55 450 30 Q550 5 580 30" />
      <circle cx="300" cy="30" r="12" />
      <circle cx="300" cy="30" r="6" />
      <path d="M300 18 Q294 24 300 30 Q306 24 300 18 Z" />
      <path d="M300 42 Q294 36 300 30 Q306 36 300 42 Z" />
      <circle cx="100" cy="30" r="4" />
      <circle cx="500" cy="30" r="4" />
    </g>
  ),
  flower: (
    <g strokeWidth="1.5" fill="none" strokeLinecap="round">
      <path d="M50 30 Q150 55 250 30 Q350 5 450 30 Q550 55 580 30" />
      <g transform="translate(300 30)">
        <ellipse rx="14" ry="5" />
        <ellipse rx="14" ry="5" transform="rotate(45)" />
        <ellipse rx="14" ry="5" transform="rotate(90)" />
        <ellipse rx="14" ry="5" transform="rotate(135)" />
        <circle r="4" />
      </g>
    </g>
  ),
  arrows: (
    <g strokeWidth="1.5" fill="none" strokeLinecap="round">
      <path d="M50 30 Q200 5 300 30 Q400 55 550 30" />
      <path d="M280 18 L300 30 L280 42 M320 18 L300 30 L320 42" />
      <circle cx="100" cy="30" r="5" />
      <circle cx="500" cy="30" r="5" />
    </g>
  ),
};

export default function AlponaDivider({ variant = "lotus" }: { variant?: keyof typeof VARIANTS }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && el.classList.add("in-view"),
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div ref={ref} className="alpona-divider" aria-hidden>
      <svg viewBox="0 0 600 60" xmlns="http://www.w3.org/2000/svg">{VARIANTS[variant]}</svg>
    </div>
  );
}
