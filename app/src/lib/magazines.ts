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

export type Magazine = typeof schema.magazines.$inferSelect;

export async function listMagazines(): Promise<Magazine[]> {
  await ensureScanTables();
  const db = getDb();
  return db.select().from(schema.magazines).orderBy(desc(schema.magazines.year));
}

const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/** Store a magazine PDF; returns its public URL. */
export async function storeMagazinePdf(year: number, buf: Buffer): Promise<string> {
  if (useBlob()) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`magazines/pragati-magazine-${year}.pdf`, buf, {
      access: "public",
      contentType: "application/pdf",
      addRandomSuffix: true, // re-uploads for the same year don't collide
    });
    return blob.url;
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
    if (useBlob() && fileUrl.startsWith("https://")) {
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
