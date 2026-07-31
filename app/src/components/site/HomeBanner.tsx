"use client";

import Link from "next/link";
import { motion } from "framer-motion";

/**
 * Home hero announcement banner — admin-controlled (Admin → Settings).
 * Three Pujo-themed animated designs, chosen with `home_banner_style`:
 *
 *   aurora — rotating marigold aurora ring, flickering diya, drifting petals.
 *   alpona — self-drawing alpona line-art + a swaying genda-phool garland.
 *   toran  — hanging marigold toran strings that sway, with dhunuchi smoke.
 */
export type BannerStyle = "aurora" | "alpona" | "toran";

type Props = {
  text: string;
  ctaLabel?: string;
  href?: string;
  deadline?: string; // YYYY-MM-DD (event-local); drives the live countdown chip
  style?: BannerStyle;
};

function useDaysLeft(deadline?: string): number | null {
  if (!deadline) return null;
  const end = new Date(`${deadline}T23:59:59`);
  if (Number.isNaN(end.getTime())) return null;
  const d = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
  return d >= 0 ? d : null;
}

function daysLabel(d: number): string {
  return d === 0 ? "Last day" : `${d} day${d === 1 ? "" : "s"} left`;
}

/** Shared CTA with a sheen sweep. */
function Cta({ label, href, dark = false }: { label: string; href: string; dark?: boolean }) {
  return (
    <Link
      href={href}
      className="relative shrink-0 inline-flex items-center overflow-hidden rounded-full px-5 py-2.5 text-sm font-bold transition-transform hover:scale-[1.03]"
      style={dark ? { background: "#fff", color: "var(--sindoor)" } : { background: "var(--sindoor)", color: "#fff" }}
    >
      <span className="relative z-[1]">{label} →</span>
      <motion.span
        aria-hidden
        className="absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg]"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)" }}
        animate={{ left: ["-40%", "140%"] }}
        transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity, repeatDelay: 1.6 }}
      />
    </Link>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 pt-5">
      <motion.div
        initial={{ opacity: 0, y: -14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}

/* ══════════════════ 1 · AURORA ══════════════════
   A rotating marigold "aurora" ring behind a frosted pill, a flickering diya,
   and petals drifting up through the panel. Modern, glowing, minimal. */
function AuroraBanner({ text, ctaLabel, href = "/register", deadline }: Props) {
  const daysLeft = useDaysLeft(deadline);
  return (
    <div className="relative rounded-2xl p-[1.6px] overflow-hidden shadow-[0_10px_40px_-12px_rgba(179,64,42,0.45)]">
      <motion.div
        aria-hidden
        className="absolute -inset-[60%] -z-0"
        style={{
          background:
            "conic-gradient(from 0deg, var(--sindoor), #f2a63b, var(--terracotta), transparent 55%, var(--sindoor))",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 7, ease: "linear", repeat: Infinity }}
      />
      <div
        className="relative z-[1] rounded-[calc(1rem-1px)] px-5 py-3.5 md:px-7 md:py-4 flex items-center gap-4 md:gap-5 flex-wrap md:flex-nowrap overflow-hidden"
        style={{ background: "color-mix(in srgb, var(--card) 92%, transparent)", backdropFilter: "blur(6px)" }}
      >
        {[
          { left: "18%", delay: 0, dur: 6 },
          { left: "52%", delay: 1.4, dur: 7.5 },
          { left: "80%", delay: 2.6, dur: 6.8 },
        ].map((p, i) => (
          <motion.span
            key={i}
            aria-hidden
            className="pointer-events-none absolute bottom-0 w-1.5 h-2.5 rounded-full"
            style={{ left: p.left, background: "var(--terracotta)", opacity: 0.35 }}
            animate={{ y: [-2, -34], x: [0, 8, -4], rotate: [0, 90, 160], opacity: [0, 0.4, 0] }}
            transition={{ duration: p.dur, delay: p.delay, ease: "easeOut", repeat: Infinity }}
          />
        ))}
        <motion.span
          aria-hidden
          className="text-2xl md:text-3xl shrink-0 leading-none"
          style={{ filter: "drop-shadow(0 0 10px rgba(242,166,59,0.8))" }}
          animate={{ scale: [1, 1.12, 0.97, 1.08, 1], opacity: [1, 0.85, 1, 0.9, 1] }}
          transition={{ duration: 2.2, ease: "easeInOut", repeat: Infinity }}
        >
          🪔
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "var(--terracotta)" }}>
            Registration open
          </p>
          <p className="font-semibold leading-snug text-[15px] md:text-base" style={{ color: "var(--ink)" }}>
            {text}
          </p>
        </div>
        {daysLeft !== null && (
          <span
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
            style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}
          >
            <motion.span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: "var(--sindoor)" }}
              animate={{ opacity: [1, 0.3, 1], scale: [1, 1.4, 1] }}
              transition={{ duration: 1.3, repeat: Infinity }}
            />
            {daysLabel(daysLeft)}
          </span>
        )}
        {ctaLabel && <Cta label={ctaLabel} href={href} />}
      </div>
    </div>
  );
}

/* ══════════════════ 2 · ALPONA ══════════════════
   The border draws itself like wet alpona on a courtyard floor (SVG pathLength),
   with a genda-phool garland swaying above and a gold shimmer over the message.
   Traditional craft, rendered with modern motion. */
function AlponaBanner({ text, ctaLabel, href = "/register", deadline }: Props) {
  const daysLeft = useDaysLeft(deadline);
  return (
    <div
      className="relative rounded-2xl overflow-hidden pt-6"
      style={{ background: "linear-gradient(180deg, var(--accent-soft), var(--card))", border: "1px solid var(--line)" }}
    >
      {/* swaying marigold garland along the top edge */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-between px-3" aria-hidden>
        {Array.from({ length: 22 }).map((_, i) => (
          <motion.span
            key={i}
            className="block rounded-full"
            style={{
              width: i % 3 === 0 ? 11 : 8,
              height: i % 3 === 0 ? 11 : 8,
              background: i % 3 === 0 ? "#f2a63b" : i % 3 === 1 ? "var(--sindoor)" : "var(--terracotta)",
              transformOrigin: "50% -14px",
            }}
            animate={{ rotate: [-7, 7, -7], y: [0, 2, 0] }}
            transition={{ duration: 3.4, ease: "easeInOut", repeat: Infinity, delay: i * 0.09 }}
          />
        ))}
      </div>

      {/* self-drawing alpona line art */}
      <svg className="pointer-events-none absolute inset-0 w-full h-full" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden>
        <motion.path
          d="M8,60 C 120,8 200,112 320,60 S 520,8 640,60 S 840,112 960,60 S 1120,8 1192,60"
          fill="none"
          stroke="var(--sindoor)"
          strokeWidth="1.6"
          strokeOpacity="0.35"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 3.2, ease: "easeInOut", repeat: Infinity, repeatType: "reverse" }}
        />
        <motion.path
          d="M8,86 C 140,40 240,120 360,86 S 560,40 700,86 S 900,120 1040,86 S 1150,52 1192,86"
          fill="none"
          stroke="#f2a63b"
          strokeWidth="1.2"
          strokeOpacity="0.45"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 4, ease: "easeInOut", repeat: Infinity, repeatType: "reverse", delay: 0.5 }}
        />
      </svg>

      <div className="relative z-[1] px-5 py-4 md:px-7 md:py-5 flex items-center gap-4 md:gap-5 flex-wrap md:flex-nowrap">
        {/* dhaak-beat pulse behind the icon */}
        <span className="relative shrink-0 grid place-items-center w-11 h-11">
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ border: "2px solid var(--sindoor)" }}
            animate={{ scale: [1, 1.55], opacity: [0.55, 0] }}
            transition={{ duration: 1.6, ease: "easeOut", repeat: Infinity }}
          />
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{ border: "2px solid #f2a63b" }}
            animate={{ scale: [1, 1.55], opacity: [0.5, 0] }}
            transition={{ duration: 1.6, ease: "easeOut", repeat: Infinity, delay: 0.8 }}
          />
          <motion.span
            className="text-2xl leading-none"
            animate={{ rotate: [-9, 9, -9] }}
            transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity }}
          >
            🥁
          </motion.span>
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-[family-name:var(--font-bangla)] text-sm" style={{ color: "var(--terracotta)" }}>
            নাম লেখান
          </p>
          <motion.p
            className="font-semibold leading-snug text-[15px] md:text-base bg-clip-text"
            style={{
              color: "transparent",
              backgroundImage:
                "linear-gradient(90deg, var(--ink) 0%, var(--ink) 35%, #f2a63b 50%, var(--ink) 65%, var(--ink) 100%)",
              backgroundSize: "220% 100%",
            }}
            animate={{ backgroundPositionX: ["120%", "-120%"] }}
            transition={{ duration: 4.5, ease: "linear", repeat: Infinity }}
          >
            {text}
          </motion.p>
        </div>

        {daysLeft !== null && (
          <span
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold"
            style={{ background: "var(--card)", color: "var(--sindoor)", border: "1px solid var(--sindoor)" }}
          >
            {daysLabel(daysLeft)}
          </span>
        )}
        {ctaLabel && <Cta label={ctaLabel} href={href} />}
      </div>
    </div>
  );
}

/* ══════════════════ 3 · TORAN ══════════════════
   A deep sindoor panel hung with marigold-and-leaf toran strings that swing on
   a pendulum, with dhunuchi smoke curling up behind. Theatrical, festive. */
function ToranBanner({ text, ctaLabel, href = "/register", deadline }: Props) {
  const daysLeft = useDaysLeft(deadline);
  return (
    <div
      className="relative rounded-2xl overflow-hidden pt-7 shadow-[0_14px_44px_-16px_rgba(120,26,16,0.7)]"
      style={{ background: "linear-gradient(135deg, #8f2718 0%, var(--sindoor) 55%, #a8331f 100%)" }}
    >
      {/* dhunuchi smoke */}
      {[
        { left: "12%", delay: 0, dur: 7 },
        { left: "38%", delay: 2.2, dur: 8.5 },
        { left: "72%", delay: 1.1, dur: 7.8 },
        { left: "90%", delay: 3.4, dur: 9 },
      ].map((s, i) => (
        <motion.span
          key={i}
          aria-hidden
          className="pointer-events-none absolute bottom-0 rounded-full"
          style={{ left: s.left, width: 46, height: 46, background: "rgba(255,255,255,0.16)", filter: "blur(12px)" }}
          animate={{ y: [10, -70], x: [0, 16, -10], scale: [0.6, 1.5], opacity: [0, 0.5, 0] }}
          transition={{ duration: s.dur, delay: s.delay, ease: "easeOut", repeat: Infinity }}
        />
      ))}

      {/* hanging toran strings */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-around px-4" aria-hidden>
        {Array.from({ length: 14 }).map((_, i) => (
          <motion.span
            key={i}
            className="flex flex-col items-center"
            style={{ transformOrigin: "50% 0%" }}
            animate={{ rotate: [-6, 6, -6] }}
            transition={{ duration: 3.6, ease: "easeInOut", repeat: Infinity, delay: i * 0.12 }}
          >
            <span className="block w-px" style={{ height: i % 2 ? 14 : 22, background: "rgba(255,255,255,0.4)" }} />
            <span
              className="block rounded-full"
              style={{ width: 9, height: 9, background: "#f2a63b", boxShadow: "0 0 8px rgba(242,166,59,0.9)" }}
            />
            <span
              className="block rounded-full -mt-0.5"
              style={{ width: 6, height: 6, background: i % 2 ? "#ffd88a" : "#5c9a4a" }}
            />
          </motion.span>
        ))}
      </div>

      <div className="relative z-[1] px-5 py-4 md:px-7 md:py-5 flex items-center gap-4 md:gap-5 flex-wrap md:flex-nowrap">
        <motion.span
          aria-hidden
          className="text-2xl md:text-3xl shrink-0 leading-none"
          style={{ filter: "drop-shadow(0 0 12px rgba(255,214,138,0.95))" }}
          animate={{ scale: [1, 1.14, 0.98, 1.1, 1], rotate: [0, 3, -3, 0] }}
          transition={{ duration: 2.6, ease: "easeInOut", repeat: Infinity }}
        >
          🪔
        </motion.span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: "#ffd88a" }}>
            Durga Pujo 2026 · registration open
          </p>
          <p className="font-semibold leading-snug text-[15px] md:text-base text-white">{text}</p>
        </div>
        {daysLeft !== null && (
          <motion.span
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-black"
            style={{ background: "#ffd88a", color: "#8f2718" }}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ duration: 1.8, ease: "easeInOut", repeat: Infinity }}
          >
            {daysLabel(daysLeft)}
          </motion.span>
        )}
        {ctaLabel && <Cta label={ctaLabel} href={href} dark />}
      </div>
    </div>
  );
}

export default function HomeBanner({ style = "aurora", ...props }: Props) {
  return (
    <Shell>
      {style === "alpona" ? <AlponaBanner {...props} /> : style === "toran" ? <ToranBanner {...props} /> : <AuroraBanner {...props} />}
    </Shell>
  );
}
