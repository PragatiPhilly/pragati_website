"use client";

/**
 * One responsive photo. Downloads the right-sized WebP via srcset, shows the
 * inline blur instantly (no layout shift), then fades the sharp image in.
 *
 * fit="cover"    → fills & crops the frame (uniform tiles)
 * fit="blurfill" → shows the whole photo (object-contain) over a frosted blur
 *                  of itself, so portraits and landscapes both look intentional
 *                  in any frame — never awkwardly cropped or letterboxed black.
 */
import { useState } from "react";

export type PhotoData = {
  fileBase: string;
  width: number;
  height: number;
  variants: number[];
  blurDataUrl: string;
};

function url(p: PhotoData, w: number) {
  return `/media/${p.fileBase}-${w}.webp`;
}
function srcSet(p: PhotoData) {
  return p.variants.map((w) => `${url(p, w)} ${w}w`).join(", ");
}

export default function MediaImg({
  photo,
  sizes = "100vw",
  fit = "cover",
  alt = "",
  priority = false,
  className = "",
}: {
  photo: PhotoData;
  sizes?: string;
  fit?: "cover" | "blurfill";
  alt?: string;
  priority?: boolean;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const largest = photo.variants[photo.variants.length - 1] ?? photo.variants[0];

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: `url(${photo.blurDataUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: fit === "blurfill" ? "blur(28px) saturate(1.1)" : "none",
          transform: fit === "blurfill" ? "scale(1.18)" : "none",
        }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url(photo, largest)}
        srcSet={srcSet(photo)}
        sizes={sizes}
        alt={alt}
        width={photo.width}
        height={photo.height}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`relative w-full h-full transition-opacity duration-700 ${fit === "cover" ? "object-cover" : "object-contain"}`}
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </div>
  );
}
