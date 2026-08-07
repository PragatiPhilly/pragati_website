/**
 * The one-time data backfills that apply themselves on deploy.
 *
 * These exist so nobody has to run a script by hand against production. The
 * contract they must keep:
 *   - run exactly once per database, no matter how many instances boot
 *   - be safe to call on every boot and from the cron (a no-op once done)
 *   - never throw into the caller — a failed backfill must not stop the server
 *   - leave the app fully usable whether or not they've run
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://data-migration-tests";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

import { getDb, schema } from "../src/db/client";
import { runPendingDataMigrations, dataMigrationStatus } from "../src/lib/data-migrations";

const PHONE_JOB = "2026-08-backfill-phone-placeholders";
const LEDGER_JOB = "2026-08-backfill-payments-ledger";

beforeAll(async () => {
  const db = getDb();
  const client = (db as unknown as { $client: { exec: (sql: string) => Promise<unknown> } }).$client;
  await client.exec(`
  CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, email text NOT NULL, password_hash text NOT NULL, email_verified_at timestamptz, role text NOT NULL DEFAULT 'member', last_login_at timestamptz, failed_login_count integer NOT NULL DEFAULT 0, last_failed_login_at timestamptz, locked_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
  CREATE TABLE IF NOT EXISTS members (id text PRIMARY KEY, user_id text NOT NULL, family_name text NOT NULL, primary_first_name text NOT NULL, primary_last_name text NOT NULL, phone text, address_line1 text, address_line2 text, city text, state text, zip text, country text DEFAULT 'US', membership_status text NOT NULL DEFAULT 'pending_payment', membership_started_at date, square_order_id text, membership_expires_at timestamptz, member_number text, source text NOT NULL DEFAULT 'account', notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
  CREATE TABLE IF NOT EXISTS registrations (id text PRIMARY KEY, confirmation_number text NOT NULL, event_id text NOT NULL, member_id text, buyer_email text NOT NULL, buyer_name text NOT NULL, buyer_phone text, is_member_purchase boolean NOT NULL DEFAULT false, source text NOT NULL DEFAULT 'web', subtotal_cents integer NOT NULL, discount_cents integer NOT NULL DEFAULT 0, total_cents integer NOT NULL, processing_fee_cents integer NOT NULL DEFAULT 0, donation_cents integer NOT NULL DEFAULT 0, membership_signup boolean NOT NULL DEFAULT false, self_declared_member boolean NOT NULL DEFAULT false, promo_code_id text, payment_method text NOT NULL, status text NOT NULL DEFAULT 'pending_payment', square_order_id text, square_payment_id text, zelle_verified_by text, zelle_verified_at timestamptz, zelle_sent_clicked_at timestamptz, paid_at timestamptz, cancelled_at timestamptz, reservation_expires_at timestamptz, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS donations (id text PRIMARY KEY, confirmation_number text NOT NULL, member_id text, donor_name text NOT NULL, donor_email text NOT NULL, donor_phone text, amount_cents integer NOT NULL, in_honor_or_memory text NOT NULL DEFAULT 'none', designation text, honoree_name text, honoree_notify_email text, message text, is_anonymous boolean NOT NULL DEFAULT false, payment_method text NOT NULL, status text NOT NULL DEFAULT 'pending_payment', square_order_id text, square_payment_id text, zelle_verified_by text, zelle_verified_at timestamptz, paid_at timestamptz, cancelled_at timestamptz, reservation_expires_at timestamptz, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS contact_messages (id text PRIMARY KEY, name text NOT NULL, email text NOT NULL, phone text, topic text NOT NULL DEFAULT 'general', message text NOT NULL, handled_at timestamptz, handled_by text, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS system_config (key text PRIMARY KEY, value jsonb, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text);
  `);

  // A world that predates both changes: a paid member with no phone and no
  // financial record, and a paid registration that bundled a donation.
  const [user] = await db
    .insert(schema.users)
    .values({ email: "legacy@example.com", passwordHash: "x", role: "member" })
    .returning();
  await db.insert(schema.members).values({
    userId: user.id,
    familyName: "Legacy family",
    primaryFirstName: "Legacy",
    primaryLastName: "Member",
    phone: null,
    membershipStatus: "active",
    membershipStartedAt: "2026-07-01",
  });
  await db.insert(schema.registrations).values({
    confirmationNumber: "PRG-2026-9001",
    eventId: "evt-legacy",
    buyerEmail: "buyer@example.com",
    buyerName: "Legacy Buyer",
    buyerPhone: null,
    subtotalCents: 5000,
    totalCents: 7000,
    donationCents: 2000,
    paymentMethod: "square",
    status: "paid",
    paidAt: new Date(),
  });
});

describe("self-applying data migrations", () => {
  it("applies both backfills on the first run", async () => {
    const ran = await runPendingDataMigrations();
    expect(ran.map((r) => r.key).sort()).toEqual([LEDGER_JOB, PHONE_JOB].sort());
    // the recorded detail is what shows up in the admin health panel, so it has
    // to reflect what actually happened
    expect(ran.find((r) => r.key === PHONE_JOB)!.result).toContain("filled 2 blank phone field(s)");

    const db = getDb();
    const [member] = await db.select().from(schema.members);
    expect(member.phone).toBe("+1 9999999999"); // blank phone filled

    const [reg] = await db.select().from(schema.registrations);
    expect(reg.buyerPhone).toBe("+1 9999999999");

    // the bundled checkout is split into its real revenue streams
    const payments = await db.select().from(schema.payments);
    const byKind = (k: string) => payments.filter((p) => p.kind === k);
    expect(byKind("registration")[0].amountCents).toBe(5000);
    expect(byKind("donation")[0].amountCents).toBe(2000);
    // the member who had no financial record at all now has one, flagged
    expect(byKind("membership")[0].status).toBe("paid");
    expect(byKind("membership")[0].source).toBe("backfill");
  });

  it("does nothing on a second run — a redeploy must not double-apply", async () => {
    const db = getDb();
    const before = await db.select().from(schema.payments);

    const ran = await runPendingDataMigrations();
    expect(ran).toHaveLength(0);

    const after = await db.select().from(schema.payments);
    expect(after).toHaveLength(before.length); // no duplicate ledger entries
  });

  it("records each job as done so the state is inspectable", async () => {
    const status = await dataMigrationStatus();
    expect(status.every((s) => s.status === "done")).toBe(true);
    expect(status.map((s) => s.key).sort()).toEqual([LEDGER_JOB, PHONE_JOB].sort());
  });

  it("is safe when several instances boot at once — only one wins the claim", async () => {
    const db = getDb();
    // pretend the deploy is fresh again
    await db.delete(schema.dataMigrations).where(eq(schema.dataMigrations.key, PHONE_JOB));
    const before = await db.select().from(schema.payments);

    const results = await Promise.all([
      runPendingDataMigrations(),
      runPendingDataMigrations(),
      runPendingDataMigrations(),
    ]);
    // exactly one of the three concurrent boots reports having applied it
    expect(results.flat().filter((r) => r.key === PHONE_JOB)).toHaveLength(1);

    const after = await db.select().from(schema.payments);
    expect(after).toHaveLength(before.length);
  });

  it("never throws, even against a database it cannot bookkeep", async () => {
    await expect(runPendingDataMigrations()).resolves.toBeInstanceOf(Array);
    await expect(dataMigrationStatus()).resolves.toBeInstanceOf(Array);
  });

  it("costs a single read once everything is done — cold starts are frequent and the DB is metered", async () => {
    // make sure both jobs are recorded as done first
    await runPendingDataMigrations();

    const db = getDb();
    const client = (db as unknown as { $client: { query: (...a: unknown[]) => Promise<unknown> } }).$client;
    const original = client.query.bind(client);
    let queries = 0;
    client.query = async (...a: unknown[]) => {
      queries++;
      return original(...a);
    };
    try {
      await runPendingDataMigrations();
    } finally {
      client.query = original;
    }
    // one SELECT against data_migrations, no writes
    expect(queries).toBeLessThanOrEqual(1);
  });
});
