/**
 * Disaster recovery: restore registrations from a backup CSV.
 * SUPER ADMIN ONLY. Accepts multipart/form-data { file } — the exact CSV
 * attached to the daily backup emails. Skip-existing semantics: rows whose
 * confirmation number / QR code already exist are left untouched, so running
 * it twice (or against a half-alive database) is safe.
 */
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { restoreFromCsv } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB of CSV ≈ tens of thousands of rows

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || session.role !== "super_admin") {
    return NextResponse.json({ error: "Super-admin access required." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file received." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "File too large." }, { status: 400 });

  const text = await file.text();
  try {
    const result = await restoreFromCsv(text, session.userId);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Restore failed." },
      { status: 400 }
    );
  }
}
