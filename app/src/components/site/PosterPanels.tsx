"use client";

/**
 * Two side-by-side portrait panels, each cross-fading through its own posters.
 * Admins add posters to a single pool (Media Library → "Event posters"); the
 * pool is auto-split across the two panels here. Falls back gracefully: one
 * poster → one panel; the homepage renders the static lineup when none exist.
 */
import { useEffect, useState } from "react";
import MediaImg, { type PhotoData } from "./MediaImg";

function Panel({ photos, delay = 0 }: { photos: PhotoData[]; delay?: number }) {
  const [i, setI] = useState(0);
  const n = photos.length;
  useEffect(() => {
    if (n <= 1) return;
    const t = setInterval(() => setI((c) => (c + 1) % n), 5000 + delay);
    return () => clearInterval(t);
  }, [n, delay]);
  if (n === 0) return null;

  return (
    <div
      className="group relative rounded-[26px] overflow-hidden aspect-[4/5] hover:-translate-y-1.5 transition-transform duration-300"
      style={{ background: "#14100a", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}
    >
      {photos.map((p, idx) => (
        <div
          key={p.fileBase}
          className="absolute inset-0 transition-opacity duration-[1200ms]"
          style={{ opacity: idx === i ? 1 : 0 }}
          aria-hidden={idx !== i}
        >
          <MediaImg photo={p} fit="blurfill" sizes="(max-width: 768px) 92vw, 520px" priority={idx === 0} alt="Pragati event poster" />
        </div>
      ))}
      {n > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-[3]">
          {photos.map((p, idx) => (
            <button
              key={p.fileBase}
              aria-label={`Poster ${idx + 1}`}
              onClick={() => setI(idx)}
              className="h-1.5 rounded-full transition-all"
              style={{ width: idx === i ? 20 : 6, background: idx === i ? "var(--marigold-bright)" : "rgba(255,255,255,0.7)" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PosterPanels({ photos }: { photos: PhotoData[] }) {
  const left = photos.filter((_, i) => i % 2 === 0);
  const right = photos.filter((_, i) => i % 2 === 1);

  return (
    <div className={`grid gap-7 items-stretch ${right.length > 0 ? "md:grid-cols-2" : "max-w-md mx-auto"}`}>
      <Panel photos={left} delay={0} />
      {right.length > 0 && <Panel photos={right} delay={700} />}
    </div>
  );
}
