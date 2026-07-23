/**
 * Public magazine download — stable URL per year (/api/magazines/2024)
 * regardless of where the PDF physically lives (Vercel Blob or local dev).
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensureScanTables } from "@/lib/scans/ensure";
import { BLOB_PATH_PREFIX } from "@/lib/magazines";
import { getBlobStream } from "@/lib/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ year: string }> }) {
  const { year: rawYear } = await params;
  const year = parseInt(rawYear, 10);
  if (!Number.isInteger(year)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await ensureScanTables();
  const db = getDb();
  const [mag] = await db.select().from(schema.magazines).where(eq(schema.magazines.year, year));
  if (!mag) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Private-store PDF ("blob:<pathname>") → stream the bytes; the private Blob
  // URL isn't publicly fetchable so a redirect would 401.
  if (mag.fileUrl.startsWith(BLOB_PATH_PREFIX)) {
    const file = await getBlobStream(mag.fileUrl.slice(BLOB_PATH_PREFIX.length));
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(file.stream, {
      headers: {
        "Content-Type": file.contentType || "application/pdf",
        "Content-Disposition": `inline; filename="pragati-magazine-${year}.pdf"`,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Public Blob URLs are absolute; local-dev files live under /magazines/ in public/
  const url = mag.fileUrl.startsWith("http") ? mag.fileUrl : new URL(mag.fileUrl, req.url).toString();
  return NextResponse.redirect(url, 307);
}
