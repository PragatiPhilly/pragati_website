"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { ensureMediaTables } from "@/lib/media/ensure";

export async function toggleHandledAction(id: string, handled: boolean) {
  await requireAdmin();
  await ensureMediaTables();
  const db = getDb();
  await db
    .update(schema.contactMessages)
    .set({ handledAt: handled ? new Date() : null })
    .where(eq(schema.contactMessages.id, id));
  revalidatePath("/admin/messages");
}

export async function deleteMessageAction(id: string) {
  await requireAdmin();
  await ensureMediaTables();
  const db = getDb();
  await db.delete(schema.contactMessages).where(eq(schema.contactMessages.id, id));
  revalidatePath("/admin/messages");
}
