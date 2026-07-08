/**
 * Idempotent runtime DDL for the media + contact tables.
 *
 * These tables live in schema.ts but the running PGlite database was created by
 * an earlier `drizzle-kit push`, so they may not physically exist yet. Rather
 * than force the user to stop the dev server and re-push (PGlite is single-
 * connection), we create them lazily with CREATE TABLE IF NOT EXISTS on the
 * same connection the app already holds. Safe to call on every request — it's
 * a no-op once the tables exist.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

let ensured: Promise<void> | null = null;

export function ensureMediaTables(): Promise<void> {
  if (ensured) return ensured;
  const db = getDb();
  ensured = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS media_images (
        id text PRIMARY KEY,
        file_base text NOT NULL,
        width integer NOT NULL,
        height integer NOT NULL,
        variants jsonb NOT NULL,
        blur_data_url text NOT NULL,
        bytes integer NOT NULL,
        original_name text,
        in_carousel boolean NOT NULL DEFAULT false,
        in_slideshow boolean NOT NULL DEFAULT false,
        event_slug text,
        sort_order integer NOT NULL DEFAULT 0,
        created_by text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS media_base_idx ON media_images (file_base);
    `);
    // sort_order was added after the first version of this table — backfill safely.
    await db.execute(sql`
      ALTER TABLE media_images ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id text PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL,
        phone text,
        topic text NOT NULL DEFAULT 'general',
        message text NOT NULL,
        handled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await db.execute(sql`
      ALTER TABLE contact_messages ADD COLUMN IF NOT EXISTS handled_at timestamptz;
    `);
  })().catch((e) => {
    // Reset so a transient failure can be retried on the next call.
    ensured = null;
    throw e;
  });
  return ensured;
}
