"use client";

/**
 * Leadership — the Executive Committee and the Board of Trustees, side by side.
 *
 * As the section reaches the viewport the two boards fly in from opposite edges
 * of the screen and meet in the middle, straightening from a tilt like two
 * framed photos being hung.
 *
 * Robustness note: the panels start off-screen and clipped, so if the reveal
 * never fired the section would render blank. Rather than relying on
 * `whileInView`, this drives the animation from an IntersectionObserver we own,
 * with a timer as a backstop — if anything at all goes wrong (observer
 * unsupported, callback missed, element measured oddly) the boards are shown
 * anyway. Content must never be able to stay hidden.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

export type Board = {
  src: string;
  alt: string;
  title: string;
  bn: string;
  meta?: string;
};

export default function LeadershipBoards({ boards }: { boards: [Board, Board] }) {
  const reduce = useReducedMotion();
  const [zoom, setZoom] = useState<Board | null>(null);
  const [shown, setShown] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    // Backstop: reveal regardless after a moment, so a missed observer callback
    // can never leave the section empty.
    const failsafe = setTimeout(() => setShown(true), 2500);

    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return () => clearTimeout(failsafe);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
          clearTimeout(failsafe);
        }
      },
      { threshold: 0.08 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(failsafe);
    };
  }, []);

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoom]);

  return (
    <>
      {/* clip-x so the off-screen start positions never create a sideways scrollbar */}
      <div
        ref={wrapRef}
        className="grid md:grid-cols-2 gap-8 md:gap-7 max-w-6xl mx-auto"
        style={{ overflowX: "clip" }}
      >
        {boards.map((b, i) => {
          const fromLeft = i === 0;
          const hidden = reduce
            ? { opacity: 0, y: 24 }
            : { opacity: 0, x: fromLeft ? "-115%" : "115%", rotate: fromLeft ? -7 : 7, scale: 0.88 };
          const visible = reduce
            ? { opacity: 1, y: 0 }
            : { opacity: 1, x: "0%", rotate: 0, scale: 1 };
          return (
            <motion.figure
              key={b.src}
              className="m-0"
              initial={false}
              animate={shown ? visible : hidden}
              transition={
                reduce
                  ? { duration: 0.4 }
                  : {
                      type: "spring",
                      stiffness: 52,
                      damping: 15, // slight overshoot, then settles
                      mass: 1.1,
                      delay: i * 0.18,
                      opacity: { duration: 0.45, delay: i * 0.18 },
                    }
              }
            >
              <button
                type="button"
                onClick={() => setZoom(b)}
                className="group block w-full rounded-[20px] overflow-hidden bg-transparent border-0 p-0 cursor-zoom-in"
                style={{ boxShadow: "var(--shadow)" }}
                aria-label={`View ${b.title} larger`}
              >
                {/* eager: the panel must not fly in as an empty box */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.src}
                  alt={b.alt}
                  loading="eager"
                  className="w-full h-auto block transition-transform duration-500 group-hover:scale-[1.02]"
                />
              </button>
              <motion.figcaption
                className="text-center mt-4"
                initial={false}
                animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
                transition={{ duration: 0.5, delay: shown ? 0.55 + i * 0.18 : 0, ease: "easeOut" }}
              >
                <p
                  className="font-[family-name:var(--font-bangla)] text-lg leading-none mb-1"
                  style={{ color: "var(--terracotta)" }}
                >
                  {b.bn}
                </p>
                <p className="font-[family-name:var(--font-display)] text-xl font-black" style={{ color: "var(--ink)" }}>
                  {b.title}
                </p>
                {b.meta && (
                  <p className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                    {b.meta}
                  </p>
                )}
                <p className="text-[11px] mt-1.5 opacity-70" style={{ color: "var(--ink-soft)" }}>
                  tap to enlarge
                </p>
              </motion.figcaption>
            </motion.figure>
          );
        })}
      </div>

      {/* full-screen view — the names inside these photos are small */}
      {zoom && (
        <div
          className="fixed inset-0 z-[90] flex flex-col items-center justify-center p-4 sm:p-8 cursor-zoom-out"
          style={{ background: "rgba(20,12,8,0.92)" }}
          onClick={() => setZoom(null)}
          role="dialog"
          aria-modal="true"
          aria-label={zoom.title}
        >
          <motion.img
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22 }}
            src={zoom.src}
            alt={zoom.alt}
            className="max-w-full max-h-[82vh] rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="mt-4 text-center text-white/90 font-semibold">
            <span className="font-[family-name:var(--font-bangla)] mr-2" style={{ color: "var(--marigold-pale, #FFD88A)" }}>
              {zoom.bn}
            </span>
            {zoom.title}
            {zoom.meta ? ` · ${zoom.meta}` : ""}
          </p>
          <button
            className="mt-4 rounded-full px-5 py-2 text-sm font-bold"
            style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
            onClick={() => setZoom(null)}
          >
            Close ✕
          </button>
        </div>
      )}
    </>
  );
}
