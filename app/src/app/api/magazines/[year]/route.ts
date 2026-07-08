/**
 * Public magazine download — stable URL per year (/api/magazines/2024)
 * regardless of where the PDF physically lives (Vercel Blob or local dev).
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensureScanTables } from "@/lib/scans/ensure";

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

  // Blob URLs are absolute; local-dev files live under /magazines/ in public/
  const url = mag.fileUrl.startsWith("http") ? mag.fileUrl : new URL(mag.fileUrl, req.url).toString();
  return NextResponse.redirect(url, 307);
}
