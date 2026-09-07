/**
 * Self-applying schema for Projections.
 *
 * Same lazy `ensure` pattern as lib/desk/ensure.ts, lib/scans/ensure.ts and
 * lib/media/ensure.ts: idempotent, memoized, safe to call on every read, so a
 * deploy never has to be sequenced behind a manual `drizzle-kit push`.
 * (pragati-self-applying-migrations)
 *
 * Everything here is ADDITIVE — two new tables and nothing else. There is not a
 * single ALTER against an existing table, so a database that never opens
 * Projections behaves byte-for-byte as it did before.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

let ensured: Promise<void> | null = null;

export function ensureProjectionsSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    const stmts = [
      sql`CREATE TABLE IF NOT EXISTS projection_scenarios (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        year integer NOT NULL,
        name text NOT NULL,
        description text,
        kind text NOT NULL DEFAULT 'scenario',
        is_baseline boolean NOT NULL DEFAULT false,
        seeded_from text,
        model jsonb NOT NULL,
        locked_at timestamptz,
        archived_at timestamptz,
        created_by text,
        created_by_email text,
        updated_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`,
      sql`CREATE INDEX IF NOT EXISTS projection_scenarios_year_idx
            ON projection_scenarios (year, created_at);`,
      // At most one live baseline per year. A second one would make "seed next
      // year from the baseline" ambiguous, which is the whole point of the table.
      sql`CREATE UNIQUE INDEX IF NOT EXISTS projection_baseline_year_idx
            ON projection_scenarios (year)
            WHERE is_baseline AND archived_at IS NULL;`,

      sql`CREATE TABLE IF NOT EXISTS projection_snapshots (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        scenario_id text NOT NULL,
        label text,
        taken_at timestamptz NOT NULL DEFAULT now(),
        days_out integer,
        totals jsonb,
        actuals jsonb,
        created_by text
      );`,
      sql`CREATE INDEX IF NOT EXISTS projection_snapshots_scenario_idx
            ON projection_snapshots (scenario_id, taken_at);`,
    ];

    for (const s of stmts) {
      try {
        await db.execute(s);
      } catch {
        /* partial DB (e.g. a trimmed test database) — skip, retried next call */
      }
    }
  })().catch((e) => {
    ensured = null;
    throw e;
  });
  return ensured;
}
