"use client";

/**
 * Crossfading slideshow that lives in the mission / community panel, filling
 * the 4:5 portrait frame that used to hold the kalash illustration. Portraits
 * fill it edge-to-edge; landscapes sit centred over a frosted blur of
 * themselves, so every photo looks composed. Keeps the "Est. 2012" badge.
 */
import { useEffect, useState } from "react";
import MediaImg, { type PhotoData } from "./MediaImg";
import { site } from "@/config/site";

export default function PhotoSlideshow({
  photos,
  intervalMs = 4200,
}: {
  photos: PhotoData[];
  intervalMs?: number;
}) {
  const [i, setI] = useState(0);
  const n = photos.length;

  useEffect(() => {
    if (n <= 1) return;
    const t = setInterval(() => setI((c) => (c + 1) % n), intervalMs);
    return () => clearInterval(t);
  }, [n, intervalMs]);

  if (n === 0) return null;

  return (
    <div
      className="relative rounded-[28px] overflow-hidden aspect-[4/5]"
      style={{ background: "var(--bg-soft)", boxShadow: "var(--shadow)" }}
    >
      {photos.map((p, idx) => (
        <div
          key={p.fileBase}
          className="absolute inset-0 transition-opacity duration-[1200ms]"
          style={{ opacity: idx === i ? 1 : 0 }}
          aria-hidden={idx !== i}
        >
          <MediaImg
            photo={p}
            fit="blurfill"
            sizes="(max-width: 768px) 90vw, 480px"
            priority={idx === 0}
            alt="Pragati community over the years"
          />
        </div>
      ))}

      <div className="marigold-string" style={{ position: "absolute", top: 0, left: 0, right: 0 }} />

      {n > 1 && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-1.5 z-[3]">
          {photos.map((p, idx) => (
            <button
              key={p.fileBase}
              aria-label={`Photo ${idx + 1}`}
              onClick={() => setI(idx)}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: idx === i ? 20 : 6,
                background: idx === i ? "var(--marigold-bright)" : "rgba(255,255,255,0.7)",
              }}
            />
          ))}
        </div>
      )}

      <div
        className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs font-bold tracking-wide rounded-full px-4 py-2 whitespace-nowrap z-[3]"
        style={{ background: "var(--card)", color: "var(--terracotta)", boxShadow: "0 6px 18px rgba(0,0,0,0.12)" }}
      >
        <span className="font-[family-name:var(--font-bangla)]">প্রতিষ্ঠা ২০১২</span> · Est. {site.foundedYear}
      </div>
    </div>
  );
}
