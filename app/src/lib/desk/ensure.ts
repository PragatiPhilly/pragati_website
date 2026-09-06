/**
 * Self-applying schema for the walk-in desk.
 *
 * Same lazy "ensure" pattern the rest of this codebase uses (schema-ensure,
 * ledger-ensure, payments/ensure, scans/ensure): idempotent, memoized, safe to
 * call on every desk action, so a deploy never has to be sequenced behind a
 * manual `drizzle-kit push`.
 *
 * Everything here is ADDITIVE. Four new tables, and nullable columns on
 * registrations / tickets / payments that every existing query ignores. A
 * database that never sees a desk order is byte-identical in behaviour.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

let ensured: Promise<void> | null = null;

export function ensureDeskSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();

    // The ALTERs below touch tables other ensure helpers own. Create those
    // first — on a brand-new database this can otherwise run before `payments`
    // exists, the ALTER quietly no-ops, and the columns are missing for the
    // life of that database. (Exactly the trap payments/ensure documents.)
    const { ensurePaymentsTable } = await import("@/lib/ledger-ensure");
    await ensurePaymentsTable().catch(() => {});

    const stmts = [
      // ── shifts: one station's till session ──────────────────────────────
      sql`CREATE TABLE IF NOT EXISTS desk_shifts (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        event_id text NOT NULL,
        day_key text NOT NULL DEFAULT 'all',
        station text NOT NULL DEFAULT 'desk-1',
        status text NOT NULL DEFAULT 'open',
        opened_by text NOT NULL,
        opened_by_email text,
        opened_at timestamptz NOT NULL DEFAULT now(),
        opening_float_cents integer NOT NULL DEFAULT 0,
        drops_cents integer NOT NULL DEFAULT 0,
        closed_by text,
        closed_at timestamptz,
        counted_cash_cents integer,
        expected_cash_cents integer,
        variance_cents integer,
        variance_note text,
        note text
      );`,
      sql`CREATE INDEX IF NOT EXISTS desk_shifts_event_idx ON desk_shifts (event_id, status);`,
      // One open till per station per event. Two volunteers opening the same
      // station would otherwise produce two drawers nobody can reconcile.
      sql`CREATE UNIQUE INDEX IF NOT EXISTS desk_shifts_open_station_idx
            ON desk_shifts (event_id, station) WHERE status = 'open';`,

      // ── adjustments: every cent NOT collected, and why ──────────────────
      // amount_cents is always the amount taken OFF what the guest owes, so a
      // surcharge is stored negative. One sign convention, asserted by the
      // invariant test.
      sql`CREATE TABLE IF NOT EXISTS desk_adjustments (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        registration_id text NOT NULL,
        kind text NOT NULL,
        amount_cents integer NOT NULL,
        reason_code text NOT NULL,
        note text,
        requested_by text,
        approved_by text NOT NULL,
        voided_at timestamptz,
        voided_by text,
        created_at timestamptz NOT NULL DEFAULT now()
      );`,
      sql`CREATE INDEX IF NOT EXISTS desk_adjustments_reg_idx ON desk_adjustments (registration_id);`,

      // ── follow-ups: typed gaps and chases (the queue that replaces the
      //    Post-it). dedupe_key + a partial unique index stop the same gap
      //    being raised twice, the way reconciliation_findings does. ────────
      sql`CREATE TABLE IF NOT EXISTS desk_followups (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        registration_id text,
        payment_id text,
        kind text NOT NULL,
        detail text,
        status text NOT NULL DEFAULT 'open',
        dedupe_key text,
        assigned_to text,
        created_by text,
        resolved_by text,
        resolved_at timestamptz,
        resolution_note text,
        due_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );`,
      sql`CREATE INDEX IF NOT EXISTS desk_followups_status_idx ON desk_followups (status, kind);`,
      sql`CREATE INDEX IF NOT EXISTS desk_followups_reg_idx ON desk_followups (registration_id);`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS desk_followups_open_key_idx
            ON desk_followups (dedupe_key) WHERE status = 'open';`,

      // ── order timeline: append-only, one row per thing a person did ─────
      sql`CREATE TABLE IF NOT EXISTS desk_order_events (
        id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
        registration_id text NOT NULL,
        type text NOT NULL,
        summary text NOT NULL,
        actor_user_id text,
        actor_email text,
        shift_id text,
        payload jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );`,
      sql`CREATE INDEX IF NOT EXISTS desk_order_events_reg_idx ON desk_order_events (registration_id, created_at);`,

      // ── registrations: desk-only state, all nullable ────────────────────
      sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS desk_state text;`,
      sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS desk_shift_id text;`,
      sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS created_by_user_id text;`,
      sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS idempotency_key text;`,
      sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS parent_registration_id text;`,
      sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS admitted_unsettled_by text;`,
      sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS admitted_unsettled_at timestamptz;`,
      sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS desk_version integer NOT NULL DEFAULT 0;`,
      sql`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS void_reason text;`,
      // A double-tapped "Create order" on a laggy tablet must return the same
      // order, not a second one.
      sql`CREATE UNIQUE INDEX IF NOT EXISTS registrations_idempotency_idx
            ON registrations (idempotency_key) WHERE idempotency_key IS NOT NULL;`,
      sql`CREATE INDEX IF NOT EXISTS registrations_desk_state_idx ON registrations (desk_state);`,
      sql`CREATE INDEX IF NOT EXISTS registrations_parent_idx ON registrations (parent_registration_id);`,

      // ── tickets: a minor's pass hangs off an adult's ────────────────────
      sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS guardian_ticket_id text;`,
      sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS issued_by_user_id text;`,
      sql`CREATE INDEX IF NOT EXISTS tickets_guardian_idx ON tickets (guardian_ticket_id);`,

      // ── payments: a tender IS a payments row. The ledger stays the single
      //    source of truth for money; these columns say who took it, which
      //    drawer it belongs to, and where it physically is now. ────────────
      sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS tender_seq integer;`,
      sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS shift_id text;`,
      sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS collected_by text;`,
      sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS custody text;`,
      sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS custody_cleared_at timestamptz;`,
      sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS custody_cleared_by text;`,
      sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS deposit_ref text;`,
      sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS instrument jsonb;`,
      sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS reversed_at timestamptz;`,
      sql`ALTER TABLE payments ADD COLUMN IF NOT EXISTS reversal_reason text;`,
      sql`CREATE INDEX IF NOT EXISTS payments_custody_idx ON payments (custody) WHERE custody IS NOT NULL;`,
      sql`CREATE INDEX IF NOT EXISTS payments_shift_idx ON payments (shift_id);`,
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
