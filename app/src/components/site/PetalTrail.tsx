"use client";

/** Desktop-only: the cursor leaves a faint trail of drifting marigold petals
 *  over the hero. Respects prefers-reduced-motion; capped for performance. */
import { useEffect, useRef } from "react";

export default function PetalTrail({ targetId }: { targetId: string }) {
  const last = useRef(0);

  useEffect(() => {
    const host = document.getElementById(targetId);
    if (!host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let live = 0;
    const onMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - last.current < 90 || live > 14) return;
      last.current = now;
      const rect = host.getBoundingClientRect();
      const petal = document.createElement("span");
      petal.className = "trail-petal";
      petal.style.left = `${e.clientX - rect.left}px`;
      petal.style.top = `${e.clientY - rect.top}px`;
      petal.style.setProperty("--dx", `${(Math.random() - 0.5) * 60}px`);
      petal.style.setProperty("--rot", `${(Math.random() - 0.5) * 340}deg`);
      if (Math.random() < 0.35) petal.classList.add("red");
      host.appendChild(petal);
      live++;
      setTimeout(() => {
        petal.remove();
        live--;
      }, 1300);
    };
    host.addEventListener("pointermove", onMove);
    return () => host.removeEventListener("pointermove", onMove);
  }, [targetId]);

  return null;
}
