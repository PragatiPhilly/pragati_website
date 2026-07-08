/**
 * /media/<base>-<width>.webp in production.
 *
 * Locally these files sit in public/media and Next serves them statically
 * (static files win over this route). On Vercel the filesystem is read-only,
 * so uploads live in Vercel Blob — this route 308-redirects each variant to
 * its Blob URL. Browsers cache the redirect, so the hop costs ~nothing.
 */
import { NextResponse } from "next/server";
import { getBlobBaseUrl } from "@/lib/media/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_RE = /^[a-f0-9]{6,32}-\d{2,4}\.webp$/;

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!NAME_RE.test(name)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const base = await getBlobBaseUrl();
  if (!base) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.redirect(`${base}/media/${name}`, {
    status: 308,
    headers: { "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
