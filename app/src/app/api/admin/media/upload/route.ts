/**
 * Admin image upload. Accepts multipart/form-data with one or more `files`.
 * A Route Handler (not a Server Action) so it isn't bound by the 1 MB action
 * body limit — though the client also pre-downscales, so payloads stay small.
 */
import { NextResponse } from "next/server";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { ensureMediaTables } from "@/lib/media/ensure";
import { processImage } from "@/lib/media/process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "super_admin")) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  await ensureMediaTables();
  const db = getDb();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files received." }, { status: 400 });
  }

  const created: unknown[] = [];
  const errors: string[] = [];

  for (const file of files) {
    try {
      const buf = Buffer.from(await file.arrayBuffer());
      const p = await processImage(buf);
      const [row] = await db
        .insert(schema.mediaImages)
        .values({
          fileBase: p.fileBase,
          width: p.width,
          height: p.height,
          variants: p.variants,
          blurDataUrl: p.blurDataUrl,
          bytes: p.bytes,
          originalName: file.name || null,
          createdBy: session.userId,
        })
        .returning();
      created.push(row);
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  return NextResponse.json({ created, errors });
}
