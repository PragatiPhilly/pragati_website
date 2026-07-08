"use server";

import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { setConfig } from "@/lib/system-config";

export async function setActiveEventAction(slug: string) {
  const admin = await requireAdmin();
  await setConfig("active_event_slug", slug, admin.userId);
  const db = getDb();
  await db.insert(schema.auditLog).values({
    userId: admin.userId,
    action: "update",
    entityType: "system_config",
    changes: { active_event_slug: slug },
  });
  revalidatePath("/");
  revalidatePath("/admin/events");
}
