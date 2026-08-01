"use client";

/**
 * Leadership — the Executive Committee and the Board of Trustees, side by side.
 *
 * As the section scrolls into view the two boards fly in from opposite sides and
 * settle into place, straightening from a slight tilt (like two framed photos
 * being hung). They stagger, so the eye lands on one and then the other.
 *
 * Both are wide group photos with names printed inside them, so at half width
 * those names get small — tapping either one opens it full screen, which is
 * also the natural gesture on a phone.
 */
import { useEffect, useState } from "react";
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
      <div className="grid md:grid-cols-2 gap-8 md:gap-7 max-w-6xl mx-auto">
        {boards.map((b, i) => {
          const fromLeft = i === 0;
          return (
            <motion.figure
              key={b.src}
              className="m-0"
              initial={
                reduce
                  ? { opacity: 0 }
                  : { opacity: 0, x: fromLeft ? -70 : 70, rotate: fromLeft ? -2.5 : 2.5, scale: 0.96 }
              }
              whileInView={reduce ? { opacity: 1 } : { opacity: 1, x: 0, rotate: 0, scale: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.85, delay: i * 0.16, ease: [0.22, 1, 0.36, 1] }}
            >
              <button
                type="button"
                onClick={() => setZoom(b)}
                className="group block w-full rounded-[20px] overflow-hidden bg-transparent border-0 p-0 cursor-zoom-in"
                style={{ boxShadow: "var(--shadow)" }}
                aria-label={`View ${b.title} larger`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={b.src}
                  alt={b.alt}
                  className="w-full h-auto block transition-transform duration-500 group-hover:scale-[1.02]"
                />
              </button>
              <figcaption className="text-center mt-4">
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
              </figcaption>
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
