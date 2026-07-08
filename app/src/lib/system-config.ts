/**
 * Runtime config: system_config table with code defaults as fallback.
 * Admin → Settings edits these live; no redeploy.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { systemConfigDefaults } from "@/config/defaults";

export async function getConfig<T = string>(key: string): Promise<T> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.systemConfig)
    .where(eq(schema.systemConfig.key, key))
    .limit(1);
  if (rows.length > 0 && rows[0].value !== null) return rows[0].value as T;
  return systemConfigDefaults[key] as T;
}

export async function getAllConfig(): Promise<Record<string, unknown>> {
  const db = getDb();
  const rows = await db.select().from(schema.systemConfig);
  const fromDb = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...systemConfigDefaults, ...fromDb };
}

export async function setConfig(key: string, value: unknown, updatedBy?: string) {
  const db = getDb();
  await db
    .insert(schema.systemConfig)
    .values({ key, value, updatedBy, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.systemConfig.key,
      set: { value, updatedBy, updatedAt: new Date() },
    });
}
