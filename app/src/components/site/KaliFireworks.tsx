"use client";

/**
 * Kali Pujo / Deepavali fireworks behind the page (spec/17).
 *
 * One fixed <canvas> inside the night sky. Rockets rise with a spark trail and
 * burst as peony, ring, golden willow or crackling glitter. Trails come from
 * fading the canvas a little each frame (destination-out), so the sky's own
 * colours stay underneath untouched.
 *
 * Kept gentle so text stays readable: bursts happen in the upper sky, one
 * every couple of seconds (less on form pages), and the whole layer sits
 * behind the content. Tap or click an empty part of the homepage hero to
 * light your own.
 *
 * Costs nothing when it can't be seen: paused while the tab is hidden, never
 * started for prefers-reduced-motion, device-pixel-ratio capped, and a hard
 * particle cap (lower on phones).
 */
import { useEffect, useRef } from "react";

type P = {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; color: string; size: number;
  drag: number; grav: number; twinkle: boolean; trail: boolean;
};
type Rocket = { x: number; y: number; vx: number; vy: number; ty: number; kind: Kind; pal: string[] };
type Kind = "peony" | "ring" | "willow" | "glitter" | "double";

const PALETTES = [
  ["#ffd98a", "#f6c95e", "#fff3c4"], // lamp gold
  ["#ff4d6d", "#ffd98a", "#ff8fa3"], // crimson + gold
  ["#7cf0b0", "#f6c95e", "#d9ffe9"], // emerald + gold
  ["#c7a6ff", "#ff9ad5", "#fff0fb"], // violet + rose
  ["#ffffff", "#dfe8ff", "#ffe9b0"], // silver
  ["#ff9b3d", "#ffd36b", "#fff1c9"], // marigold
];
const KINDS: Kind[] = ["peony", "peony", "ring", "willow", "glitter", "double"];
const FORM_PAGES = /^\/(register|donate|signup|login|lookup|checkout|forgot-password|reset-password|m\b)/;

export default function KaliFireworks() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const small = window.matchMedia("(max-width: 640px)").matches;
    const CAP = small ? 450 : 900;
    const glow = !small;
    const quiet = FORM_PAGES.test(window.location.pathname);
    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(1.5, window.devicePixelRatio || 1);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const parts: P[] = [];
    const rockets: Rocket[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

    const launch = (tx?: number, ty?: number) => {
      const x = tx ?? rnd(W * 0.08, W * 0.92);
      const y = ty ?? rnd(H * 0.08, H * 0.4);
      const startX = x + rnd(-40, 40);
      const t = rnd(55, 75); // frames to reach the top
      rockets.push({ x: startX, y: H + 10, vx: (x - startX) / t, vy: -(H + 10 - y) / t, ty: y, kind: pick(KINDS), pal: pick(PALETTES) });
    };

    const spark = (x: number, y: number, vx: number, vy: number, o: Partial<P>) => {
      if (parts.length >= CAP) return;
      parts.push({ x, y, vx, vy, life: 0, max: 60, color: "#fff", size: 1.6, drag: 0.985, grav: 0.035, twinkle: false, trail: false, ...o });
    };

    const burst = (r: Rocket) => {
      const scale = small ? 0.6 : 1;
      const n = Math.round((r.kind === "ring" ? 46 : r.kind === "willow" ? 60 : 78) * scale);
      const speed = (r.kind === "willow" ? 3.4 : r.kind === "ring" ? 4.4 : 5.2) * (small ? 0.75 : 1);
      const tilt = Math.random() * Math.PI;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        let vx: number, vy: number;
        if (r.kind === "ring") {
          vx = Math.cos(a) * speed; vy = Math.sin(a) * speed * 0.55;
          const c = Math.cos(tilt), s = Math.sin(tilt);
          [vx, vy] = [vx * c - vy * s, vx * s + vy * c];
        } else {
          const m = speed * (0.55 + Math.random() * 0.45);
          vx = Math.cos(a) * m; vy = Math.sin(a) * m;
        }
        spark(r.x, r.y, vx, vy, {
          color: pick(r.pal),
          max: r.kind === "willow" ? rnd(110, 150) : rnd(60, 90),
          size: r.kind === "willow" ? 1.6 : rnd(1.6, 2.6),
          drag: r.kind === "willow" ? 0.975 : 0.982,
          grav: r.kind === "willow" ? 0.028 : 0.04,
          twinkle: r.kind === "glitter",
          trail: r.kind === "willow",
        });
      }
      if (r.kind === "double") {
        // a smaller inner bloom in a second colour
        const inner = pick(PALETTES);
        for (let i = 0; i < Math.round(36 * scale); i++) {
          const a = Math.random() * Math.PI * 2, m = rnd(0.6, 1.8);
          spark(r.x, r.y, Math.cos(a) * m, Math.sin(a) * m, { color: pick(inner), max: rnd(50, 70), size: 1.5 });
        }
      }
      // a bright flash at the heart of the burst
      spark(r.x, r.y, 0, 0, { color: "#fff7e0", max: 10, size: 9, grav: 0, drag: 1 });
    };

    let next = performance.now() + 900;
    let last = performance.now();
    let raf = 0;
    let running = true;

    const frame = (now: number) => {
      const dt = Math.min(3, (now - last) / 16.67); // in 60fps frames; clamp after a stall
      last = now;

      if (now > next) {
        launch();
        if (Math.random() < 0.18) setTimeout(launch, 260); // a little salvo
        if (Math.random() < 0.08) setTimeout(launch, 520);
        next = now + (quiet ? rnd(4200, 7000) : rnd(1100, 2400));
      }

      // fade what's there (trails) without painting over the sky beneath
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = `rgba(0,0,0,${Math.min(0.5, 0.12 * dt)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx * dt; r.y += r.vy * dt;
        ctx.fillStyle = "#ffe7b0";
        ctx.beginPath(); ctx.arc(r.x, r.y, 1.8, 0, Math.PI * 2); ctx.fill();
        if (Math.random() < 0.7) spark(r.x, r.y, rnd(-0.3, 0.3), rnd(0.4, 1.2), { color: "#ffcf7a", max: 22, size: 1.1, grav: 0.02 });
        if (r.y <= r.ty) { burst(r); rockets.splice(i, 1); }
      }

      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.life += dt;
        if (p.life >= p.max) { parts.splice(i, 1); continue; }
        const k = Math.pow(p.drag, dt);
        p.vx *= k; p.vy = p.vy * k + p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const t = p.life / p.max;
        let a = t < 0.1 ? 1 : 1 - (t - 0.1) / 0.9;
        if (p.twinkle) a *= Math.random() < 0.35 ? 0.15 : 1;
        if (a <= 0) continue;
        ctx.fillStyle = p.color;
        if (glow && p.size < 5) {
          // a soft halo under each spark — reads as light, not dots
          ctx.globalAlpha = a * 0.18;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.size > 5 ? 1 - t : 1), 0, Math.PI * 2);
        ctx.fill();
        if (p.trail && Math.random() < 0.25) spark(p.x, p.y, 0, 0.2, { color: p.color, max: 26, size: 0.9, grav: 0.01 });
      }
      ctx.globalAlpha = 1;

      if (running) raf = requestAnimationFrame(frame);
    };

    const onVis = () => {
      if (document.hidden) { running = false; cancelAnimationFrame(raf); }
      else if (!running) { running = true; last = performance.now(); next = last + 600; raf = requestAnimationFrame(frame); }
    };
    // tap/click an empty part of the hero to light one yourself
    const onTap = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (!el?.closest?.("#hero") || el.closest("a,button,input,select,textarea,label,[role=button]")) return;
      launch(e.clientX, Math.min(e.clientY, H * 0.75));
    };

    raf = requestAnimationFrame(frame);
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    document.addEventListener("pointerdown", onTap, { passive: true });
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVis);
      document.removeEventListener("pointerdown", onTap);
    };
  }, []);

  return <canvas ref={ref} className="kali-fireworks" aria-hidden />;
}
