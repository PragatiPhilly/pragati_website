/**
 * Disaster-recovery round trip against a real (in-memory) PGlite DB:
 * seed → build backup CSV → simulate database loss (delete rows) →
 * restore from that CSV → everything is back (conf numbers, QR codes,
 * check-in state), and re-running the restore is a no-op (skip-existing).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://backup-tests";
process.env.APP_ENV = "test";
process.env.EMAIL_PROVIDER = "console";

import { getDb, schema } from "../src/db/client";
import {
  buildBackupCsv,
  buildMembersCsv,
  buildDonationsCsv,
  buildSettingsCsv,
  parseCsv,
  restoreFromCsv,
} from "../src/lib/backup";

let csv = "";

beforeAll(async () => {
  const db = getDb();
  const client = (db as unknown as { $client: { exec: (sql: string) => Promise<unknown> } }).$client;
  await client.exec(`
  CREATE TABLE IF NOT EXISTS events (id text PRIMARY KEY, slug text NOT NULL, name text NOT NULL, name_bengali text, theme text NOT NULL DEFAULT 'none', description text, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, venue_name text, venue_address text, venue_map_url text, poster_url text, days jsonb, status text NOT NULL DEFAULT 'draft', publish_at timestamptz, is_member_only boolean NOT NULL DEFAULT false, created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS ticket_types (id text PRIMARY KEY, event_id text NOT NULL, name text NOT NULL, description text, pricing_model text NOT NULL DEFAULT 'per_person', price_member_cents integer NOT NULL, price_nonmember_cents integer NOT NULL, age_band text NOT NULL DEFAULT 'all', day_keys jsonb, with_food boolean NOT NULL DEFAULT true, check_in_start text, capacity integer, sold_count integer NOT NULL DEFAULT 0, requires_food_selection boolean NOT NULL DEFAULT true, sale_starts_at timestamptz, sale_ends_at timestamptz, display_order integer NOT NULL DEFAULT 0, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS registrations (id text PRIMARY KEY, confirmation_number text NOT NULL, event_id text NOT NULL, member_id text, buyer_email text NOT NULL, buyer_name text NOT NULL, buyer_phone text, is_member_purchase boolean NOT NULL DEFAULT false, source text NOT NULL DEFAULT 'web', subtotal_cents integer NOT NULL, discount_cents integer NOT NULL DEFAULT 0, total_cents integer NOT NULL, processing_fee_cents integer NOT NULL DEFAULT 0, membership_signup boolean NOT NULL DEFAULT false, promo_code_id text, payment_method text NOT NULL, status text NOT NULL DEFAULT 'pending_payment', square_order_id text, square_payment_id text, zelle_verified_by text, zelle_verified_at timestamptz, zelle_sent_clicked_at timestamptz, paid_at timestamptz, cancelled_at timestamptz, reservation_expires_at timestamptz, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS tickets (id text PRIMARY KEY, registration_id text NOT NULL, ticket_type_id text NOT NULL, attendee_first_name text NOT NULL, attendee_last_name text, attendee_age integer, attendee_is_member boolean NOT NULL DEFAULT false, food_pref text, dietary_notes text, day_key text DEFAULT 'all', price_cents integer NOT NULL DEFAULT 0, qr_code text NOT NULL, checked_in_at timestamptz, checked_in_by text, created_at timestamptz NOT NULL DEFAULT now());
  CREATE UNIQUE INDEX IF NOT EXISTS tickets_qr_idx ON tickets (qr_code);
  CREATE TABLE IF NOT EXISTS audit_log (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text, action text NOT NULL, entity_type text NOT NULL, entity_id text, changes jsonb, ip_address text, user_agent text, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, email text NOT NULL, password_hash text NOT NULL, email_verified_at timestamptz, role text NOT NULL DEFAULT 'member', last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
  CREATE TABLE IF NOT EXISTS members (id text PRIMARY KEY, user_id text NOT NULL, family_name text NOT NULL, primary_first_name text NOT NULL, primary_last_name text NOT NULL, phone text, address_line1 text, address_line2 text, city text, state text, zip text, country text DEFAULT 'US', membership_status text NOT NULL DEFAULT 'pending_payment', membership_started_at date, square_order_id text, membership_expires_at timestamptz, member_number text, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
  CREATE TABLE IF NOT EXISTS family_members (id text PRIMARY KEY, member_id text NOT NULL, first_name text NOT NULL, last_name text, relationship text NOT NULL DEFAULT 'spouse', date_of_birth date, is_member boolean NOT NULL DEFAULT true, food_pref text DEFAULT 'non_veg', dietary_notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS donations (id text PRIMARY KEY, confirmation_number text NOT NULL, member_id text, donor_name text NOT NULL, donor_email text NOT NULL, donor_phone text, amount_cents integer NOT NULL, in_honor_or_memory text NOT NULL DEFAULT 'none', honoree_name text, honoree_notify_email text, message text, is_anonymous boolean NOT NULL DEFAULT false, payment_method text NOT NULL, status text NOT NULL DEFAULT 'pending_payment', square_order_id text, square_payment_id text, zelle_verified_by text, zelle_verified_at timestamptz, paid_at timestamptz, cancelled_at timestamptz, reservation_expires_at timestamptz, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS system_config (key text PRIMARY KEY, value jsonb, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text);
  `);

  // seed: one event, one ticket type, one paid registration with 2 tickets
  const [event] = await db
    .insert(schema.events)
    .values({ slug: "pujo-2026", name: "Durga Pujo 2026", startsAt: new Date(), endsAt: new Date(), status: "published" })
    .returning();
  const [type] = await db
    .insert(schema.ticketTypes)
    .values({ eventId: event.id, name: "Adult · All days", priceMemberCents: 4000, priceNonmemberCents: 6000 })
    .returning();
  const [reg] = await db
    .insert(schema.registrations)
    .values({
      confirmationNumber: "PRG-2026-0042",
      eventId: event.id,
      buyerEmail: "buyer@example.com",
      buyerName: 'Ritika "Riti" Sen, PhD', // commas + quotes → exercises CSV escaping
      buyerPhone: "+1 267 555 0142",
      subtotalCents: 12000,
      totalCents: 12000,
      paymentMethod: "zelle",
      status: "paid",
      paidAt: new Date("2026-07-01T12:00:00Z"),
    })
    .returning();
  await db.insert(schema.tickets).values([
    {
      registrationId: reg.id, ticketTypeId: type.id, attendeeFirstName: "Ritika", attendeeLastName: "Sen",
      foodPref: "veg", dayKey: "all", priceCents: 6000, qrCode: "PRAGATI-TKT-AAA111",
      checkedInAt: new Date("2026-10-17T18:00:00Z"),
    },
    {
      registrationId: reg.id, ticketTypeId: type.id, attendeeFirstName: "Anik", attendeeLastName: "Sen",
      foodPref: "non_veg", dayKey: "sat", priceCents: 6000, qrCode: "PRAGATI-TKT-BBB222",
    },
  ]);
});

describe("backup CSV", () => {
  it("snapshots every registration and ticket, round-trippable through the parser", async () => {
    const built = await buildBackupCsv();
    csv = built.csv;
    expect(built.regCount).toBe(1);
    expect(built.ticketCount).toBe(2);

    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3); // header + 2 ticket rows
    const header = rows[0];
    const first = rows[1];
    expect(first[header.indexOf("confirmation_number")]).toBe("PRG-2026-0042");
    expect(first[header.indexOf("buyer_name")]).toBe('Ritika "Riti" Sen, PhD'); // escaping survived
    expect(first[header.indexOf("event_slug")]).toBe("pujo-2026");
  });
});

describe("companion snapshots", () => {
  it("members, donations and settings CSVs include seeded data (no password hashes)", async () => {
    const db = getDb();
    const [user] = await db
      .insert(schema.users)
      .values({ email: "family@example.com", passwordHash: "SECRET-HASH", role: "member" })
      .returning();
    const [member] = await db
      .insert(schema.members)
      .values({ userId: user.id, familyName: "Sen family", primaryFirstName: "Ritika", primaryLastName: "Sen", membershipStatus: "active" })
      .returning();
    await db.insert(schema.familyMembers).values({ memberId: member.id, firstName: "Anik", relationship: "spouse" });
    await db.insert(schema.donations).values({
      confirmationNumber: "DON-2026-0007", donorName: "Ritika Sen", donorEmail: "family@example.com",
      amountCents: 10100, paymentMethod: "zelle", status: "paid",
    });
    await db.insert(schema.systemConfig).values({ key: "backup_email", value: "pragati.management@gmail.com" });

    const members = await buildMembersCsv();
    expect(members.count).toBe(1);
    expect(members.csv).toContain("Sen family");
    expect(members.csv).toContain("Anik");
    expect(members.csv).not.toContain("SECRET-HASH"); // passwords never leave the DB

    const donations = await buildDonationsCsv();
    expect(donations.count).toBe(1);
    expect(donations.csv).toContain("DON-2026-0007");
    expect(donations.csv).toContain("10100");

    const settings = await buildSettingsCsv();
    expect(settings.count).toBe(1);
    expect(settings.csv).toContain("backup_email");
  });
});

describe("restore after database loss", () => {
  it("brings everything back from the CSV alone", async () => {
    const db = getDb();
    // simulate total loss of registration data (and even the event)
    await db.delete(schema.tickets);
    await db.delete(schema.registrations);
    await db.delete(schema.ticketTypes);
    await db.delete(schema.events);

    const result = await restoreFromCsv(csv, "super-admin-1");
    expect(result.errors).toEqual([]);
    expect(result.regsInserted).toBe(1);
    expect(result.ticketsInserted).toBe(2);
    expect(result.eventsCreated).toEqual(["pujo-2026"]);

    const [reg] = await db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.confirmationNumber, "PRG-2026-0042"));
    expect(reg.buyerName).toBe('Ritika "Riti" Sen, PhD');
    expect(reg.status).toBe("paid");
    expect(reg.totalCents).toBe(12000);

    const tix = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id));
    expect(tix).toHaveLength(2);
    const riti = tix.find((t) => t.qrCode === "PRAGATI-TKT-AAA111")!;
    expect(riti.foodPref).toBe("veg");
    expect(riti.checkedInAt).not.toBeNull(); // check-in state survived the disaster
  });

  it("is idempotent — running the same restore again changes nothing", async () => {
    const result = await restoreFromCsv(csv, "super-admin-1");
    expect(result.regsInserted).toBe(0);
    expect(result.ticketsInserted).toBe(0);
    expect(result.regsSkipped).toBe(1);
    expect(result.ticketsSkipped).toBe(2);
  });

  it("rejects a file that isn't a Pragati backup", async () => {
    await expect(restoreFromCsv("name,email\nBob,bob@x.com", "super-admin-1")).rejects.toThrow(
      /doesn't look like a Pragati backup/
    );
  });
});
