/**
 * Store a magazine cover thumbnail (page 1, rendered in the browser).
 *
 * These are small JPEGs — a few hundred KB at most — so unlike the PDF they fit
 * comfortably inside the serverless request-body limit and can go through a
 * normal route handler.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { blobEnabled, putBlob } from "@/lib/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "super_admin")) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("cover");
  const year = parseInt(String(form.get("year") ?? ""), 10);
  if (!(file instanceof File)) return NextResponse.json({ error: "No cover received." }, { status: 400 });
  if (!Number.isInteger(year)) return NextResponse.json({ error: "Bad year." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Cover too large." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());

  try {
    if (blobEnabled()) {
      const res = await putBlob(`magazines/covers/pragati-cover-${year}.jpg`, buf, {
        contentType: "image/jpeg",
        addRandomSuffix: true,
        cacheControlMaxAge: 31536000,
      });
      // A private store's URLs aren't publicly fetchable — record the pathname
      // marker and let /api/magazines/<year>/cover stream the bytes.
      const { BLOB_PATH_PREFIX } = await import("@/lib/magazines");
      const url = res.access === "private" ? `${BLOB_PATH_PREFIX}${res.pathname}` : res.url;
      return NextResponse.json({ ok: true, coverUrl: url });
    }
    // local dev — write into public/ so Next serves it statically
    const { mkdir, writeFile } = await import("fs/promises");
    const path = await import("path");
    const dir = path.join(process.cwd(), "public", "magazines", "covers");
    await mkdir(dir, { recursive: true });
    const name = `pragati-cover-${year}-${Date.now().toString(36)}.jpg`;
    await writeFile(path.join(dir, name), buf);
    return NextResponse.json({ ok: true, coverUrl: `/magazines/covers/${name}` });
  } catch (e) {
    console.error("cover upload failed", e);
    return NextResponse.json({ error: "Could not store the cover." }, { status: 500 });
  }
}
