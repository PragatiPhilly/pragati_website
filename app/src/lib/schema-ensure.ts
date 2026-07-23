/**
 * Lazily adds newer columns to core tables that predate them, so the running
 * database picks them up without a manual drizzle-kit push. Idempotent +
 * memoized; safe to call on every checkout / scan / event save.
 *
 *   registrations.processing_fee_cents  — card (Square) surcharge
 *   ticket_types.check_in_start         — concert-style timed check-in gate
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

let ensured: Promise<void> | null = null;

export function ensureExtraColumns(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    const stmts = [
      sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS processing_fee_cents integer NOT NULL DEFAULT 0;`,
      sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS membership_signup boolean NOT NULL DEFAULT false;`,
      sql`ALTER TABLE ticket_types ADD COLUMN IF NOT EXISTS check_in_start text;`,
    ];
    for (const s of stmts) {
      try {
        await db.execute(s);
      } catch {
        /* table absent in this context (e.g. a partial test DB) — skip */
      }
    }
  })().catch((e) => {
    ensured = null;
    throw e;
  });
  return ensured;
}
