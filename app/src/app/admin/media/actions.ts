"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { ensureMediaTables } from "@/lib/media/ensure";
import { deleteImageFiles } from "@/lib/media/process";

export type Placements = {
  inCarousel: boolean;
  inSlideshow: boolean;
  inPoster: boolean;
  eventSlug: string | null;
};

function revalidateEverywhere() {
  revalidatePath("/");
  revalidatePath("/admin/media");
  revalidatePath("/events");
  revalidatePath("/events/[slug]", "page");
}

export async function setPlacementsAction(
  id: string,
  placements: Placements,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = await requireAdmin();
    await ensureMediaTables();
    const db = getDb();
    await db
      .update(schema.mediaImages)
      .set({
        inCarousel: placements.inCarousel,
        inSlideshow: placements.inSlideshow,
        inPoster: placements.inPoster,
        eventSlug: placements.eventSlug || null,
      })
      .where(eq(schema.mediaImages.id, id));
    await db.insert(schema.auditLog).values({
      userId: admin.userId,
      action: "update",
      entityType: "media_images",
      entityId: id,
      changes: placements,
    });
    revalidateEverywhere();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}

export async function deleteMediaAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const admin = await requireAdmin();
    await ensureMediaTables();
    const db = getDb();
    const [row] = await db.select().from(schema.mediaImages).where(eq(schema.mediaImages.id, id));
    if (!row) return { ok: false, error: "Not found." };
    await deleteImageFiles(row.fileBase, (row.variants as number[]) ?? []);
    await db.delete(schema.mediaImages).where(eq(schema.mediaImages.id, id));
    await db.insert(schema.auditLog).values({
      userId: admin.userId,
      action: "delete",
      entityType: "media_images",
      entityId: id,
    });
    revalidateEverywhere();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed." };
  }
}
