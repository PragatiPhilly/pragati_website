/**
 * Pujo schedule — server side: reading the stored schedule, the venue line for
 * calendar entries, and flyer file storage. Never import this from a
 * "use client" file (it reaches the database through system-config).
 */
import { getConfig, setConfig } from "@/lib/system-config";
import { blobEnabled, putBlob, delBlobs } from "@/lib/blob";
import { BUNDLED_FLYER, sanitizeSchedule, type PujoSchedule } from "./model";

export const CONFIG_KEY = "pujo_schedule";

/** The stored schedule, cleaned. Never throws — on any fault the section just hides. */
export async function getPujoSchedule(): Promise<PujoSchedule> {
  try {
    return sanitizeSchedule(await getConfig<unknown>(CONFIG_KEY));
  } catch (e) {
    console.error("[pujo-schedule] read failed:", e);
    return sanitizeSchedule(null);
  }
}

export async function savePujoSchedule(s: PujoSchedule, userId?: string): Promise<void> {
  await setConfig(CONFIG_KEY, s, userId);
}

/** "Venue name, address" for calendar entries; null when the event has none. */
export function venueLine(ev: { venueName?: string | null; venueAddress?: string | null } | null | undefined): string | null {
  if (!ev) return null;
  const line = [ev.venueName, ev.venueAddress].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");
  return line || null;
}

// ── flyer files ─────────────────────────────────────────────────────────────

const BLOB_PREFIX = "blob:";

/**
 * Store one flyer file and return the reference kept in the schedule:
 * public Blob URL, "blob:<pathname>" for a private store, or a /pujo/uploads path locally.
 */
export async function storeFlyerFile(name: string, buf: Buffer, contentType: string): Promise<string> {
  if (blobEnabled()) {
    const res = await putBlob(`pujo/${name}`, buf, { contentType, addRandomSuffix: false, cacheControlMaxAge: 60 * 60 * 24 * 365 });
    return res.access === "private" ? `${BLOB_PREFIX}${res.pathname}` : res.url;
  }
  const { mkdir, writeFile } = await import("fs/promises");
  const path = await import("path");
  const dir = path.join(process.cwd(), "public", "pujo", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buf);
  return `/pujo/uploads/${name}`;
}

/** Best-effort delete. The bundled flyer is never touched. */
export async function deleteFlyerFile(ref: string | undefined | null): Promise<void> {
  if (!ref || ref === BUNDLED_FLYER.display || ref === BUNDLED_FLYER.download) return;
  try {
    if (ref.startsWith(BLOB_PREFIX)) {
      await delBlobs([ref.slice(BLOB_PREFIX.length)]);
    } else if (ref.startsWith("https://") && blobEnabled()) {
      const { del } = await import("@vercel/blob");
      await del(ref);
    } else if (ref.startsWith("/pujo/uploads/")) {
      const { unlink } = await import("fs/promises");
      const path = await import("path");
      await unlink(path.join(process.cwd(), "public", ref.replace(/^\/+/, ""))).catch(() => {});
    }
  } catch (e) {
    console.error("[pujo-schedule] flyer delete failed:", e);
  }
}

export { BLOB_PREFIX };
