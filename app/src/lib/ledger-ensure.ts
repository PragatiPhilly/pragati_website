/**
 * Lazily creates the `payments` ledger table if the running database predates
 * it. Same pattern as schema-ensure / membership-ensure: idempotent, memoized,
 * safe to call on every checkout / webhook / dashboard load, so a deploy doesn't
 * have to be sequenced behind a manual `drizzle-kit push`.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

let ensured: Promise<void> | null = null;

export function ensurePaymentsTable(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    const stmts = [
      sql`CREATE TABLE IF NOT EXISTS payments (
        id text PRIMARY KEY,
        kind text NOT NULL,
        entity_id text NOT NULL,
        group_id text,
        member_id text,
        payer_name text NOT NULL,
        payer_email text NOT NULL,
        amount_cents integer NOT NULL,
        fee_cents integer NOT NULL DEFAULT 0,
        method text NOT NULL,
        status text NOT NULL DEFAULT 'pending',
        square_order_id text,
        square_payment_id text,
        reference text,
        verified_by text,
        verified_at timestamptz,
        paid_at timestamptz,
        cancelled_at timestamptz,
        source text NOT NULL DEFAULT 'app',
        note text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`,
      sql`CREATE INDEX IF NOT EXISTS payments_entity_idx ON payments (kind, entity_id);`,
      sql`CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);`,
      sql`CREATE INDEX IF NOT EXISTS payments_group_idx ON payments (group_id);`,
      sql`CREATE INDEX IF NOT EXISTS payments_member_idx ON payments (member_id);`,
    ];
    for (const s of stmts) {
      try {
        await db.execute(s);
      } catch {
        /* partial/absent DB in this context — skip */
      }
    }
  })().catch((e) => {
    ensured = null;
    throw e;
  });
  return ensured;
}
