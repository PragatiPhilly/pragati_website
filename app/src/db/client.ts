/**
 * Database client.
 * - DATABASE_URL set  → real Postgres via postgres-js (Neon / Supabase /
 *   Vercel Postgres). `prepare: false` keeps it compatible with PgBouncer /
 *   pooled "transaction mode" connection strings.
 * - No DATABASE_URL   → embedded PGlite (zero-setup dev/test).
 * Singleton across Next.js hot reloads.
 */
import { mkdirSync } from "fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Prefer IPv4 when resolving the database host.
 *
 * Secondary hardening, not the cause of the 2026-09-16 outage (see the pool
 * options below for that). Neon's pooled endpoint publishes both A and AAAA
 * records; pinning to IPv4 removes one way a connection can be attempted over
 * a path the platform may not route. Cheap, reversible, no downside here.
 *
 * Both calls are process-global and must run before the first connection is
 * opened, hence module scope. Wrapped because neither exists on every runtime.
 */
function preferIpv4(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const dns = require("node:dns") as typeof import("node:dns");
    dns.setDefaultResultOrder?.("ipv4first");
  } catch {
    /* not available on this runtime — fall through */
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const net = require("node:net") as typeof import("node:net");
    net.setDefaultAutoSelectFamily?.(true);
  } catch {
    /* Node < 18.13 — nothing to enable */
  }
}
preferIpv4();

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __pragatiDb?: Db };

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (url) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/postgres-js") as typeof import("drizzle-orm/postgres-js");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const postgres = require("postgres") as typeof import("postgres");
    const client = postgres(url, {
      prepare: false,
      // Small pool: serverless scales by ADDING INSTANCES, so each instance
      // needs only a couple of connections. Neon's own guidance for elastic
      // platforms is 1-2; 3 leaves a little headroom for the admin pages.
      max: 3,
      // THE ONE THAT MATTERS. postgres.js defaults to NEVER closing idle
      // connections. Vercel Fluid keeps an instance alive ~2h and SUSPENDS it
      // between requests; while suspended its JS timers do not run, so a
      // pooled socket that the far end has already dropped is never noticed
      // and never recycled. The instance then hands every subsequent query a
      // dead socket and each one hangs for the full connect_timeout.
      // Neon's serverless guidance calls this out explicitly and asks for
      // 5-10s. Close them well inside any NAT/proxy idle window.
      idle_timeout: 10,
      // Default is 30s. That is how long every user stared at a spinner
      // before getting an error page during the 2026-09-16 outage. Fail fast:
      // with ipv4first above, a connection that cannot be made is a real
      // fault, not an address we should keep waiting on.
      connect_timeout: 10,
      // Recycle connections so a long-lived instance can't pin itself to one
      // unhealthy address forever.
      max_lifetime: 60 * 30,
    });
    return drizzle(client, { schema }) as unknown as Db;
  }

  if (process.env.NODE_ENV === "production" && process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL is not set. The embedded PGlite database only works locally — " +
        "connect a Postgres database (Neon / Supabase / Vercel Postgres) and set DATABASE_URL."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? "./.data/pglite";
  if (!dir.startsWith("memory://")) {
    try {
      mkdirSync(dir, { recursive: true });
    } catch {
      /* already exists */
    }
  }
  const pglite = new PGlite(dir);
  return drizzle(pglite, { schema }) as unknown as Db;
}

export function getDb(): Db {
  if (!globalForDb.__pragatiDb) {
    globalForDb.__pragatiDb = createDb();
  }
  return globalForDb.__pragatiDb;
}

export { schema };
