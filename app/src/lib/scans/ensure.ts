/**
 * Idempotent runtime DDL for the scan-session + magazine tables.
 * Same pattern as lib/media/ensure.ts — safe to call on every request,
 * a no-op once the tables exist. Works on both PGlite (dev) and Postgres (prod).
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

let ensured: Promise<void> | null = null;

export function ensureScanTables(): Promise<void> {
  if (ensured) return ensured;
  const db = getDb();
  ensured = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS scan_sessions (
        id text PRIMARY KEY,
        event_id text NOT NULL,
        kind text NOT NULL,
        day_key text NOT NULL DEFAULT 'all',
        label text NOT NULL,
        status text NOT NULL DEFAULT 'closed',
        opened_at timestamptz,
        closed_at timestamptz,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS scan_sessions_unique_idx
        ON scan_sessions (event_id, kind, day_key);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS scan_sessions_event_idx
        ON scan_sessions (event_id, status);
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS ticket_scans (
        id text PRIMARY KEY,
        session_id text NOT NULL,
        ticket_id text NOT NULL,
        scanned_at timestamptz NOT NULL DEFAULT now(),
        scanned_by text
      );
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS ticket_scans_once_idx
        ON ticket_scans (session_id, ticket_id);
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS ticket_scans_ticket_idx ON ticket_scans (ticket_id);
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS magazines (
        id text PRIMARY KEY,
        year integer NOT NULL,
        title text NOT NULL,
        file_url text NOT NULL,
        bytes integer NOT NULL DEFAULT 0,
        uploaded_by text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS magazines_year_idx ON magazines (year);
    `);
  })().catch((e) => {
    ensured = null; // transient failure → retry on next call
    throw e;
  });
  return ensured;
}
