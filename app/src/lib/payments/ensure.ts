/**
 * Self-applying schema for the payment-integrity work (no manual deploy step —
 * same lazy "ensure" pattern as schema-ensure / ledger-ensure).
 *
 *   *.square_payment_link_id      — so an abandoned checkout's Square link can
 *                                   actually be retired instead of staying
 *                                   payable forever
 *   processed_webhook_events.*    — an event is now claimed, then confirmed.
 *                                   A delivery that failed mid-flight is left
 *                                   retryable instead of being remembered as
 *                                   "already handled"
 *   payments.square_verified_at   — last time Square itself confirmed this row
 *   reconciliation_runs/_findings — the audit trail of every Square-vs-ledger
 *                                   comparison, so drift is visible in the admin
 *                                   UI rather than living in a log line
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

let ensured: Promise<void> | null = null;

export function ensurePaymentIntegritySchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    // The ALTERs below target tables the other ensure helpers own. Create those
    // FIRST — on a brand-new database this helper can otherwise run before the
    // payments table exists, the ALTER quietly no-ops, and the columns are
    // missing for the life of that database.
    const { ensurePaymentsTable } = await import("@/lib/ledger-ensure");
    await ensurePaymentsTable().catch(() => {});
    await db
      .execute(
        sql`CREATE TABLE IF NOT EXISTS processed_webhook_events (event_id text PRIMARY KEY, provider text NOT NULL DEFAULT 'square', processed_at timestamptz NOT NULL DEFAULT now());`
      )
      .catch(() => {});
    const stmts = [
      sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS square_payment_link_id text;`,
      sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS square_payment_link_id text;`,
      sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS square_payment_link_id text;`,
      // A donation added during a ticket checkout gets its own row on the
      // Donations page, linked back to the registration that carries the money.
      sql`ALTER TABLE donations ADD COLUMN IF NOT EXISTS source_registration_id text;`,
      sql`CREATE INDEX IF NOT EXISTS donations_source_reg_idx ON donations (source_registration_id);`,

      sql`ALTER TABLE processed_webhook_events ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done';`,
      sql`ALTER TABLE processed_webhook_events ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1;`,
      sql`ALTER TABLE processed_webhook_events ADD COLUMN IF NOT EXISTS event_type text;`,
      sql`ALTER TABLE processed_webhook_events ADD COLUMN IF NOT EXISTS square_payment_id text;`,
      sql`ALTER TABLE processed_webhook_events ADD COLUMN IF NOT EXISTS last_error text;`,
      sql`ALTER TABLE processed_webhook_events ADD COLUMN IF NOT EXISTS payload jsonb;`,
      sql`ALTER TABLE processed_webhook_events ADD COLUMN IF NOT EXISTS claimed_at timestamptz NOT NULL DEFAULT now();`,
      sql`ALTER TABLE processed_webhook_events ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();`,

      sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS square_verified_at timestamptz;`,
      sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS square_amount_cents integer;`,
      sql`CREATE INDEX IF NOT EXISTS payments_square_order_idx ON payments (square_order_id);`,
      sql`CREATE INDEX IF NOT EXISTS payments_square_payment_idx ON payments (square_payment_id);`,

      sql`CREATE TABLE IF NOT EXISTS reconciliation_runs (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz,
        window_days integer NOT NULL DEFAULT 7,
        auto_settle boolean NOT NULL DEFAULT false,
        square_payments integer NOT NULL DEFAULT 0,
        false_negatives integer NOT NULL DEFAULT 0,
        false_positives integer NOT NULL DEFAULT 0,
        amount_mismatches integer NOT NULL DEFAULT 0,
        orphans integer NOT NULL DEFAULT 0,
        repaired integer NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'ok',
        error text
      );`,
      sql`CREATE TABLE IF NOT EXISTS reconciliation_findings (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        run_id text,
        kind text NOT NULL,
        severity text NOT NULL DEFAULT 'warning',
        reference text,
        entity_kind text,
        entity_id text,
        square_payment_id text,
        square_order_id text,
        square_amount_cents integer,
        ledger_amount_cents integer,
        detail text,
        status text NOT NULL DEFAULT 'open',
        resolution_note text,
        dedupe_key text,
        resolved_at timestamptz,
        resolved_by text,
        created_at timestamptz NOT NULL DEFAULT now()
      );`,
      // A finding is REVIEWED BY A PERSON, never applied automatically.
      sql`ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';`,
      sql`ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS resolution_note text;`,
      sql`ALTER TABLE reconciliation_findings ADD COLUMN IF NOT EXISTS dedupe_key text;`,
      sql`CREATE INDEX IF NOT EXISTS recon_findings_open_idx ON reconciliation_findings (status, created_at);`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS recon_findings_open_key_idx ON reconciliation_findings (dedupe_key) WHERE status = 'open';`,
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
