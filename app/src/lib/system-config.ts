/**
 * Runtime config: system_config table with code defaults as fallback.
 * Admin → Settings edits these live; no redeploy.
 *
 * ── Why this is cached ──────────────────────────────────────────
 * Every getConfig() used to be its own SELECT. The homepage alone reads ~9 keys
 * (banner text/style/deadline/…, membership price, donation mode), so a single
 * render fired ~9 separate round trips to Neon — on top of the event, media and
 * magazine queries. On a low-traffic site most requests hit a cold instance and
 * a sleeping database, where every round trip pays the wake-up latency. That is
 * what produced multi-second homepage renders and intermittent 5xx.
 *
 * Now the whole table is fetched ONCE and held per server instance for a few
 * seconds, so a page render costs one query no matter how many keys it reads.
 * setConfig() clears the cache immediately, so an admin saving Settings sees the
 * change at once on that instance; other warm instances pick it up within the
 * TTL. That is the one trade-off: a few seconds of staleness across instances,
 * in exchange for roughly an order of magnitude fewer database calls.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { systemConfigDefaults } from "@/config/defaults";

// Off under test: the suite writes system_config directly (bypassing setConfig)
// and must always observe live values.
const TTL_MS = process.env.NODE_ENV === "test" ? 0 : 15_000;

let cache: { at: number; data: Record<string, unknown> } | null = null;
let inflight: Promise<Record<string, unknown>> | null = null;

/** The whole config table, merged over code defaults — one query, then cached. */
async function snapshot(): Promise<Record<string, unknown>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  // De-dupe concurrent misses: a page rendering 9 keys at once must not fire 9
  // identical queries while the first is still in flight.
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const db = getDb();
      const rows = await db.select().from(schema.systemConfig);
      const fromDb = Object.fromEntries(rows.filter((r) => r.value !== null).map((r) => [r.key, r.value]));
      const data = { ...systemConfigDefaults, ...fromDb };
      cache = { at: Date.now(), data };
      return data;
    } catch (e) {
      // Never let a config read take a page down: fall back to code defaults,
      // and keep any previous snapshot if we had one.
      console.error("[config] snapshot failed, using defaults:", e);
      return cache?.data ?? { ...systemConfigDefaults };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function getConfig<T = string>(key: string): Promise<T> {
  const data = await snapshot();
  return data[key] as T;
}

export async function getAllConfig(): Promise<Record<string, unknown>> {
  return snapshot();
}

/** Drop the cached snapshot — called after any write so edits apply at once. */
export function invalidateConfigCache(): void {
  cache = null;
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
  invalidateConfigCache();
}

/** Kept for callers that need a guaranteed-fresh read (e.g. right after a write). */
export async function getConfigFresh<T = string>(key: string): Promise<T> {
  const db = getDb();
  const rows = await db.select().from(schema.systemConfig).where(eq(schema.systemConfig.key, key)).limit(1);
  if (rows.length > 0 && rows[0].value !== null) return rows[0].value as T;
  return systemConfigDefaults[key] as T;
}
