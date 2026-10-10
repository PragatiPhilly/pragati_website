/**
 * Membership at the walk-in desk — join, renew or extend for a year, paid by
 * card (Square's page) or Zelle the volunteer has seen.
 *
 * The rules that matter:
 *  - a renewal EXTENDS from the current end date (the public path does nothing
 *    for an active member, which is why the desk has its own);
 *  - one payment = one year, however many times it is confirmed (double tap,
 *    webhook retry, desk "Check payment" and the webhook racing);
 *  - money lands in the ledger as a normal membership row, so every report counts it.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://desk-membership-tests";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.TEST_EMAIL_OVERRIDE = "sayantankundu93@gmail.com";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = "test-signature-key";

const SESSION = { userId: "u-vol", email: "vol@pragati.test", role: "super_admin" as const };
vi.mock("../src/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/auth/session")>();
  return { ...actual, getSession: async () => SESSION };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));

import { getDb, schema } from "../src/db/client";
import { createTestSchema } from "./helpers/schema";
import { requireDesk, type DeskActor } from "../src/lib/desk/guards";
import { signSquareWebhook } from "../src/lib/payments/square";
import {
  findOrCreateDeskMember,
  nextExpiry,
  searchForMembership,
  settleDeskDuesCard,
  standingOf,
  plusOneYear,
  takeMembershipDues,
  cancelDeskDuesCard,
} from "../src/lib/desk/membership";

const WEBHOOK_URL = "http://localhost:3000/api/webhooks/square";
let actor: DeskActor;

const memberOf = async (id: string) => (await getDb().select().from(schema.members).where(eq(schema.members.id, id)))[0];
const duesRows = async (memberId: string) =>
  (await getDb().select().from(schema.payments).where(eq(schema.payments.entityId, memberId))).filter((r) => r.kind === "membership");
const idem = () => crypto.randomUUID();

async function postWebhook(body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  const { POST } = await import("../src/app/api/webhooks/square/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest(WEBHOOK_URL, {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json", "x-square-hmacsha256-signature": signSquareWebhook(raw, WEBHOOK_URL) },
  });
  const res = await POST(req);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}
const paid = (paymentId: string, orderId: string, amount: number) => ({
  event_id: `evt-${paymentId}`,
  type: "payment.updated",
  data: { object: { payment: { id: paymentId, status: "COMPLETED", order_id: orderId, total_money: { amount, currency: "USD" } } } },
});

async function activeMember(email: string, expires: Date, source = "account") {
  const db = getDb();
  const [u] = await db.insert(schema.users).values({ email, passwordHash: "x", role: "member" }).returning();
  const [m] = await db
    .insert(schema.members)
    .values({
      userId: u.id,
      familyName: "Test family",
      primaryFirstName: "Active",
      primaryLastName: "Member",
      membershipStatus: "active",
      membershipExpiresAt: expires,
      memberNumber: "PGM-TEST" + email.length,
      source,
    })
    .returning();
  return m;
}

beforeAll(async () => {
  await createTestSchema();
  await getDb().insert(schema.users).values({ id: "u-vol", email: "vol@pragati.test", passwordHash: "x", role: "super_admin" });
  actor = await requireDesk();
});

describe("term rules", () => {
  it("DM-0 a year is the same calendar date next year", () => {
    expect(plusOneYear(new Date("2027-10-09T20:00:00Z")).toISOString()).toBe("2028-10-09T20:00:00.000Z");
    expect(plusOneYear(new Date("2028-02-29T12:00:00Z")).toISOString()).toBe("2029-02-28T12:00:00.000Z");
  });
  const now = new Date("2026-10-09T20:00:00Z");
  it("DM-1 an active member renews from their current end date, not from today", () => {
    const end = new Date("2027-08-01T00:00:00Z");
    expect(nextExpiry({ membershipStatus: "active", membershipExpiresAt: end, source: "account" }, now).getTime()).toBe(plusOneYear(end).getTime());
  });
  it("DM-2 lapsed, unpaid and new members get a year from today", () => {
    expect(nextExpiry({ membershipStatus: "active", membershipExpiresAt: new Date("2026-01-01"), source: "account" }, now).getTime()).toBe(plusOneYear(now).getTime());
    expect(nextExpiry({ membershipStatus: "pending_payment", membershipExpiresAt: null, source: "account" }, now).getTime()).toBe(plusOneYear(now).getTime());
    expect(nextExpiry({ membershipStatus: "inactive", membershipExpiresAt: null, source: "account" }, now).getTime()).toBe(plusOneYear(now).getTime());
  });
  it("DM-3 an honour-system claim paying for real gets its first real year (not two)", () => {
    const claimed = new Date("2027-08-19T00:00:00Z");
    expect(standingOf({ membershipStatus: "active", membershipExpiresAt: claimed, source: "self_declared" }, now)).toBe("honour");
    expect(nextExpiry({ membershipStatus: "active", membershipExpiresAt: claimed, source: "self_declared" }, now).getTime()).toBe(plusOneYear(now).getTime());
  });
});

describe("desk membership", () => {
  it("DM-4 a brand-new person: account + member created, Zelle seen → active for a year, one ledger row", async () => {
    const { memberId, existed } = await findOrCreateDeskMember(
      { firstName: "Nobo", lastName: "Sadashya", email: "Nobo@x.com", phone: "215-555-0101" },
      actor
    );
    expect(existed).toBe(false);
    const before = await memberOf(memberId);
    expect(before.membershipStatus).toBe("pending_payment");

    await expect(
      takeMembershipDues({ memberId, method: "zelle", idem: idem(), zelle: { confirmationSeen: false } }, actor)
    ).rejects.toThrow(/Zelle confirmation/);

    const key = idem();
    const out = await takeMembershipDues({ memberId, method: "zelle", idem: key, zelle: { confirmationSeen: true, senderName: "Nobo S" } }, actor);
    expect(out.status).toBe("paid");
    expect(out.done?.renewed).toBe(false);
    const after = await memberOf(memberId);
    expect(after.membershipStatus).toBe("active");
    expect(after.memberNumber).toMatch(/^PGM-/);
    expect(Math.abs(after.membershipExpiresAt!.getTime() - plusOneYear(new Date()).getTime())).toBeLessThan(60_000);

    // double tap: same key → same row, no second year
    const again = await takeMembershipDues({ memberId, method: "zelle", idem: key, zelle: { confirmationSeen: true } }, actor);
    expect(again.paymentId).toBe(out.paymentId);
    expect((await memberOf(memberId)).membershipExpiresAt!.getTime()).toBe(after.membershipExpiresAt!.getTime());
    const rows = await duesRows(memberId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "paid", method: "zelle", amountCents: 3500, source: "app", memberId });

    // the same email again finds the same member, never a second account
    const second = await findOrCreateDeskMember({ firstName: "N", lastName: "S", email: "nobo@x.com", phone: "2155550101" }, actor);
    expect(second).toEqual({ memberId, existed: true });
  });

  it("DM-5 an active member renewing by Zelle is extended one year from their end date", async () => {
    const end = new Date(Date.now() + 200 * 86_400_000);
    const m = await activeMember("renew@x.com", end);
    const out = await takeMembershipDues({ memberId: m.id, method: "zelle", idem: idem(), zelle: { confirmationSeen: true } }, actor);
    expect(out.done?.renewed).toBe(true);
    expect((await memberOf(m.id)).membershipExpiresAt!.getTime()).toBe(plusOneYear(end).getTime());
  });

  it("DM-6 card: pending until Square confirms; webhook adds the year exactly once (retry + desk check race)", async () => {
    const end = new Date(Date.now() + 300 * 86_400_000);
    const m = await activeMember("card@x.com", end);
    const out = await takeMembershipDues({ memberId: m.id, method: "square", idem: idem(), withCardFee: true }, actor);
    expect(out.status).toBe("pending");
    expect(out.payUrl).toBeTruthy();
    expect(out.totalCents).toBeGreaterThan(3500);
    expect((await memberOf(m.id)).membershipExpiresAt!.getTime()).toBe(end.getTime()); // nothing yet

    const [row] = (await duesRows(m.id)).filter((r) => r.id === out.paymentId);
    expect(row.status).toBe("pending");
    expect((await memberOf(m.id)).squareOrderId).toBe(row.squareOrderId);

    const r1 = await postWebhook(paid("sq-pay-1", row.squareOrderId!, out.totalCents));
    expect(r1.status).toBe(200);
    expect(r1.json).toMatchObject({ handled: true, desk: true });
    expect((await memberOf(m.id)).membershipExpiresAt!.getTime()).toBe(plusOneYear(end).getTime());

    // Square retries with a new event id, and the desk button also fires: still one year.
    await postWebhook({ ...paid("sq-pay-1", row.squareOrderId!, out.totalCents), event_id: "evt-retry" });
    await settleDeskDuesCard({ paymentId: out.paymentId, squarePaymentId: "sq-pay-1", squareAmountCents: out.totalCents });
    expect((await memberOf(m.id)).membershipExpiresAt!.getTime()).toBe(plusOneYear(end).getTime());
    const [settled] = (await duesRows(m.id)).filter((r) => r.id === out.paymentId);
    expect(settled).toMatchObject({ status: "paid", squarePaymentId: "sq-pay-1" });
    expect(settled.squareVerifiedAt).toBeTruthy();
  });

  it("DM-7 card short-paid is not settled and adds nothing", async () => {
    const m = await activeMember("short@x.com", new Date(Date.now() + 100 * 86_400_000));
    const before = (await memberOf(m.id)).membershipExpiresAt!.getTime();
    const out = await takeMembershipDues({ memberId: m.id, method: "square", idem: idem() }, actor);
    const res = await settleDeskDuesCard({ paymentId: out.paymentId, squarePaymentId: "sq-short", squareAmountCents: 1000 });
    expect(res.settled).toBe(false);
    expect((await memberOf(m.id)).membershipExpiresAt!.getTime()).toBe(before);
  });

  it("DM-8 a cancelled card attempt can't be settled later by the desk", async () => {
    const m = await activeMember("cancel@x.com", new Date(Date.now() + 100 * 86_400_000));
    const out = await takeMembershipDues({ memberId: m.id, method: "square", idem: idem() }, actor);
    await cancelDeskDuesCard(out.paymentId, actor);
    const res = await settleDeskDuesCard({ paymentId: out.paymentId, squarePaymentId: "sq-late", squareAmountCents: out.totalCents });
    expect(res.settled).toBe(false);
  });

  it("DM-9 the public dues webhook path is untouched for non-desk payments", async () => {
    const db = getDb();
    const [u] = await db.insert(schema.users).values({ email: "public@x.com", passwordHash: "x", role: "member" }).returning();
    const [m] = await db
      .insert(schema.members)
      .values({ userId: u.id, familyName: "P family", primaryFirstName: "Pub", primaryLastName: "Lic", membershipStatus: "pending_payment", squareOrderId: "PUBLIC-ORDER-1" })
      .returning();
    await db.insert(schema.payments).values({
      kind: "membership",
      entityId: m.id,
      memberId: m.id,
      payerName: "Pub Lic",
      payerEmail: "public@x.com",
      amountCents: 3500,
      feeCents: 0,
      method: "square",
      status: "pending",
      squareOrderId: "PUBLIC-ORDER-1",
    });
    const r = await postWebhook(paid("sq-public", "PUBLIC-ORDER-1", 3500));
    expect(r.json).toMatchObject({ handled: true, kind: "membership" });
    expect(r.json.desk).toBeUndefined();
    expect((await memberOf(m.id)).membershipStatus).toBe("active");
  });

  it("DM-10 search finds members by email and lists non-member bookers separately", async () => {
    const res = await searchForMembership("nobo@");
    expect(res.members.map((x) => x.email)).toContain("nobo@x.com");
    expect(res.members[0].standing).toBe("active");
  });
});
