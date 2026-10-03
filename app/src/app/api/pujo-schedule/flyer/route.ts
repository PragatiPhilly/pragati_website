/**
 * The Pujo flyer, at a stable URL whatever store it lives in.
 *
 *   GET /api/pujo-schedule/flyer?f=display|download
 *
 * Private Blob store → stream the bytes (its URLs aren't publicly fetchable);
 * public store / bundled file → redirect. `f=download` sends it as an attachment.
 */
import { NextResponse } from "next/server";
import { getPujoSchedule, BLOB_PREFIX } from "@/lib/pujo-schedule/server";
import { publicFlyer } from "@/lib/pujo-schedule/model";
import { getBlobStream } from "@/lib/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const want = new URL(req.url).searchParams.get("f") === "download" ? "download" : "display";
  const s = await getPujoSchedule();
  const pub = publicFlyer(s);
  if (!s.flyer || !pub || (want === "download" && !pub.download) || (want === "display" && !pub.src)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const ref = want === "download" ? s.flyer.download : s.flyer.display;

  if (ref.startsWith(BLOB_PREFIX)) {
    const file = await getBlobStream(ref.slice(BLOB_PREFIX.length));
    if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const headers: Record<string, string> = {
      "Content-Type": file.contentType || "image/jpeg",
      "Cache-Control": "public, max-age=300",
    };
    if (want === "download") headers["Content-Disposition"] = `attachment; filename="${pub.fileName}"`;
    return new NextResponse(file.stream, { headers });
  }

  const target = want === "download" ? pub.download! : ref;
  return NextResponse.redirect(new URL(target, req.url), 307);
}
