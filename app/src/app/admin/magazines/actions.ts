"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { deleteMagazinePdf } from "@/lib/magazines";
import { ensureScanTables } from "@/lib/scans/ensure";

async function requireAdmin() {
  const s = await getSession();
  if (!s || !["admin", "super_admin"].includes(s.role)) throw new Error("UNAUTHORIZED");
  return s;
}

/**
 * Record a magazine whose PDF the browser already uploaded straight to Blob.
 * (Large files can't be posted through a serverless function — see
 * /api/admin/magazines/upload-url.) Replaces any existing magazine for the year
 * and deletes the file it superseded.
 */
export async function finalizeMagazineUploadAction(input: {
  year: number;
  title?: string;
  url: string;
  pathname: string;
  bytes: number;
  coverUrl?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const s = await requireAdmin();
    await ensureScanTables();
    const db = getDb();

    const year = Number(input.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return { ok: false, error: "Enter a valid year." };
    if (!input.url || !input.pathname) return { ok: false, error: "Upload did not complete — please try again." };

    const { getBlobAccess } = await import("@/lib/blob");
    const { BLOB_PATH_PREFIX } = await import("@/lib/magazines");
    // A private store's URLs aren't publicly fetchable, so store the pathname
    // marker and let our download route stream the bytes (same as server uploads).
    const access = await getBlobAccess();
    const fileUrl = access === "private" ? `${BLOB_PATH_PREFIX}${input.pathname}` : input.url;

    const [existing] = await db.select().from(schema.magazines).where(eq(schema.magazines.year, year));
    if (existing) {
      await deleteMagazinePdf(existing.fileUrl);
      await db
        .update(schema.magazines)
        .set({
          title: input.title?.trim() || existing.title,
          fileUrl,
          bytes: input.bytes,
          // keep the old cover if this upload didn't produce one
          coverUrl: input.coverUrl ?? existing.coverUrl,
          uploadedBy: s.userId,
        })
        .where(eq(schema.magazines.id, existing.id));
    } else {
      await db.insert(schema.magazines).values({
        year,
        title: input.title?.trim() || `Pragati Patrika · ${year}`,
        fileUrl,
        bytes: input.bytes,
        coverUrl: input.coverUrl,
        uploadedBy: s.userId,
      });
    }

    await db.insert(schema.auditLog).values({
      userId: s.userId,
      action: existing ? "magazine_replaced" : "magazine_uploaded",
      entityType: "magazines",
      entityId: String(year),
    });

    revalidatePath("/admin/magazines");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the magazine." };
  }
}

export async function deleteMagazineAction(id: string) {
  const s = await requireAdmin();
  await ensureScanTables();
  const db = getDb();
  const [mag] = await db.select().from(schema.magazines).where(eq(schema.magazines.id, id));
  if (!mag) return;
  await deleteMagazinePdf(mag.fileUrl);
  await db.delete(schema.magazines).where(eq(schema.magazines.id, id));
  await db.insert(schema.auditLog).values({
    userId: s.userId,
    action: "magazine_deleted",
    entityType: "magazines",
    entityId: String(mag.year),
  });
  revalidatePath("/admin/magazines");
  revalidatePath("/");
}
