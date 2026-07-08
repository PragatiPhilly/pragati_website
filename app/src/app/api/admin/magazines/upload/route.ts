/**
 * Admin magazine PDF upload. Route Handler (not a Server Action) so it isn't
 * bound by the 1 MB action body limit — magazine PDFs run tens of MB.
 * multipart/form-data: { file: File, year: string, title?: string }
 */
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { ensureScanTables } from "@/lib/scans/ensure";
import { storeMagazinePdf, deleteMagazinePdf } from "@/lib/magazines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || (session.role !== "admin" && session.role !== "super_admin")) {
    return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  }

  await ensureScanTables();
  const db = getDb();

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const file = form.get("file");
  const year = parseInt(String(form.get("year") ?? ""), 10);
  const title = String(form.get("title") ?? "").trim();

  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (!Number.isInteger(year) || year < 2000 || year > 2100)
    return NextResponse.json({ error: "Enter a valid year." }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "PDF is larger than 50 MB — compress it first." }, { status: 400 });

  const buf = Buffer.from(await file.arrayBuffer());
  // magic-bytes check: every PDF starts with "%PDF"
  if (buf.length < 4 || buf.toString("latin1", 0, 4) !== "%PDF") {
    return NextResponse.json({ error: "That file isn't a PDF." }, { status: 400 });
  }

  let fileUrl: string;
  try {
    fileUrl = await storeMagazinePdf(year, buf);
  } catch (e) {
    console.error("magazine upload failed", e);
    return NextResponse.json(
      { error: "Storage failed — check that BLOB_READ_WRITE_TOKEN is configured." },
      { status: 500 }
    );
  }

  // one magazine per year: replace an existing entry (and clean up its file)
  const [existing] = await db.select().from(schema.magazines).where(eq(schema.magazines.year, year));
  if (existing) {
    await deleteMagazinePdf(existing.fileUrl);
    await db
      .update(schema.magazines)
      .set({ title: title || existing.title, fileUrl, bytes: buf.length, uploadedBy: session.userId })
      .where(eq(schema.magazines.id, existing.id));
  } else {
    await db.insert(schema.magazines).values({
      year,
      title: title || `Pragati Patrika · ${year}`,
      fileUrl,
      bytes: buf.length,
      uploadedBy: session.userId,
    });
  }

  await db.insert(schema.auditLog).values({
    userId: session.userId,
    action: existing ? "magazine_replaced" : "magazine_uploaded",
    entityType: "magazines",
    entityId: String(year),
  });

  return NextResponse.json({ ok: true });
}
