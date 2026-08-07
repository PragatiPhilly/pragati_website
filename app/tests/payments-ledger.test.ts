/**
 * The payments ledger — the single source of truth for money.
 *
 * These guard the specific defects that made the admin screens disagree:
 *  - a checkout that bundles tickets + donation + membership dues used to
 *    collapse into one registrations.total_cents figure, so the dashboard
 *    counted in-checkout donations as ticket revenue and dues as ticket revenue
 *  - standalone membership dues were recorded nowhere as money at all
 *  - cancelled/abandoned checkouts must never count as collected
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://ledger-tests";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.TEST_EMAIL_OVERRIDE = "sayantankundu93@gmail.com";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

import { getDb, schema } from "../src/db/client";
import { createCheckout, markRegistrationPaid, cancelRegistration } from "../src/lib/checkout";
import { createDonation, markDonationPaid } from "../src/lib/donations";
import { moneyTotals } from "../src/lib/ledger";
import { ensurePaymentsTable } from "../src/lib/ledger-ensure";

let eventId = "";
const DUES = 3500; // membership_annual_price_cents default

beforeAll(async () => {
  const db = getDb();
  const client = (db as unknown as { $client: { exec: (sql: string) => Promise<unknown> } }).$client;
  await client.exec(`
  CREATE TABLE IF NOT EXISTS events (id text PRIMARY KEY, slug text NOT NULL, name text NOT NULL, name_bengali text, theme text NOT NULL DEFAULT 'none', description text, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, venue_name text, venue_address text, venue_map_url text, poster_url text, days jsonb, status text NOT NULL DEFAULT 'draft', publish_at timestamptz, is_member_only boolean NOT NULL DEFAULT false, created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS ticket_types (id text PRIMARY KEY, event_id text NOT NULL, name text NOT NULL, description text, pricing_model text NOT NULL DEFAULT 'per_person', price_member_cents integer NOT NULL, price_nonmember_cents integer NOT NULL, age_band text NOT NULL DEFAULT 'all', day_keys jsonb, with_food boolean NOT NULL DEFAULT true, check_in_start text, capacity integer, sold_count integer NOT NULL DEFAULT 0, requires_food_selection boolean NOT NULL DEFAULT true, sale_starts_at timestamptz, sale_ends_at timestamptz, display_order integer NOT NULL DEFAULT 0, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS promo_codes (id text PRIMARY KEY, event_id text, code text NOT NULL, discount_type text NOT NULL, discount_value integer NOT NULL, max_uses_total integer, max_uses_per_member integer DEFAULT 1, current_uses integer NOT NULL DEFAULT 0, valid_from timestamptz, valid_until timestamptz, created_by text, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS registrations (id text PRIMARY KEY, confirmation_number text NOT NULL, event_id text NOT NULL, member_id text, buyer_email text NOT NULL, buyer_name text NOT NULL, buyer_phone text, is_member_purchase boolean NOT NULL DEFAULT false, source text NOT NULL DEFAULT 'web', subtotal_cents integer NOT NULL, discount_cents integer NOT NULL DEFAULT 0, total_cents integer NOT NULL, processing_fee_cents integer NOT NULL DEFAULT 0, donation_cents integer NOT NULL DEFAULT 0, membership_signup boolean NOT NULL DEFAULT false, self_declared_member boolean NOT NULL DEFAULT false, promo_code_id text, payment_method text NOT NULL, status text NOT NULL DEFAULT 'pending_payment', square_order_id text, square_payment_id text, zelle_verified_by text, zelle_verified_at timestamptz, zelle_sent_clicked_at timestamptz, paid_at timestamptz, cancelled_at timestamptz, reservation_expires_at timestamptz, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS tickets (id text PRIMARY KEY, registration_id text NOT NULL, ticket_type_id text NOT NULL, attendee_first_name text NOT NULL, attendee_last_name text, attendee_age integer, attendee_is_member boolean NOT NULL DEFAULT false, food_pref text, dietary_notes text, student_info jsonb, day_key text DEFAULT 'all', price_cents integer NOT NULL DEFAULT 0, qr_code text NOT NULL, checked_in_at timestamptz, checked_in_by text, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS donations (id text PRIMARY KEY, confirmation_number text NOT NULL, member_id text, donor_name text NOT NULL, donor_email text NOT NULL, donor_phone text, amount_cents integer NOT NULL, in_honor_or_memory text NOT NULL DEFAULT 'none', designation text, honoree_name text, honoree_notify_email text, message text, is_anonymous boolean NOT NULL DEFAULT false, payment_method text NOT NULL, status text NOT NULL DEFAULT 'pending_payment', square_order_id text, square_payment_id text, zelle_verified_by text, zelle_verified_at timestamptz, paid_at timestamptz, cancelled_at timestamptz, reservation_expires_at timestamptz, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, email text NOT NULL, password_hash text NOT NULL, email_verified_at timestamptz, role text NOT NULL DEFAULT 'member', last_login_at timestamptz, failed_login_count integer NOT NULL DEFAULT 0, last_failed_login_at timestamptz, locked_until timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
  CREATE TABLE IF NOT EXISTS members (id text PRIMARY KEY, user_id text NOT NULL, family_name text NOT NULL, primary_first_name text NOT NULL, primary_last_name text NOT NULL, phone text, address_line1 text, address_line2 text, city text, state text, zip text, country text DEFAULT 'US', membership_status text NOT NULL DEFAULT 'pending_payment', membership_started_at date, square_order_id text, membership_expires_at timestamptz, member_number text, source text NOT NULL DEFAULT 'account', notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz);
  CREATE TABLE IF NOT EXISTS family_members (id text PRIMARY KEY, member_id text NOT NULL, first_name text NOT NULL, last_name text, relationship text NOT NULL DEFAULT 'spouse', date_of_birth date, food_pref text NOT NULL DEFAULT 'non_veg', dietary_notes text, is_member boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS audit_log (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text, action text NOT NULL, entity_type text NOT NULL, entity_id text, changes jsonb, ip_address text, user_agent text, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS system_config (key text PRIMARY KEY, value jsonb, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text);
  CREATE TABLE IF NOT EXISTS counters (key text PRIMARY KEY, value integer NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS email_log (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, to_email text NOT NULL, original_to_email text, template text NOT NULL, subject text NOT NULL, body_text text, status text NOT NULL DEFAULT 'queued', provider_message_id text, error text, related_user_id text, related_registration_id text, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS email_outbox (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, to_email text NOT NULL, subject text NOT NULL, body_text text, body_html text, template text NOT NULL, priority integer NOT NULL DEFAULT 2, digest_key text, related_user_id text, related_registration_id text, attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'queued', last_error text, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS password_reset_tokens (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text NOT NULL, token_hash text NOT NULL, purpose text NOT NULL DEFAULT 'reset', expires_at timestamptz NOT NULL, used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
  `);
  await ensurePaymentsTable();

  const [event] = await db
    .insert(schema.events)
    .values({
      slug: "ledger-pujo",
      name: "Ledger Pujo",
      startsAt: new Date("2026-10-16"),
      endsAt: new Date("2026-10-18"),
      status: "published",
      days: [
        { key: "fri", label: "Fri", date: "2026-10-16" },
        { key: "sat", label: "Sat", date: "2026-10-17" },
        { key: "sun", label: "Sun", date: "2026-10-18" },
      ],
    })
    .returning();
  eventId = event.id;

  await db.insert(schema.ticketTypes).values([
    { eventId, name: "Adult 1day food", ageBand: "adult", dayKeys: null, withFood: true, priceMemberCents: 3500, priceNonmemberCents: 5000 },
  ]);
});

const rowsFor = async (entityId: string) => {
  const db = getDb();
  return db.select().from(schema.payments).where(eq(schema.payments.entityId, entityId));
};

describe("checkout splits into revenue streams", () => {
  it("writes separate ticket / donation / membership rows that sum to the charged total", async () => {
    const res = await createCheckout({
      eventId,
      buyerName: "Split Buyer",
      buyerEmail: "split@example.com",
      isMemberPurchase: false,
      paymentMethod: "square",
      donationCents: 2000,
      wantsMembership: true, // also switches the household to member pricing
      attendees: [{ firstName: "Split", isKid: false, days: ["sat"], withFood: true, foodPref: "veg" }],
    });
    expect(res.totalCents).toBe(3500 + 2000 + DUES); // member price + donation + dues

    const db = getDb();
    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, res.confirmationNumber));
    const rows = await rowsFor(reg.id);

    const by = (kind: string) => rows.find((r) => r.kind === kind);
    expect(by("registration")!.amountCents).toBe(3500);
    expect(by("donation")!.amountCents).toBe(2000);
    expect(by("membership")!.amountCents).toBe(DUES);

    // the whole point: components reconcile with what the buyer was charged
    expect(rows.reduce((s, r) => s + r.amountCents, 0)).toBe(reg.totalCents);
    // the card surcharge is tracked separately, never inside a revenue figure
    expect(rows.reduce((s, r) => s + r.feeCents, 0)).toBe(reg.processingFeeCents);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
  });

  it("settles every component of the checkout when the payment lands", async () => {
    const db = getDb();
    const res = await createCheckout({
      eventId,
      buyerName: "Paid Buyer",
      buyerEmail: "paidbuyer@example.com",
      isMemberPurchase: false,
      paymentMethod: "square",
      donationCents: 1000,
      attendees: [{ firstName: "Paid", isKid: false, days: ["sat"], withFood: true, foodPref: "veg" }],
    });
    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, res.confirmationNumber));

    await markRegistrationPaid(reg.id, { method: "square", squarePaymentId: "PAY-LEDGER-1" });

    const rows = await rowsFor(reg.id);
    expect(rows.every((r) => r.status === "paid")).toBe(true);
    expect(rows.every((r) => r.squarePaymentId === "PAY-LEDGER-1")).toBe(true);
    expect(rows.every((r) => r.paidAt !== null)).toBe(true);
  });

  it("voids the ledger when a reservation is cancelled, so it never counts as collected", async () => {
    const db = getDb();
    const before = await moneyTotals();
    const res = await createCheckout({
      eventId,
      buyerName: "Abandoned Cart",
      buyerEmail: "abandoned@example.com",
      isMemberPurchase: false,
      paymentMethod: "square",
      attendees: [{ firstName: "Abandoned", isKid: false, days: ["sat"], withFood: true, foodPref: "veg" }],
    });
    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, res.confirmationNumber));

    await cancelRegistration(reg.id, "cancelled_no_payment");

    const rows = await rowsFor(reg.id);
    expect(rows.every((r) => r.status === "cancelled")).toBe(true);

    const after = await moneyTotals();
    expect(after.registration.collected).toBe(before.registration.collected);
    expect(after.totalOutstanding).toBe(before.totalOutstanding); // no longer pending either
  });
});

describe("standalone donations", () => {
  it("records the donation and settles it on payment", async () => {
    const db = getDb();
    const before = await moneyTotals();
    const res = await createDonation({
      donorName: "Gift Giver",
      donorEmail: "gift@example.com",
      donorPhone: "+1 5559998888",
      amountCents: 5000,
      inHonorOrMemory: "none",
      isAnonymous: false,
      paymentMethod: "square",
    });
    const [don] = await db.select().from(schema.donations).where(eq(schema.donations.confirmationNumber, res.confirmationNumber));

    const pending = await rowsFor(don.id);
    expect(pending).toHaveLength(1);
    expect(pending[0].kind).toBe("donation");
    expect(pending[0].status).toBe("pending");

    await markDonationPaid(don.id, { method: "square", squarePaymentId: "PAY-DON-1" });
    const settled = await rowsFor(don.id);
    expect(settled[0].status).toBe("paid");

    const after = await moneyTotals();
    expect(after.donation.collected - before.donation.collected).toBe(5000);
  });
});

describe("dashboard totals", () => {
  it("keeps the three streams separate instead of bundling them into ticket revenue", async () => {
    const totals = await moneyTotals();
    // Donations bought inside a checkout must land in the donation bucket, not
    // the registration bucket — this was the core reporting bug.
    expect(totals.donation.collected).toBeGreaterThan(0);
    expect(totals.registration.collected).toBeGreaterThan(0);
    expect(totals.totalCollected).toBe(
      totals.registration.collected + totals.donation.collected + totals.membership.collected
    );
  });
});
