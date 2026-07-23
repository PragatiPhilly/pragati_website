/**
 * /media/<base>-<width>.webp in production.
 *
 * Locally these files sit in public/media and Next serves them statically
 * (static files win over this route). On Vercel the filesystem is read-only, so
 * uploads live in Vercel Blob:
 *   • public store  → 308-redirect to the CDN-backed public Blob URL (fast; the
 *     browser caches the redirect so the hop costs ~nothing).
 *   • private store → the Blob URL isn't publicly fetchable, so we stream the
 *     bytes through this route instead (still edge-cached via Cache-Control).
 */
import { NextResponse } from "next/server";
import { getBlobBaseUrl, getBlobAccess, getBlobStream } from "@/lib/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAME_RE = /^[a-f0-9]{6,32}-\d{2,4}\.webp$/;
const IMMUTABLE = "public, max-age=31536000, immutable";

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!NAME_RE.test(name)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if ((await getBlobAccess()) === "private") {
    const file = await getBlobStream(`media/${name}`);
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(file.stream, {
      headers: { "Content-Type": file.contentType || "image/webp", "Cache-Control": IMMUTABLE },
    });
  }

  const base = await getBlobBaseUrl();
  if (!base) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.redirect(`${base}/media/${name}`, {
    status: 308,
    headers: { "Cache-Control": IMMUTABLE },
  });
}
