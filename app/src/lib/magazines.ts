/**
 * Magazine PDF storage + queries.
 *
 * Production (Vercel): PDFs go to Vercel Blob — set BLOB_READ_WRITE_TOKEN
 * (Storage → Blob in the Vercel dashboard; the token is added automatically
 * when you connect a Blob store to the project).
 * Local dev (no token): PDFs are written to public/magazines/ and served
 * statically — zero setup, same URLs shape.
 */
import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensureScanTables } from "@/lib/scans/ensure";
import { blobEnabled, putBlob, delBlobs } from "@/lib/blob";

export type Magazine = typeof schema.magazines.$inferSelect;

/** Marker prefix for a private-store blob whose bytes we stream ourselves. */
export const BLOB_PATH_PREFIX = "blob:";

export async function listMagazines(): Promise<Magazine[]> {
  await ensureScanTables();
  const db = getDb();
  return db.select().from(schema.magazines).orderBy(desc(schema.magazines.year));
}

const useBlob = blobEnabled;

/**
 * Store a magazine PDF; returns a value for `magazines.file_url`:
 *   • public store  → absolute CDN URL (the download route 307-redirects to it)
 *   • private store → "blob:<pathname>" (the download route streams the bytes)
 *   • local dev     → "/magazines/<name>.pdf" (served statically from public/)
 */
export async function storeMagazinePdf(year: number, buf: Buffer): Promise<string> {
  if (useBlob()) {
    const res = await putBlob(`magazines/pragati-magazine-${year}.pdf`, buf, {
      contentType: "application/pdf",
      addRandomSuffix: true, // re-uploads for the same year don't collide
    });
    return res.access === "private" ? `${BLOB_PATH_PREFIX}${res.pathname}` : res.url;
  }
  // local dev fallback — write into public/ so Next serves it statically
  const { mkdir, writeFile } = await import("fs/promises");
  const path = await import("path");
  const dir = path.join(process.cwd(), "public", "magazines");
  await mkdir(dir, { recursive: true });
  const name = `pragati-magazine-${year}-${Date.now().toString(36)}.pdf`;
  await writeFile(path.join(dir, name), buf);
  return `/magazines/${name}`;
}

/** Best-effort delete of the stored file (Blob only; local files are harmless). */
export async function deleteMagazinePdf(fileUrl: string): Promise<void> {
  try {
    if (fileUrl.startsWith(BLOB_PATH_PREFIX)) {
      await delBlobs([fileUrl.slice(BLOB_PATH_PREFIX.length)]);
    } else if (useBlob() && fileUrl.startsWith("https://")) {
      const { del } = await import("@vercel/blob");
      await del(fileUrl);
    } else if (fileUrl.startsWith("/magazines/")) {
      const { unlink } = await import("fs/promises");
      const path = await import("path");
      await unlink(path.join(process.cwd(), "public", fileUrl));
    }
  } catch {
    /* file already gone — fine */
  }
}
