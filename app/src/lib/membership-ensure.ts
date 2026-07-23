/**
 * Lazily adds members.square_order_id if it isn't there yet (the members table
 * predates the card-dues feature). Idempotent and memoized — safe to call on
 * every membership checkout / webhook.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

let ensured: Promise<void> | null = null;

export function ensureMembershipColumn(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    const stmts = [
      sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS square_order_id text;`,
      sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS membership_expires_at timestamptz;`,
      sql`ALTER TABLE members ADD COLUMN IF NOT EXISTS member_number text;`,
    ];
    for (const s of stmts) {
      try {
        await db.execute(s);
      } catch {
        /* members table absent in this context — skip */
      }
    }
  })().catch((e) => {
    ensured = null;
    throw e;
  });
  return ensured;
}
