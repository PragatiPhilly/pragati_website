/**
 * Admin → Pujo schedule → replace / remove the flyer.
 *
 * POST multipart/form-data with one `file` (JPEG, PNG or WebP). A Route Handler,
 * not a Server Action, so it isn't bound by the 1 MB action body limit (the
 * browser still shrinks anything over ~4 MB first — serverless bodies cap at 4.5 MB).
 *
 * The image is turned upright and saved twice: a WebP to view (≤ 1400 px wide)
 * and a JPEG to download (≤ 2400 px on the long side — opens everywhere,
 * WhatsApp included). Only the flyer part of the schedule is changed, so an
 * admin's unsaved edits to the timings are never overwritten here.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import sharp from "sharp";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { getPujoSchedule, savePujoSchedule, storeFlyerFile, deleteFlyerFile } from "@/lib/pujo-schedule/server";
import { publicFlyer, type Flyer } from "@/lib/pujo-schedule/model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 4.4 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

async function staff() {
  const s = await getSession();
  return s && (s.role === "admin" || s.role === "super_admin") ? s : null;
}

export async function POST(req: Request) {
  const session = await staff();
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ error: "That upload didn't arrive — please try again." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "Choose an image first." }, { status: 400 });
  if (!TYPES.includes(file.type)) return NextResponse.json({ error: "Use a JPEG, PNG or WebP image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is too large — keep it under 4 MB." }, { status: 400 });

  try {
    const input = Buffer.from(await file.arrayBuffer());
    const meta = await sharp(input).metadata();
    if (!meta.width || !meta.height) throw new Error("That file isn't a readable image.");

    const view = await sharp(input)
      .rotate()
      .resize({ width: 1400, withoutEnlargement: true })
      .webp({ quality: 84, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    const full = await sharp(input)
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();

    const base = `flyer-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
    const display = await storeFlyerFile(`${base}.webp`, view.data, "image/webp");
    const download = await storeFlyerFile(`${base}.jpg`, full, "image/jpeg");

    const current = await getPujoSchedule();
    const old = current.flyer;
    const flyer: Flyer = {
      display,
      download,
      width: view.info.width,
      height: view.info.height,
      name: (file.name || "flyer").slice(0, 120),
      bytes: full.length,
      uploadedAt: new Date().toISOString(),
    };
    await savePujoSchedule({ ...current, flyer }, session.userId);
    if (old) {
      await deleteFlyerFile(old.display);
      if (old.download !== old.display) await deleteFlyerFile(old.download);
    }

    await getDb().insert(schema.auditLog).values({
      userId: session.userId,
      action: "pujo_flyer_replaced",
      entityType: "system_config",
      entityId: "pujo_schedule",
      changes: { name: flyer.name, width: flyer.width, height: flyer.height },
    });
    revalidatePath("/");
    revalidatePath("/admin/pujo-schedule");
    return NextResponse.json({ ok: true, flyer: publicFlyer({ ...current, flyer, showFlyer: true, allowDownload: true }) });
  } catch (e) {
    console.error("[pujo-schedule] flyer upload failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await staff();
  if (!session) return NextResponse.json({ error: "Not authorized." }, { status: 401 });
  const current = await getPujoSchedule();
  const old = current.flyer;
  await savePujoSchedule({ ...current, flyer: null }, session.userId);
  if (old) {
    await deleteFlyerFile(old.display);
    if (old.download !== old.display) await deleteFlyerFile(old.download);
  }
  await getDb().insert(schema.auditLog).values({
    userId: session.userId,
    action: "pujo_flyer_removed",
    entityType: "system_config",
    entityId: "pujo_schedule",
  });
  revalidatePath("/");
  revalidatePath("/admin/pujo-schedule");
  return NextResponse.json({ ok: true });
}
