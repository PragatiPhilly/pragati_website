"use server";

import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { setConfig } from "@/lib/system-config";
import { systemConfigDefaults } from "@/config/defaults";

export async function saveSettingsAction(form: Record<string, string>) {
  const session = await getSession();
  if (!session || session.role !== "super_admin") throw new Error("Super-admin required");

  const db = getDb();
  for (const [key, raw] of Object.entries(form)) {
    const defaultVal = systemConfigDefaults[key];
    const value: unknown = typeof defaultVal === "number" ? Number(raw) : raw;
    await setConfig(key, value, session.userId);
  }
  await db.insert(schema.auditLog).values({
    userId: session.userId,
    action: "update",
    entityType: "system_config",
    changes: form,
  });
  revalidatePath("/", "layout");
}
