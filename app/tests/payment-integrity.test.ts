/**
 * PAYMENT INTEGRITY — the suite that exists because of PRG-2026-0025.
 *
 * WHAT HAPPENED (2026-08-17). A buyer opened a card checkout at 13:44. A
 * 15-minute "reservation" was attached to it. At 16:00 a cron job decided the
 * hold had lapsed and cancelled the order — voiding its ledger rows with the
 * note "reservation expired without payment" and releasing its seats. Square
 * payment links never expire, so at 21:43 the buyer paid $494.40 on that same
 * link. Square captured it, the webhook arrived and worked, the registration
 * went to `paid` — but the money ledger, which the Payments page and the
 * dashboard actually read, still said CANCELLED, because settlePayments() only
 * looked at rows that were still "outstanding" and there were none left.
 *
 * TWO WAYS A MONEY RECORD CAN LIE, and they are not symmetrical:
 *
 *   FALSE NEGATIVE — Square has the money, our books say we don't.
 *     A paying customer with no ticket. The system must recover from this on
 *     its own, from as many independent directions as possible.
 *
 *   FALSE POSITIVE — our books say paid, Square never took it.
 *     Free tickets, and worse, a number in the treasurer's report that is not
 *     real. Nothing may ever produce this without Square's own word, and no
 *     automatic process may ever *un*-pay someone to "fix" one.
 *
 * THE STRUCTURAL RULE these tests enforce: nothing in this application moves a
 * payment towards "not paid" on a timer. Only a person, or Square, can.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://payment-integrity-tests";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.TEST_EMAIL_OVERRIDE = "sayantankundu93@gmail.com";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = "test-signature-key";

// The reconciliation approve/dismiss actions are server actions: they are
// guarded by an admin session and revalidate a route. Neither exists in a unit
// test, so stand in a fixed admin and a no-op revalidate. Everything else about
// the actions — the Square re-check, the guards, the audit trail — runs for real.
vi.mock("../src/lib/auth/access", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/auth/access")>();
  return {
    ...actual,
    requireSectionAccess: async () => ({
      userId: "test-admin",
      email: "treasurer@pragati.test",
      role: "super_admin" as const,
    }),
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));

import { getDb, schema } from "../src/db/client";
import { createTestSchema } from "./helpers/schema";
import { createCheckout, cancelRegistration } from "../src/lib/checkout";
import { signSquareWebhook } from "../src/lib/payments/square";

const WEBHOOK_URL = "http://localhost:3000/api/webhooks/square";
const TICKETS = 33000; // 2 × $165
const DONATION = 15000;
const FEE = 1440; // 3% of $480 — same shape as the real incident

let eventId = "";
let ticketTypeId = "";

beforeAll(async () => {
  await createTestSchema();
  const db = getDb();
  const [event] = await db
    .insert(schema.events)
    .values({
      slug: "integrity-pujo",
      name: "Integrity Pujo",
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
  const [tt] = await db
    .insert(schema.ticketTypes)
    .values({
      eventId,
      name: "Adult 3day food",
      ageBand: "adult",
      dayKeys: ["fri", "sat", "sun"],
      withFood: true,
      priceMemberCents: 12000,
      priceNonmemberCents: 16500,
      capacity: 500,
    })
    .returning();
  ticketTypeId = tt.id;
});

afterEach(() => vi.restoreAllMocks());

// ── helpers ────────────────────────────────────────────────────────────────

/** POST a Square-shaped webhook at the real route handler. */
async function postWebhook(body: Record<string, unknown>, opts: { signature?: string } = {}) {
  const raw = JSON.stringify(body);
  const { POST } = await import("../src/app/api/webhooks/square/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest(WEBHOOK_URL, {
    method: "POST",
    body: raw,
    headers: {
      "content-type": "application/json",
      "x-square-hmacsha256-signature": opts.signature ?? signSquareWebhook(raw, WEBHOOK_URL),
    },
  });
  const res = await POST(req);
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

/** Shaped on the real Square payload from the incident (payment Nsrs08vL…). */
function paymentEvent(p: {
  eventId?: string;
  paymentId: string;
  orderId?: string;
  referenceId?: string;
  amountCents?: number;
  status?: string;
  type?: string;
}) {
  return {
    event_id: p.eventId ?? `evt-${p.paymentId}`,
    type: p.type ?? "payment.updated",
    data: {
      object: {
        payment: {
          id: p.paymentId,
          status: p.status ?? "COMPLETED",
          order_id: p.orderId,
          reference_id: p.referenceId,
          note: "PRG-TEST",
          amount_money: { amount: p.amountCents ?? 0, currency: "USD" },
          total_money: { amount: p.amountCents ?? 0, currency: "USD" },
        },
      },
    },
  };
}

/** 2 adults + a $150 donation on the card rail — the PRG-2026-0025 basket. */
async function openCardCheckout(email: string) {
  const res = await createCheckout({
    eventId,
    buyerName: "Test Buyer",
    buyerEmail: email,
    isMemberPurchase: false,
    paymentMethod: "square",
    donationCents: DONATION,
    attendees: [
      { firstName: "A", isKid: false, days: ["fri", "sat", "sun"], withFood: true, foodPref: "veg" },
      { firstName: "B", isKid: false, days: ["fri", "sat", "sun"], withFood: true, foodPref: "non_veg" },
    ],
  });
  if (res.kind !== "square_redirect") throw new Error("expected the square rail");
  const [reg] = await getDb()
    .select()
    .from(schema.registrations)
    .where(eq(schema.registrations.confirmationNumber, res.confirmationNumber));
  return reg;
}

const reg = async (id: string) =>
  (await getDb().select().from(schema.registrations).where(eq(schema.registrations.id, id)))[0];

const ledger = async (entityId: string) =>
  (await getDb().select().from(schema.payments).where(eq(schema.payments.entityId, entityId))).sort((a, b) =>
    a.kind.localeCompare(b.kind)
  );

const soldCount = async () =>
  (await getDb().select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, ticketTypeId)))[0].soldCount;

const ticketEmails = async (regId: string) =>
  getDb()
    .select()
    .from(schema.emailLog)
    .where(and(eq(schema.emailLog.relatedRegistrationId, regId), eq(schema.emailLog.template, "ticket")));

// ═══════════════════════════════════════════════════════════════════════════

describe("STRUCTURAL — nothing may move a payment towards 'not paid' on a timer", () => {
  it("exposes no reservation/donation sweep at all", async () => {
    const sweeper = await import("../src/lib/sweeper");
    // These are the functions that used to cancel money on a clock. Their
    // absence is the fix; this test is here so nobody quietly reintroduces one.
    expect("sweepExpiredReservations" in sweeper).toBe(false);
    expect("sweepExpiredDonations" in sweeper).toBe(false);
  });

  it("leaves an ancient unpaid checkout untouched when the housekeeping cron runs", async () => {
    const r = await openCardCheckout("ancient@example.com");
    const db = getDb();
    // Backdate it by a year — under the old rules this was long dead.
    await db
      .update(schema.registrations)
      .set({
        createdAt: new Date(Date.now() - 365 * 86_400_000),
        reservationExpiresAt: new Date(Date.now() - 365 * 86_400_000),
      })
      .where(eq(schema.registrations.id, r.id));

    const { sweepExpiredMemberships } = await import("../src/lib/sweeper");
    await sweepExpiredMemberships();

    const after = await reg(r.id);
    expect(after.status).toBe("pending_payment");
    expect(after.cancelledAt).toBeNull();
    expect((await ledger(r.id)).every((p) => p.status === "pending")).toBe(true);
  });

  it("gives a card checkout no expiry date at all", async () => {
    const r = await openCardCheckout("no-expiry@example.com");
    expect(r.reservationExpiresAt).toBeNull();
  });
});

describe("FALSE NEGATIVE — money that arrives late must still be honoured in full", () => {
  it("settles a payment that lands long after checkout (the PRG-2026-0025 scenario)", async () => {
    const r = await openCardCheckout("late@example.com");
    expect(r.status).toBe("pending_payment");
    expect(r.totalCents).toBe(TICKETS + DONATION);
    expect(r.processingFeeCents).toBe(FEE);

    // Eight hours (or eight days) later, Square takes the money.
    const res = await postWebhook(
      paymentEvent({ paymentId: "sqpay-late", orderId: r.squareOrderId!, amountCents: TICKETS + DONATION + FEE })
    );
    expect(res.status).toBe(200);
    expect(res.json.handled).toBe(true);

    const after = await reg(r.id);
    expect(after.status).toBe("paid");
    expect(after.squarePaymentId).toBe("sqpay-late");

    // The ledger — the thing the Payments page and dashboard actually read —
    // must agree. This is the assertion the incident would have failed.
    const rows = await ledger(r.id);
    expect(rows.map((p) => p.status)).toEqual(["paid", "paid"]); // donation + registration
    expect(rows.reduce((s, p) => s + p.amountCents + p.feeCents, 0)).toBe(TICKETS + DONATION + FEE);
    expect(rows.every((p) => p.squarePaymentId === "sqpay-late")).toBe(true);
    expect(rows.every((p) => p.squareVerifiedAt != null)).toBe(true);
    expect(rows.some((p) => (p.note ?? "").toLowerCase().includes("expired"))).toBe(false);

    // and the buyer actually got their tickets
    expect((await ticketEmails(r.id)).length).toBe(1);
  });

  it("revives the ledger when an admin-cancelled order is paid anyway", async () => {
    // An admin can still cancel by hand, and the Square link may still be open.
    const r = await openCardCheckout("admin-cancelled@example.com");
    await cancelRegistration(r.id, "cancelled");
    expect((await ledger(r.id)).every((p) => p.status === "cancelled")).toBe(true);

    await postWebhook(
      paymentEvent({ paymentId: "sqpay-revive", orderId: r.squareOrderId!, amountCents: TICKETS + DONATION + FEE })
    );

    const after = await reg(r.id);
    expect(after.status).toBe("paid");
    expect(after.cancelledAt).toBeNull();
    // Cancelled ledger rows are revived ONLY because Square confirmed payment.
    expect((await ledger(r.id)).every((p) => p.status === "paid")).toBe(true);
    expect((await ticketEmails(r.id)).length).toBe(1);
  });

  it("a plain settle does NOT revive cancelled rows without confirmation of payment", async () => {
    const r = await openCardCheckout("no-confirm@example.com");
    await cancelRegistration(r.id, "cancelled");
    const { settlePayments } = await import("../src/lib/ledger");
    await settlePayments("registration", r.id, { method: "offline" }); // no `confirmed`
    expect((await ledger(r.id)).every((p) => p.status === "cancelled")).toBe(true);
  });

  it("the buyer's own success page can settle it when the webhook never arrives", async () => {
    const r = await openCardCheckout("success-page@example.com");
    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "lookupSquarePaymentSafe").mockResolvedValue({
      ok: true,
      payment: {
        paymentId: "sqpay-selfserve",
        orderId: r.squareOrderId,
        status: "COMPLETED",
        amountCents: TICKETS + DONATION + FEE,
        createdAt: new Date().toISOString(),
      },
    });

    const { verifyPaymentWithSquare } = await import("../src/app/(public)/checkout/success/actions");
    const out = await verifyPaymentWithSquare(r.confirmationNumber);

    expect(out).toEqual({ paid: true, recovered: true });
    expect((await reg(r.id)).status).toBe("paid");
    expect((await ledger(r.id)).every((p) => p.status === "paid")).toBe(true);
  });

  it("the success page does not invent a payment when Square says no", async () => {
    const r = await openCardCheckout("success-nope@example.com");
    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "lookupSquarePaymentSafe").mockResolvedValue({ ok: true, payment: null });
    const { verifyPaymentWithSquare } = await import("../src/app/(public)/checkout/success/actions");
    expect(await verifyPaymentWithSquare(r.confirmationNumber)).toEqual({ paid: false, recovered: false });
    expect((await reg(r.id)).status).toBe("pending_payment");
  });

  it("treats an unreachable Square as 'unknown', never as 'not paid'", async () => {
    const r = await openCardCheckout("square-down@example.com");
    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "lookupSquarePaymentSafe").mockResolvedValue({ ok: false, error: "ETIMEDOUT" });
    const { verifyPaymentWithSquare } = await import("../src/app/(public)/checkout/success/actions");
    expect(await verifyPaymentWithSquare(r.confirmationNumber)).toEqual({ paid: false, recovered: false });
    const after = await reg(r.id);
    expect(after.status).toBe("pending_payment"); // still open, nothing cancelled
    expect(after.cancelledAt).toBeNull();
  });
});

describe("FALSE NEGATIVE — a webhook that fails must be retried, never swallowed", () => {
  it("leaves the event retryable when handling throws, and succeeds on Square's retry", async () => {
    const r = await openCardCheckout("retry@example.com");
    const checkout = await import("../src/lib/checkout");
    const boom = vi
      .spyOn(checkout, "markRegistrationPaid")
      .mockRejectedValueOnce(new Error("Neon connection dropped mid-write"));

    const body = paymentEvent({
      eventId: "evt-retry",
      paymentId: "sqpay-retry",
      orderId: r.squareOrderId!,
      amountCents: TICKETS + DONATION + FEE,
    });

    const first = await postWebhook(body);
    expect(first.status).toBe(500); // only a non-2xx makes Square retry
    boom.mockRestore();

    const [claim] = await getDb()
      .select()
      .from(schema.processedWebhookEvents)
      .where(eq(schema.processedWebhookEvents.eventId, "evt-retry"));
    expect(claim.status).toBe("failed");
    expect(claim.lastError).toContain("Neon");
    expect(claim.payload).toBeTruthy(); // kept, so it can be replayed by hand

    // Square redelivers the same event_id — it must be re-processed.
    const second = await postWebhook(body);
    expect(second.status).toBe(200);
    expect(second.json.handled).toBe(true);
    expect((await reg(r.id)).status).toBe("paid");
    expect((await ledger(r.id)).every((p) => p.status === "paid")).toBe(true);
  });

  it("still short-circuits a genuine duplicate, sending exactly one tickets email", async () => {
    const r = await openCardCheckout("dupe@example.com");
    const body = paymentEvent({
      eventId: "evt-dupe",
      paymentId: "sqpay-dupe",
      orderId: r.squareOrderId!,
      amountCents: TICKETS + DONATION + FEE,
    });
    expect((await postWebhook(body)).json.handled).toBe(true);
    expect((await postWebhook(body)).json.duplicate).toBe(true);
    expect((await postWebhook(body)).json.duplicate).toBe(true);
    expect((await ticketEmails(r.id)).length).toBe(1);
  });

  it("handles Square's real burst of distinct payment.updated versions idempotently", async () => {
    // The incident's payment produced payment.created + four payment.updated
    // events, each with its own event_id, within six seconds.
    const r = await openCardCheckout("burst@example.com");
    for (const [i, type] of ["payment.created", "payment.updated", "payment.updated", "payment.updated"].entries()) {
      await postWebhook(
        paymentEvent({
          eventId: `evt-burst-${i}`,
          paymentId: "sqpay-burst",
          orderId: r.squareOrderId!,
          amountCents: TICKETS + DONATION + FEE,
          type,
        })
      );
    }
    expect((await reg(r.id)).status).toBe("paid");
    expect((await ticketEmails(r.id)).length).toBe(1);
    expect(await soldCount()).toBeGreaterThan(0);
  });
});

describe("FALSE POSITIVE — nothing is paid without Square's own word for it", () => {
  it("rejects a forged webhook", async () => {
    const r = await openCardCheckout("forged@example.com");
    const res = await postWebhook(
      paymentEvent({ paymentId: "sqpay-forged", orderId: r.squareOrderId!, amountCents: TICKETS + DONATION + FEE }),
      { signature: "bm90LWEtcmVhbC1zaWduYXR1cmU=" }
    );
    expect(res.status).toBe(400);
    expect((await reg(r.id)).status).toBe("pending_payment");
    expect((await ledger(r.id)).every((p) => p.status === "pending")).toBe(true);
  });

  it("rejects a payload tampered with after signing", async () => {
    const r = await openCardCheckout("tampered@example.com");
    const honest = paymentEvent({ paymentId: "sqpay-t", orderId: r.squareOrderId!, amountCents: 100 });
    const sig = signSquareWebhook(JSON.stringify(honest), WEBHOOK_URL);
    const tampered = paymentEvent({
      paymentId: "sqpay-t",
      orderId: r.squareOrderId!,
      amountCents: TICKETS + DONATION + FEE,
    });
    const res = await postWebhook(tampered, { signature: sig });
    expect(res.status).toBe(400);
    expect((await reg(r.id)).status).toBe("pending_payment");
  });

  it("refuses to settle when Square charged less than we billed", async () => {
    const r = await openCardCheckout("short@example.com");
    const res = await postWebhook(
      paymentEvent({ paymentId: "sqpay-short", orderId: r.squareOrderId!, amountCents: 100 })
    );
    expect(res.json.handled).not.toBe(true);
    expect(res.json.mismatch).toBe(true);
    expect(res.json.expected).toBe(TICKETS + DONATION + FEE);
    expect((await reg(r.id)).status).toBe("pending_payment");
    expect((await ticketEmails(r.id)).length).toBe(0);
  });

  it("accepts an overpayment (a tip) rather than blocking the buyer's tickets", async () => {
    const r = await openCardCheckout("tip@example.com");
    const res = await postWebhook(
      paymentEvent({ paymentId: "sqpay-tip", orderId: r.squareOrderId!, amountCents: TICKETS + DONATION + FEE + 500 })
    );
    expect(res.json.handled).toBe(true);
    expect((await reg(r.id)).status).toBe("paid");
  });

  it("ignores every payment status that is not COMPLETED", async () => {
    const r = await openCardCheckout("notcomplete@example.com");
    for (const status of ["APPROVED", "PENDING", "FAILED", "CANCELED"]) {
      const res = await postWebhook(
        paymentEvent({
          eventId: `evt-status-${status}`,
          paymentId: `sqpay-${status}`,
          orderId: r.squareOrderId!,
          status,
          amountCents: TICKETS + DONATION + FEE,
        })
      );
      expect(res.json.handled).not.toBe(true);
    }
    expect((await reg(r.id)).status).toBe("pending_payment");
  });

  it("ignores non-payment events (order.updated, customer.updated)", async () => {
    const r = await openCardCheckout("noise@example.com");
    for (const type of ["order.updated", "order.created", "customer.updated", "order.fulfillment.updated"]) {
      const res = await postWebhook(
        paymentEvent({
          eventId: `evt-noise-${type}`,
          paymentId: "sqpay-noise",
          orderId: r.squareOrderId!,
          amountCents: TICKETS + DONATION + FEE,
          type,
        })
      );
      expect(res.json.handled).not.toBe(true);
    }
    expect((await reg(r.id)).status).toBe("pending_payment");
  });

  it("refuses live mode without a real signing key, instead of using the public test key", async () => {
    const prevMode = process.env.PAYMENTS_MODE;
    const prevKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    process.env.PAYMENTS_MODE = "live";
    delete process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
    try {
      const { verifySquareSignature, signSquareWebhook: sign } = await import("../src/lib/payments/square");
      const body = JSON.stringify({ event_id: "x" });
      // Even a signature that IS valid under the test key must be refused.
      expect(verifySquareSignature(body, sign(body, WEBHOOK_URL), WEBHOOK_URL)).toBe(false);
    } finally {
      process.env.PAYMENTS_MODE = prevMode;
      process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = prevKey;
    }
  });

  it("refuses to boot a production deploy that is not configured for real cards", async () => {
    const { assertPaymentsConfig } = await import("../src/lib/payments/square");
    const prev = { app: process.env.APP_ENV, mode: process.env.PAYMENTS_MODE };
    process.env.APP_ENV = "production";
    process.env.PAYMENTS_MODE = "test";
    try {
      expect(() => assertPaymentsConfig()).toThrow(/refusing to take cards/i);
    } finally {
      process.env.APP_ENV = prev.app;
      process.env.PAYMENTS_MODE = prev.mode;
    }
  });
});

describe("CAPACITY — seats follow the money, not the shopping cart", () => {
  it("takes no seat for an unpaid checkout and one per ticket when it is paid", async () => {
    const before = await soldCount();
    const r = await openCardCheckout("capacity@example.com");
    expect(await soldCount()).toBe(before); // nothing held

    await postWebhook(
      paymentEvent({ paymentId: "sqpay-cap", orderId: r.squareOrderId!, amountCents: TICKETS + DONATION + FEE })
    );
    expect(await soldCount()).toBe(before + 2);
  });

  it("does not double-count when Square redelivers the same payment", async () => {
    const before = await soldCount();
    const r = await openCardCheckout("capacity-dupe@example.com");
    const body = paymentEvent({
      eventId: "evt-cap-dupe",
      paymentId: "sqpay-cap-dupe",
      orderId: r.squareOrderId!,
      amountCents: TICKETS + DONATION + FEE,
    });
    await postWebhook(body);
    await postWebhook(body);
    await postWebhook({ ...body, event_id: "evt-cap-dupe-2" }); // different event, same payment
    expect(await soldCount()).toBe(before + 2);
  });

  it("leaks nothing when an abandoned checkout is cancelled by an admin", async () => {
    const before = await soldCount();
    const r = await openCardCheckout("abandoned@example.com");
    await cancelRegistration(r.id, "cancelled_no_payment");
    expect(await soldCount()).toBe(before); // never took a seat, never gives one back
  });

  it("returns the seats when a PAID order is cancelled", async () => {
    const before = await soldCount();
    const r = await openCardCheckout("refund@example.com");
    await postWebhook(
      paymentEvent({ paymentId: "sqpay-refund", orderId: r.squareOrderId!, amountCents: TICKETS + DONATION + FEE })
    );
    expect(await soldCount()).toBe(before + 2);
    await cancelRegistration(r.id, "cancelled");
    expect(await soldCount()).toBe(before);
  });
});

describe("ORPHANS — money we cannot attribute must be loud, not lost", () => {
  it("records an unmatched completed payment at its real amount", async () => {
    const res = await postWebhook(
      paymentEvent({ paymentId: "sqpay-orphan", orderId: "order-nobody-knows", amountCents: 25000 })
    );
    expect(res.json.orphan).toBe(true);
    const [row] = await getDb()
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.squarePaymentId, "sqpay-orphan"));
    expect(row).toBeTruthy();
    expect(row.status).toBe("pending_verification"); // waiting on a human, not silently "paid"
    expect(row.amountCents).toBe(25000); // used to be hard-coded to 0, i.e. invisible
    expect(row.source).toBe("orphan");
  });
});

describe("RECONCILER — Square audits our books, but a person decides", () => {
  const squarePayment = (orderId: string, paymentId: string, amountCents: number) => ({
    paymentId,
    orderId,
    status: "COMPLETED",
    amountCents,
    createdAt: new Date().toISOString(),
  });

  const openFindingFor = async (ref: string) =>
    (await getDb().select().from(schema.reconciliationFindings)).find(
      (f) => f.reference === ref && f.status === "open"
    );

  it("CHANGES NOTHING on its own, even for a payment Square clearly completed", async () => {
    const r = await openCardCheckout("recon-readonly@example.com"); // webhook never arrived
    const before = await soldCount();
    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "listSquarePayments").mockResolvedValue([
      squarePayment(r.squareOrderId!, "sqpay-readonly", TICKETS + DONATION + FEE),
    ]);

    const { reconcileWithSquare } = await import("../src/lib/payments/reconcile");
    const report = await reconcileWithSquare({ days: 7 });

    expect(report.falseNegatives.some((f) => f.reference === r.confirmationNumber)).toBe(true);
    expect(report.newFindings).toBeGreaterThan(0);
    // The whole point of the redesign: the scan is read-only.
    expect((await reg(r.id)).status).toBe("pending_payment");
    expect((await ledger(r.id)).every((p) => p.status === "pending")).toBe(true);
    expect(await soldCount()).toBe(before);
    expect((await ticketEmails(r.id)).length).toBe(0);
  });

  it("files it as an open question in the review queue", async () => {
    const r = await openCardCheckout("recon-queue@example.com");
    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "listSquarePayments").mockResolvedValue([
      squarePayment(r.squareOrderId!, "sqpay-queue", TICKETS + DONATION + FEE),
    ]);
    const { reconcileWithSquare } = await import("../src/lib/payments/reconcile");
    await reconcileWithSquare({ days: 7 });

    const f = await openFindingFor(r.confirmationNumber);
    expect(f).toBeTruthy();
    expect(f!.kind).toBe("false_negative");
    expect(f!.status).toBe("open");
    expect(f!.squareAmountCents).toBe(TICKETS + DONATION + FEE);
    expect(f!.entityId).toBe(r.id);
  });

  it("does not re-raise the same open question on the next night's scan", async () => {
    const r = await openCardCheckout("recon-dedupe@example.com");
    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "listSquarePayments").mockResolvedValue([
      squarePayment(r.squareOrderId!, "sqpay-dedupe", TICKETS + DONATION + FEE),
    ]);
    const { reconcileWithSquare } = await import("../src/lib/payments/reconcile");

    const first = await reconcileWithSquare({ days: 7 });
    const second = await reconcileWithSquare({ days: 7 });
    const third = await reconcileWithSquare({ days: 7 });

    expect(first.newFindings).toBeGreaterThan(0);
    expect(second.newFindings).toBe(0); // nothing new — so no repeat email
    expect(third.newFindings).toBe(0);
    const all = (await getDb().select().from(schema.reconciliationFindings)).filter(
      (f) => f.reference === r.confirmationNumber
    );
    expect(all).toHaveLength(1);
  });

  it("applies the correction only when an admin approves it", async () => {
    const r = await openCardCheckout("recon-approve@example.com");
    const before = await soldCount();
    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "listSquarePayments").mockResolvedValue([
      squarePayment(r.squareOrderId!, "sqpay-approve", TICKETS + DONATION + FEE),
    ]);
    // Approval re-checks Square at that moment rather than trusting the finding.
    vi.spyOn(square, "lookupSquarePaymentSafe").mockResolvedValue({
      ok: true,
      payment: squarePayment(r.squareOrderId!, "sqpay-approve", TICKETS + DONATION + FEE),
    });

    const { reconcileWithSquare } = await import("../src/lib/payments/reconcile");
    await reconcileWithSquare({ days: 7 });
    const f = await openFindingFor(r.confirmationNumber);

    const { approveFinding } = await import("../src/app/admin/reconciliation/actions");
    const out = await approveFinding(f!.id, "Checked the Square receipt — genuine.");
    expect(out.ok).toBe(true);

    expect((await reg(r.id)).status).toBe("paid");
    expect((await ledger(r.id)).every((p) => p.status === "paid")).toBe(true);
    expect(await soldCount()).toBe(before + 2);
    expect((await ticketEmails(r.id)).length).toBe(1);

    const [after] = await getDb()
      .select()
      .from(schema.reconciliationFindings)
      .where(eq(schema.reconciliationFindings.id, f!.id));
    expect(after.status).toBe("approved");
    expect(after.resolvedBy).toBeTruthy();
    expect(after.resolutionNote).toContain("Square receipt");
  });

  it("writes an audit-log entry naming who approved it", async () => {
    const entries = await getDb().select().from(schema.auditLog);
    const approvals = entries.filter((e) => e.action === "approve_reconciliation");
    expect(approvals.length).toBeGreaterThan(0);
    expect(approvals[approvals.length - 1].userId).toBeTruthy();
  });

  it("refuses to approve if Square no longer shows the payment (refunded since)", async () => {
    const r = await openCardCheckout("recon-refunded@example.com");
    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "listSquarePayments").mockResolvedValue([
      squarePayment(r.squareOrderId!, "sqpay-refunded", TICKETS + DONATION + FEE),
    ]);
    const { reconcileWithSquare } = await import("../src/lib/payments/reconcile");
    await reconcileWithSquare({ days: 7 });
    const f = await openFindingFor(r.confirmationNumber);

    // By the time someone gets to the queue, the payment is gone from Square.
    vi.spyOn(square, "lookupSquarePaymentSafe").mockResolvedValue({ ok: true, payment: null });

    const { approveFinding } = await import("../src/app/admin/reconciliation/actions");
    const out = await approveFinding(f!.id);
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/refunded|no longer/i);
    expect((await reg(r.id)).status).toBe("pending_payment"); // untouched
  });

  it("refuses to approve when Square cannot be reached", async () => {
    const r = await openCardCheckout("recon-down@example.com");
    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "listSquarePayments").mockResolvedValue([
      squarePayment(r.squareOrderId!, "sqpay-down", TICKETS + DONATION + FEE),
    ]);
    const { reconcileWithSquare } = await import("../src/lib/payments/reconcile");
    await reconcileWithSquare({ days: 7 });
    const f = await openFindingFor(r.confirmationNumber);

    vi.spyOn(square, "lookupSquarePaymentSafe").mockResolvedValue({ ok: false, error: "ETIMEDOUT" });
    const { approveFinding } = await import("../src/app/admin/reconciliation/actions");
    const out = await approveFinding(f!.id);
    expect(out.ok).toBe(false);
    expect((await reg(r.id)).status).toBe("pending_payment");
  });

  it("offers no automatic action at all for a suspected false positive", async () => {
    const r = await openCardCheckout("recon-fp@example.com");
    await postWebhook(
      paymentEvent({ paymentId: "sqpay-ghost", orderId: r.squareOrderId!, amountCents: TICKETS + DONATION + FEE })
    );
    expect((await reg(r.id)).status).toBe("paid");

    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "listSquarePayments").mockResolvedValue([]); // Square lists nothing
    const { reconcileWithSquare } = await import("../src/lib/payments/reconcile");
    const report = await reconcileWithSquare({ days: 7 });
    expect(report.falsePositives.some((f) => f.reference === r.confirmationNumber)).toBe(true);

    const f = await openFindingFor(r.confirmationNumber);
    const { approveFinding } = await import("../src/app/admin/reconciliation/actions");
    const out = await approveFinding(f!.id);
    expect(out.ok).toBe(false);
    expect(out.message).toMatch(/no correction/i);
    // Never un-paid. A real customer keeps their real ticket.
    expect((await reg(r.id)).status).toBe("paid");
    expect((await ledger(r.id)).every((p) => p.status === "paid")).toBe(true);
  });

  it("records a dismissal with the reviewer and their reason, changing nothing", async () => {
    const r = await openCardCheckout("recon-dismiss@example.com");
    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "listSquarePayments").mockResolvedValue([
      squarePayment(r.squareOrderId!, "sqpay-dismiss", TICKETS + DONATION + FEE),
    ]);
    const { reconcileWithSquare } = await import("../src/lib/payments/reconcile");
    await reconcileWithSquare({ days: 7 });
    const f = await openFindingFor(r.confirmationNumber);

    const { dismissFinding } = await import("../src/app/admin/reconciliation/actions");
    expect((await dismissFinding(f!.id, "Duplicate of a manual entry — handled in Square.")).ok).toBe(true);

    const [after] = await getDb()
      .select()
      .from(schema.reconciliationFindings)
      .where(eq(schema.reconciliationFindings.id, f!.id));
    expect(after.status).toBe("dismissed");
    expect(after.resolutionNote).toContain("Duplicate");
    expect(after.resolvedBy).toBeTruthy();
    expect((await reg(r.id)).status).toBe("pending_payment"); // nothing changed

    const audits = (await getDb().select().from(schema.auditLog)).filter(
      (e) => e.action === "dismiss_reconciliation"
    );
    expect(audits.length).toBeGreaterThan(0);
  });

  it("cannot be actioned twice", async () => {
    const r = await openCardCheckout("recon-twice@example.com");
    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "listSquarePayments").mockResolvedValue([
      squarePayment(r.squareOrderId!, "sqpay-twice", TICKETS + DONATION + FEE),
    ]);
    vi.spyOn(square, "lookupSquarePaymentSafe").mockResolvedValue({
      ok: true,
      payment: squarePayment(r.squareOrderId!, "sqpay-twice", TICKETS + DONATION + FEE),
    });
    const { reconcileWithSquare } = await import("../src/lib/payments/reconcile");
    await reconcileWithSquare({ days: 7 });
    const f = await openFindingFor(r.confirmationNumber);

    const { approveFinding, dismissFinding } = await import("../src/app/admin/reconciliation/actions");
    expect((await approveFinding(f!.id)).ok).toBe(true);
    expect((await approveFinding(f!.id)).ok).toBe(false);
    expect((await dismissFinding(f!.id)).ok).toBe(false);
  });

  it("flags an amount our books and Square disagree on", async () => {
    const r = await openCardCheckout("recon-amt@example.com");
    await postWebhook(
      paymentEvent({ paymentId: "sqpay-amt", orderId: r.squareOrderId!, amountCents: TICKETS + DONATION + FEE })
    );
    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "listSquarePayments").mockResolvedValue([
      squarePayment(r.squareOrderId!, "sqpay-amt", TICKETS + DONATION), // fee missing
    ]);
    const { reconcileWithSquare } = await import("../src/lib/payments/reconcile");
    const report = await reconcileWithSquare({ days: 7 });
    expect(report.amountMismatches.some((m) => m.reference === r.confirmationNumber)).toBe(true);
  });

  it("reports a Square payment matching nothing at all as an orphan", async () => {
    const square = await import("../src/lib/payments/square");
    vi.spyOn(square, "listSquarePayments").mockResolvedValue([
      squarePayment("order-from-another-system", "sqpay-recon-orphan", 5000),
    ]);
    const { reconcileWithSquare } = await import("../src/lib/payments/reconcile");
    const report = await reconcileWithSquare({ days: 7 });
    expect(report.orphans.some((o) => o.squarePaymentId === "sqpay-recon-orphan")).toBe(true);
  });

  it("records every run so the admin page can say when the books were last proven", async () => {
    const { lastReconciliation } = await import("../src/lib/payments/reconcile");
    const run = await lastReconciliation();
    expect(run).toBeTruthy();
    expect(run!.status).toBe("ok");
    expect(run!.autoSettle).toBe(false); // never, by construction
  });
});

describe("REPAIR — the records already broken by the old sweep", () => {
  it("restores money and seats for an order that was swept and then paid", async () => {
    const db = getDb();
    const before = await soldCount();

    // Reconstruct the exact wreckage PRG-2026-0025 left in the database:
    // registration `paid`, but its ledger rows voided by the sweeper and its
    // seats released. The current code can no longer create this state, so it
    // has to be built by hand.
    const r = await openCardCheckout("wreckage@example.com");
    await cancelRegistration(r.id, "cancelled_no_payment"); // the old sweep
    await db
      .update(schema.payments)
      .set({ note: "Reservation expired without payment" })
      .where(eq(schema.payments.entityId, r.id));
    await db
      .update(schema.registrations)
      .set({ status: "paid", paidAt: new Date(), squarePaymentId: "Nsrs08vLlpAwM5uqbViF6dCrhkOZY" })
      .where(eq(schema.registrations.id, r.id)); // the webhook, arriving later
    // …and the seats the old code took at checkout time and then released:
    await db
      .update(schema.ticketTypes)
      .set({ soldCount: before })
      .where(eq(schema.ticketTypes.id, ticketTypeId));

    expect((await ledger(r.id)).every((p) => p.status === "cancelled")).toBe(true);

    const { runPendingDataMigrations } = await import("../src/lib/data-migrations");
    await runPendingDataMigrations();

    const rows = await ledger(r.id);
    expect(rows.every((p) => p.status === "paid")).toBe(true);
    expect(rows.every((p) => p.cancelledAt === null)).toBe(true);
    expect(rows.reduce((s, p) => s + p.amountCents + p.feeCents, 0)).toBe(TICKETS + DONATION + FEE);
    expect(rows.some((p) => (p.note ?? "").includes("Reservation expired"))).toBe(false);
    expect(await soldCount()).toBe(before + 2); // seats given back
    expect((await reg(r.id)).cancelledAt).toBeNull();
  });

  it("leaves a genuinely cancelled, genuinely unpaid order alone", async () => {
    const db = getDb();
    const r = await openCardCheckout("really-cancelled@example.com");
    await cancelRegistration(r.id, "cancelled_no_payment");

    // Force the repair job to run again over the current data.
    await db.delete(schema.dataMigrations).where(eq(schema.dataMigrations.key, "2026-08-repair-swept-then-paid"));
    const { runPendingDataMigrations } = await import("../src/lib/data-migrations");
    await runPendingDataMigrations();

    expect((await reg(r.id)).status).toBe("cancelled_no_payment");
    expect((await ledger(r.id)).every((p) => p.status === "cancelled")).toBe(true);
  });
});

describe("DONATIONS TAB — a gift given during checkout is a donation, and must look like one", () => {
  const donationRowFor = async (regId: string) =>
    (await getDb().select().from(schema.donations).where(eq(schema.donations.sourceRegistrationId, regId)))[0];

  it("creates a Donations-page row for a gift added during ticket checkout", async () => {
    const r = await openCardCheckout("gift@example.com");
    const d = await donationRowFor(r.id);
    expect(d).toBeTruthy();
    expect(d.amountCents).toBe(DONATION);
    expect(d.donorEmail).toBe("gift@example.com");
    expect(d.confirmationNumber).toMatch(/^DON-/);
    expect(d.status).toBe("pending_payment"); // not yet received — must not read as a gift in hand
    expect(d.notes).toContain(r.confirmationNumber); // traceable back to the ticket order
  });

  it("marks that row received when the payment lands", async () => {
    const r = await openCardCheckout("gift-paid@example.com");
    await postWebhook(
      paymentEvent({ paymentId: "sqpay-gift", orderId: r.squareOrderId!, amountCents: TICKETS + DONATION + FEE })
    );
    const d = await donationRowFor(r.id);
    expect(d.status).toBe("paid");
    expect(d.paidAt).not.toBeNull();
    expect(d.squarePaymentId).toBe("sqpay-gift");
  });

  it("does NOT double-count the gift as money", async () => {
    // The donations row is a view. The ledger is the record. If this ever fails,
    // every income total on the site is overstating donations.
    const r = await openCardCheckout("gift-nodouble@example.com");
    await postWebhook(
      paymentEvent({ paymentId: "sqpay-nodouble", orderId: r.squareOrderId!, amountCents: TICKETS + DONATION + FEE })
    );
    const rows = await ledger(r.id);
    expect(rows.filter((p) => p.kind === "donation")).toHaveLength(1);
    expect(rows.reduce((s, p) => s + p.amountCents + p.feeCents, 0)).toBe(TICKETS + DONATION + FEE);

    const { moneyTotals } = await import("../src/lib/ledger");
    const before = await moneyTotals();
    const d = await donationRowFor(r.id);
    expect(d.amountCents).toBe(DONATION);
    const after = await moneyTotals();
    expect(after.donation.collected).toBe(before.donation.collected); // reading it changes nothing
  });

  it("never lets the webhook match the donation row instead of the registration", async () => {
    // The gift row deliberately carries no Square order id, so there is exactly
    // one thing a payment can resolve to.
    const r = await openCardCheckout("gift-match@example.com");
    const d = await donationRowFor(r.id);
    expect(d.squareOrderId).toBeNull();
  });

  it("follows the registration into cancellation", async () => {
    const r = await openCardCheckout("gift-cancel@example.com");
    await cancelRegistration(r.id, "cancelled_no_payment");
    expect((await donationRowFor(r.id)).status).toBe("cancelled_no_payment");
  });

  it("backfills a row for a historical gift that never had one (Parijat's $150)", async () => {
    const db = getDb();
    // Reproduce the old shape: a paid registration with a donation in the ledger
    // and nothing at all on the Donations page.
    const r = await openCardCheckout("historic-gift@example.com");
    await postWebhook(
      paymentEvent({ paymentId: "sqpay-historic", orderId: r.squareOrderId!, amountCents: TICKETS + DONATION + FEE })
    );
    await db.delete(schema.donations).where(eq(schema.donations.sourceRegistrationId, r.id));
    expect(await donationRowFor(r.id)).toBeUndefined();

    await db
      .delete(schema.dataMigrations)
      .where(eq(schema.dataMigrations.key, "2026-08-backfill-in-checkout-donations"));
    const { runPendingDataMigrations } = await import("../src/lib/data-migrations");
    await runPendingDataMigrations();

    const d = await donationRowFor(r.id);
    expect(d).toBeTruthy();
    expect(d.amountCents).toBe(DONATION);
    expect(d.status).toBe("paid");
    expect(d.donorEmail).toBe("historic-gift@example.com");
    expect(d.notes).toContain("backfilled");

    // and still exactly one ledger row — the backfill must not create money
    expect((await ledger(r.id)).filter((p) => p.kind === "donation")).toHaveLength(1);
  });

  it("leaves standalone donations completely alone", async () => {
    const { createDonation } = await import("../src/lib/donations");
    const res = await createDonation({
      donorName: "Standalone Giver",
      donorEmail: "standalone@example.com",
      amountCents: 5000,
      inHonorOrMemory: "none",
      isAnonymous: false,
      paymentMethod: "square",
    });
    const db = getDb();
    const [d] = await db
      .select()
      .from(schema.donations)
      .where(eq(schema.donations.confirmationNumber, res.confirmationNumber));
    expect(d.sourceRegistrationId).toBeNull();
    expect(d.squareOrderId).toBeTruthy(); // it owns its own payment, unlike a linked gift

    const { runPendingDataMigrations } = await import("../src/lib/data-migrations");
    await db
      .delete(schema.dataMigrations)
      .where(eq(schema.dataMigrations.key, "2026-08-backfill-in-checkout-donations"));
    await runPendingDataMigrations();

    const all = await db.select().from(schema.donations).where(eq(schema.donations.donorEmail, "standalone@example.com"));
    expect(all).toHaveLength(1); // not duplicated by the backfill
  });
});
