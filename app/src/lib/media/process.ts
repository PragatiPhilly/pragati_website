/**
 * Image processing pipeline (server-only).
 *
 * Takes an uploaded image of any size/orientation and produces a small set of
 * responsive WebP variants plus a tiny inline blur placeholder. This is what
 * keeps the site fast: originals may be 5000px phone photos, but the browser
 * only ever downloads a right-sized WebP (typically 30–150 KB) chosen via
 * srcset, and sees the blur instantly with zero layout shift.
 *
 * Storage:
 * - BLOB_READ_WRITE_TOKEN set (production/Vercel) → variants go to Vercel
 *   Blob under media/<base>-<w>.webp; /media/* requests are redirected there
 *   by src/app/media/[name]/route.ts.
 * - No token (local dev) → variants are written to public/media and served
 *   statically, exactly as before.
 */
import { randomBytes } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { blobEnabled, putBlob, delBlobs, getBlobBaseUrl } from "@/lib/blob";

// Re-export so existing importers (e.g. the /media route) keep working.
export { getBlobBaseUrl };

// Responsive widths we generate. Never upscale past the original.
const WIDTHS = [480, 1024, 1920];
const WEBP_QUALITY = 80;

export const MEDIA_DIR = path.join(process.cwd(), "public", "media");

const useBlob = blobEnabled;

export type ProcessedImage = {
  fileBase: string;
  width: number; // post-rotation, largest stored variant maps to this
  height: number;
  variants: number[]; // widths actually written, ascending
  blurDataUrl: string;
  bytes: number; // size of the largest variant (representative)
};

function variantName(fileBase: string, width: number) {
  return `${fileBase}-${width}.webp`;
}

export function variantUrl(fileBase: string, width: number) {
  return `/media/${variantName(fileBase, width)}`;
}

/** Dimensions after EXIF auto-rotation (sharp swaps for orientation 5–8). */
async function orientedSize(input: Buffer): Promise<{ w: number; h: number }> {
  const meta = await sharp(input).metadata();
  let w = meta.width ?? 0;
  let h = meta.height ?? 0;
  if (meta.orientation && meta.orientation >= 5) [w, h] = [h, w];
  return { w, h };
}

async function storeVariant(fileBase: string, width: number, buf: Buffer): Promise<void> {
  if (useBlob()) {
    // putBlob picks the right access for a public OR private store and records
    // both the store origin and access mode for the /media/* serving route.
    await putBlob(`media/${variantName(fileBase, width)}`, buf, {
      contentType: "image/webp",
      addRandomSuffix: false, // deterministic path → simple redirect / stream from /media/*
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    });
    return;
  }
  await mkdir(MEDIA_DIR, { recursive: true });
  await writeFile(path.join(MEDIA_DIR, variantName(fileBase, width)), buf);
}

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const { w, h } = await orientedSize(input);
  if (!w || !h) throw new Error("Not a valid image.");

  const maxW = Math.min(w, 1920);
  const targets = Array.from(new Set([...WIDTHS.filter((x) => x < maxW), maxW])).sort(
    (a, b) => a - b,
  );

  const fileBase = randomBytes(6).toString("hex");
  let largestBytes = 0;

  for (const width of targets) {
    const buf = await sharp(input)
      .rotate() // apply EXIF orientation, then strip it
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 4 })
      .toBuffer();
    await storeVariant(fileBase, width, buf);
    largestBytes = buf.length; // targets ascend, so the last one is the largest
  }

  // Tiny 20px-wide blur used as an instant placeholder (inlined in the DB).
  const blurBuf = await sharp(input)
    .rotate()
    .resize({ width: 20 })
    .webp({ quality: 40 })
    .toBuffer();
  const blurDataUrl = `data:image/webp;base64,${blurBuf.toString("base64")}`;

  return { fileBase, width: w, height: h, variants: targets, blurDataUrl, bytes: largestBytes };
}

export async function deleteImageFiles(fileBase: string, variants: number[]): Promise<void> {
  if (useBlob()) {
    // Delete by pathname — works for both public and private stores.
    await delBlobs(variants.map((w) => `media/${variantName(fileBase, w)}`));
    return;
  }
  await Promise.all(
    variants.map((w) => unlink(path.join(MEDIA_DIR, variantName(fileBase, w))).catch(() => {})),
  );
}
