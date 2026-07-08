"use client";

/**
 * Auto-advancing crossfade carousel used inside the "Pragati by the numbers"
 * section — it slots between the dhaak beat animation and the number cards,
 * turning the section's empty centre into a reel of past-event memories while
 * the counting numbers below stay exactly as they were.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import MediaImg, { type PhotoData } from "./MediaImg";

export default function PhotoCarousel({
  photos,
  intervalMs = 4500,
}: {
  photos: PhotoData[];
  intervalMs?: number;
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const n = photos.length;

  const go = useCallback((next: number) => setI((next + n) % n), [n]);

  useEffect(() => {
    if (paused || n <= 1) return;
    const t = setInterval(() => setI((c) => (c + 1) % n), intervalMs);
    return () => clearInterval(t);
  }, [paused, n, intervalMs]);

  if (n === 0) return null;

  return (
    <div
      className="mt-10 mx-auto w-full max-w-4xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="marigold-string"
        style={{ position: "relative", height: 10, marginBottom: -4, opacity: 0.9 }}
      />
      <div
        className="relative rounded-[26px] overflow-hidden"
        style={{ boxShadow: "var(--shadow)", border: "1px solid var(--line)", background: "var(--card)" }}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1));
          touchX.current = null;
        }}
      >
        {/* stage — fixed aspect so the section keeps its rhythm */}
        <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
          {photos.map((p, idx) => (
            <div
              key={p.fileBase}
              className="absolute inset-0 transition-opacity duration-1000"
              style={{ opacity: idx === i ? 1 : 0, pointerEvents: idx === i ? "auto" : "none" }}
              aria-hidden={idx !== i}
            >
              <MediaImg
                photo={p}
                fit="blurfill"
                sizes="(max-width: 768px) 100vw, 900px"
                priority={idx === 0}
                alt="A memory from a past Pragati celebration"
              />
            </div>
          ))}
          {/* soft gradient so controls stay legible over any photo */}
          <div className="absolute inset-x-0 bottom-0 h-20 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.35), transparent)" }} />

          {n > 1 && (
            <>
              <button
                onClick={() => go(i - 1)}
                aria-label="Previous photo"
                className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-full text-lg transition-transform hover:scale-110"
                style={{ background: "rgba(255,255,255,0.85)", color: "var(--ink)" }}
              >
                ‹
              </button>
              <button
                onClick={() => go(i + 1)}
                aria-label="Next photo"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 grid place-items-center rounded-full text-lg transition-transform hover:scale-110"
                style={{ background: "rgba(255,255,255,0.85)", color: "var(--ink)" }}
              >
                ›
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {photos.map((p, idx) => (
                  <button
                    key={p.fileBase}
                    aria-label={`Go to photo ${idx + 1}`}
                    onClick={() => setI(idx)}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: idx === i ? 22 : 6,
                      background: idx === i ? "var(--marigold-bright)" : "rgba(255,255,255,0.6)",
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <p className="text-center text-xs mt-3 font-[family-name:var(--font-bangla)]" style={{ color: "var(--terracotta)" }}>
        স্মৃতির অ্যালবাম · moments from years past
      </p>
    </div>
  );
}
