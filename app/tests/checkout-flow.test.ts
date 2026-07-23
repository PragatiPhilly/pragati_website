/**
 * End-to-end checkout state machine tests against a real (in-memory) PGlite DB.
 * Covers: Zelle rail (create → I've-sent-it → admin mark paid) and
 * Square rail (create → webhook-style mark paid), plus idempotency & cancel.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://checkout-tests";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.TEST_EMAIL_OVERRIDE = "sayantankundu93@gmail.com";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

import { getDb, schema } from "../src/db/client";
import { createCheckout, zelleSentClicked, markRegistrationPaid, cancelRegistration } from "../src/lib/checkout";

let eventId = "";

beforeAll(async () => {
  const db = getDb();
  // minimal schema for the tables this flow touches
  const { readFileSync } = await import("fs");
  const { execSync } = await import("child_process");
  void readFileSync;
  void execSync;
  // create tables via drizzle-kit generated SQL is heavy here; instead use PGlite exec with raw DDL
  const client = (db as unknown as { $client: { exec: (sql: string) => Promise<unknown> } }).$client;
  const ddl = `
  CREATE TABLE IF NOT EXISTS events (id text PRIMARY KEY, slug text NOT NULL, name text NOT NULL, name_bengali text, theme text NOT NULL DEFAULT 'none', description text, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, venue_name text, venue_address text, venue_map_url text, poster_url text, days jsonb, status text NOT NULL DEFAULT 'draft', publish_at timestamptz, is_member_only boolean NOT NULL DEFAULT false, created_by text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS ticket_types (id text PRIMARY KEY, event_id text NOT NULL, name text NOT NULL, description text, pricing_model text NOT NULL DEFAULT 'per_person', price_member_cents integer NOT NULL, price_nonmember_cents integer NOT NULL, age_band text NOT NULL DEFAULT 'all', day_keys jsonb, with_food boolean NOT NULL DEFAULT true, check_in_start text, capacity integer, sold_count integer NOT NULL DEFAULT 0, requires_food_selection boolean NOT NULL DEFAULT true, sale_starts_at timestamptz, sale_ends_at timestamptz, display_order integer NOT NULL DEFAULT 0, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS promo_codes (id text PRIMARY KEY, event_id text, code text NOT NULL, discount_type text NOT NULL, discount_value integer NOT NULL, max_uses_total integer, max_uses_per_member integer DEFAULT 1, current_uses integer NOT NULL DEFAULT 0, valid_from timestamptz, valid_until timestamptz, created_by text, archived_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS registrations (id text PRIMARY KEY, confirmation_number text NOT NULL, event_id text NOT NULL, member_id text, buyer_email text NOT NULL, buyer_name text NOT NULL, buyer_phone text, is_member_purchase boolean NOT NULL DEFAULT false, source text NOT NULL DEFAULT 'web', subtotal_cents integer NOT NULL, discount_cents integer NOT NULL DEFAULT 0, total_cents integer NOT NULL, processing_fee_cents integer NOT NULL DEFAULT 0, membership_signup boolean NOT NULL DEFAULT false, promo_code_id text, payment_method text NOT NULL, status text NOT NULL DEFAULT 'pending_payment', square_order_id text, square_payment_id text, zelle_verified_by text, zelle_verified_at timestamptz, zelle_sent_clicked_at timestamptz, paid_at timestamptz, cancelled_at timestamptz, reservation_expires_at timestamptz, notes text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS tickets (id text PRIMARY KEY, registration_id text NOT NULL, ticket_type_id text NOT NULL, attendee_first_name text NOT NULL, attendee_last_name text, attendee_age integer, attendee_is_member boolean NOT NULL DEFAULT false, food_pref text, dietary_notes text, day_key text DEFAULT 'all', price_cents integer NOT NULL DEFAULT 0, qr_code text NOT NULL, checked_in_at timestamptz, checked_in_by text, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS system_config (key text PRIMARY KEY, value jsonb, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text);
  CREATE TABLE IF NOT EXISTS counters (key text PRIMARY KEY, value integer NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS email_log (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, to_email text NOT NULL, original_to_email text, template text NOT NULL, subject text NOT NULL, body_text text, status text NOT NULL DEFAULT 'queued', provider_message_id text, error text, related_user_id text, related_registration_id text, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS processed_webhook_events (event_id text PRIMARY KEY, provider text NOT NULL DEFAULT 'square', processed_at timestamptz NOT NULL DEFAULT now());
  `;
  await client.exec(ddl);

  const [event] = await db
    .insert(schema.events)
    .values({
      slug: "test-pujo",
      name: "Test Pujo",
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
    { eventId, name: "Adult 3day food", ageBand: "adult", dayKeys: ["fri", "sat", "sun"], withFood: true, priceMemberCents: 8000, priceNonmemberCents: 11500 },
    { eventId, name: "Adult 1day food", ageBand: "adult", dayKeys: null, withFood: true, priceMemberCents: 3500, priceNonmemberCents: 5000 },
    { eventId, name: "Kid 3day", ageBand: "child_5_12", dayKeys: ["fri", "sat", "sun"], withFood: true, priceMemberCents: 2000, priceNonmemberCents: 3000 },
  ]);
});

describe("Zelle rail", () => {
  it("creates a pending_zelle_verification registration with instructions", async () => {
    const res = await createCheckout({
      eventId,
      buyerName: "Guest Buyer",
      buyerEmail: "guest@example.com",
      isMemberPurchase: false,
      paymentMethod: "zelle",
      attendees: [
        { firstName: "Guest", isKid: false, days: ["fri", "sat", "sun"], withFood: true, foodPref: "non_veg" },
        { firstName: "Kiddo", isKid: true, age: 8, days: ["fri", "sat", "sun"], withFood: true, foodPref: "kid" },
      ],
    });
    expect(res.kind).toBe("zelle_instructions");
    if (res.kind !== "zelle_instructions") return;
    expect(res.confirmationNumber).toMatch(/^PRG-\d{4}-\d{4}$/);
    expect(res.totalCents).toBe(11500 + 3000);
    expect(res.zelle.recipientEmail).toBe("sayantankundu93@gmail.com"); // config default (test)
    expect(res.zelle.memo).toBe(res.confirmationNumber);

    const db = getDb();
    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, res.confirmationNumber));
    expect(reg.status).toBe("pending_zelle_verification");

    // "I've sent it" extends the hold + sends emails
    await zelleSentClicked(res.confirmationNumber);
    const [reg2] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, reg.id));
    expect(reg2.zelleSentClickedAt).not.toBeNull();
    expect(reg2.reservationExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 40 * 3600_000);

    // admin marks paid → tickets email, status paid
    await markRegistrationPaid(reg.id, { method: "zelle", adminUserId: "admin-1" });
    const [reg3] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, reg.id));
    expect(reg3.status).toBe("paid");
    expect(reg3.zelleVerifiedBy).toBe("admin-1");

    // treasurer alerts are digestable now — they wait in the outbox and go
    // out on the next drain (max 15 min in production), batched if several
    const { drainOutbox } = await import("../src/lib/email");
    await drainOutbox();

    const emails = await db.select().from(schema.emailLog);
    const templates = emails.map((e) => e.template);
    expect(templates).toContain("zelle_ack");
    expect(templates).toContain("admin_alert");
    expect(templates).toContain("ticket");
    // test mode: every email redirected to the override address
    expect(emails.every((e) => e.toEmail === "sayantankundu93@gmail.com")).toBe(true);
  });
});

describe("Square rail (test mode)", () => {
  it("creates a registration and simulator URL; marking paid is idempotent", async () => {
    const res = await createCheckout({
      eventId,
      buyerName: "Card Buyer",
      buyerEmail: "card@example.com",
      isMemberPurchase: false,
      paymentMethod: "square",
      attendees: [{ firstName: "Solo", isKid: false, days: ["sat"], withFood: true, foodPref: "veg" }],
    });
    expect(res.kind).toBe("square_redirect");
    if (res.kind !== "square_redirect") return;
    expect(res.url).toContain("/pay/square-simulator");
    expect(res.totalCents).toBe(5000); // single day, non-member

    const db = getDb();
    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, res.confirmationNumber));

    await markRegistrationPaid(reg.id, { method: "square", squarePaymentId: "PAY-1" });
    await markRegistrationPaid(reg.id, { method: "square", squarePaymentId: "PAY-1" }); // duplicate webhook
    const emails = await db.select().from(schema.emailLog);
    const ticketEmails = emails.filter((e) => e.template === "ticket" && e.relatedRegistrationId === reg.id);
    expect(ticketEmails.length).toBe(1); // idempotent — no double send
  });

  it("per-day expansion creates one ticket per selected day", async () => {
    const res = await createCheckout({
      eventId,
      buyerName: "Two Day",
      buyerEmail: "two@example.com",
      isMemberPurchase: false,
      paymentMethod: "zelle",
      attendees: [{ firstName: "Didi", isKid: false, days: ["fri", "sat"], withFood: true, foodPref: "veg" }],
    });
    if (res.kind !== "zelle_instructions") throw new Error("expected zelle");
    expect(res.totalCents).toBe(10000); // 2 × $50 single-day
    const db = getDb();
    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, res.confirmationNumber));
    const tix = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id));
    expect(tix.length).toBe(2);
    expect(tix.map((t) => t.dayKey).sort()).toEqual(["fri", "sat"]);
  });
});

describe("cancellation", () => {
  it("releases held capacity", async () => {
    const db = getDb();
    const res = await createCheckout({
      eventId,
      buyerName: "Flaky",
      buyerEmail: "flaky@example.com",
      isMemberPurchase: false,
      paymentMethod: "zelle",
      attendees: [{ firstName: "Flaky", isKid: false, days: ["fri", "sat", "sun"], withFood: true, foodPref: "non_veg" }],
    });
    if (res.kind !== "zelle_instructions") throw new Error("expected zelle");
    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, res.confirmationNumber));
    const [ttBefore] = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.name, "Adult 3day food"));
    await cancelRegistration(reg.id, "cancelled_no_payment");
    const [ttAfter] = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.name, "Adult 3day food"));
    expect(ttAfter.soldCount).toBe(ttBefore.soldCount - 1);
    const [regAfter] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, reg.id));
    expect(regAfter.status).toBe("cancelled_no_payment");
  });
});
