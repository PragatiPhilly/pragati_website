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

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __pragatiDb?: Db };

function createDb(): Db {
  const url = process.env.DATABASE_URL;
  if (url) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/postgres-js") as typeof import("drizzle-orm/postgres-js");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const postgres = require("postgres") as typeof import("postgres");
    const client = postgres(url, { prepare: false, max: 5 });
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
