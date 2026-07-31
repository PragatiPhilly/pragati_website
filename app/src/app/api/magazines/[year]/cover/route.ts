/**
 * Public magazine cover thumbnail — stable URL per year, so the homepage shelf
 * doesn't care whether the image sits in a public Blob store, a private one, or
 * the local public/ folder.
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
  if (!mag?.coverUrl) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (mag.coverUrl.startsWith(BLOB_PATH_PREFIX)) {
    const file = await getBlobStream(mag.coverUrl.slice(BLOB_PATH_PREFIX.length));
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(file.stream, {
      headers: {
        "Content-Type": file.contentType || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  const url = mag.coverUrl.startsWith("http") ? mag.coverUrl : new URL(mag.coverUrl, req.url).toString();
  return NextResponse.redirect(url, 307);
}
