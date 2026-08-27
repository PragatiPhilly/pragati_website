/**
 * Square webhook — the fastest way we learn about a card payment, but NOT the
 * only one and no longer the sole source of truth. Square itself is; this
 * endpoint is a notification that Square's truth changed, and notifications get
 * lost. The sweeper (before it cancels anything) and the nightly reconciler both
 * read back from Square, so a webhook that never arrives costs us minutes of
 * latency instead of a whole payment.
 *
 * Three properties this handler must have, each learned the hard way:
 *
 *  1. SIGNATURE-VERIFIED — nothing is booked as paid on an unsigned request.
 *  2. AMOUNT-VERIFIED    — Square's figure must match what we charged, or we
 *                          alert a human instead of issuing tickets.
 *  3. RETRYABLE          — the de-dup row is CLAIMED before the work and only
 *                          confirmed after it succeeds. The old code wrote the
 *                          row first and never revisited it, so a delivery that
 *                          crashed mid-way was thereafter treated as "already
 *                          handled" and Square's retry got a cheerful 200. That
 *                          turns one transient database blip into a permanently
 *                          lost payment.
 *
 * The test-mode simulator posts the same shape with a valid signature, so this
 * exact code path is exercised end-to-end before going live.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { verifySquareSignature } from "@/lib/payments/square";
import { siteUrl } from "@/lib/site-url";
import * as checkout from "@/lib/checkout";
import * as donations from "@/lib/donations";
import * as membership from "@/lib/membership";
import { ensureMembershipColumn } from "@/lib/membership-ensure";
import { ensurePaymentIntegritySchema } from "@/lib/payments/ensure";
import { expectedTotalCents } from "@/lib/ledger";
import { alertAmountMismatch, alertOrphanPayment, alertWebhookFailure } from "@/lib/payments/alerts";

/** A claim older than this is assumed dead (the instance holding it died mid-write). */
const CLAIM_STALE_MS = 5 * 60_000;

type SquarePayment = {
  id?: string;
  status?: string;
  order_id?: string;
  reference_id?: string;
  amount_money?: { amount?: number };
  total_money?: { amount?: number };
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-square-hmacsha256-signature");
  const notificationUrl = siteUrl("/api/webhooks/square");

  if (!verifySquareSignature(rawBody, signature, notificationUrl)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  let payload: {
    event_id?: string;
    type?: string;
    data?: { object?: { payment?: SquarePayment } };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const eventId = payload.event_id;
  if (!eventId) return NextResponse.json({ error: "Missing event_id" }, { status: 400 });

  const db = getDb();
  await ensurePaymentIntegritySchema();
  const payment = payload.data?.object?.payment;

  // ── claim the event ────────────────────────────────────────────────────
  // Insert a `processing` claim. If a row already exists we only refuse the
  // delivery when that row says the work genuinely finished.
  const claimed = await db
    .insert(schema.processedWebhookEvents)
    .values({
      eventId,
      provider: "square",
      status: "processing",
      attempts: 1,
      eventType: payload.type ?? null,
      squarePaymentId: payment?.id ?? null,
      payload: payload as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning();

  let attempts = 1;
  if (claimed.length === 0) {
    const [existing] = await db
      .select()
      .from(schema.processedWebhookEvents)
      .where(eq(schema.processedWebhookEvents.eventId, eventId));

    if (existing?.status === "done") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    // Still 'processing' and recently claimed → another instance has it right now.
    if (existing?.status === "processing" && Date.now() - new Date(existing.claimedAt).getTime() < CLAIM_STALE_MS) {
      return NextResponse.json({ ok: true, inFlight: true });
    }
    // Failed, or a stale claim from an instance that died: take it over.
    const retaken = await db
      .update(schema.processedWebhookEvents)
      .set({
        status: "processing",
        attempts: sql`${schema.processedWebhookEvents.attempts} + 1`,
        claimedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.processedWebhookEvents.eventId, eventId),
          existing?.status === "processing"
            ? lt(schema.processedWebhookEvents.claimedAt, new Date(Date.now() - CLAIM_STALE_MS))
            : eq(schema.processedWebhookEvents.status, existing?.status ?? "failed")
        )
      )
      .returning();
    if (retaken.length === 0) return NextResponse.json({ ok: true, inFlight: true });
    attempts = retaken[0].attempts;
  }

  const finish = async (result: Record<string, unknown>) => {
    await db
      .update(schema.processedWebhookEvents)
      .set({ status: "done", processedAt: new Date(), updatedAt: new Date(), lastError: null })
      .where(eq(schema.processedWebhookEvents.eventId, eventId));
    return NextResponse.json({ ok: true, ...result });
  };

  const fail = async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    // Leave the row RETRYABLE. Square retries on any non-2xx, and the next
    // delivery of this same event_id will take the claim over and try again.
    await db
      .update(schema.processedWebhookEvents)
      .set({ status: "failed", lastError: message.slice(0, 2000), updatedAt: new Date() })
      .where(eq(schema.processedWebhookEvents.eventId, eventId))
      .catch(() => {});
    await alertWebhookFailure(eventId, attempts, message);
    console.error(`[square-webhook] ${eventId} attempt ${attempts} failed:`, message);
    return NextResponse.json({ ok: false, error: "Processing failed — please retry" }, { status: 500 });
  };

  try {
    if (payload.type !== "payment.updated" || payment?.status !== "COMPLETED") {
      return await finish({ ignored: payload.type, paymentStatus: payment?.status });
    }

    const refId = payment.reference_id;
    const orderId = payment.order_id;
    const squareCents = Number(payment.total_money?.amount ?? payment.amount_money?.amount ?? 0);

    // The members table predates the card-dues feature; ensure the columns exist
    // BEFORE any branch queries them (the reference_id branch used to skip this
    // and would 500 on an older database instead of falling through).
    await ensureMembershipColumn();

    /** Which table does this id belong to? Checked in a fixed order — ids are UUIDs, so collisions aren't a real risk. */
    const locate = async (
      value: string,
      by: "id" | "orderId"
    ): Promise<{ kind: "registration" | "donation" | "membership"; id: string } | null> => {
      const [reg] = await db
        .select()
        .from(schema.registrations)
        .where(by === "id" ? eq(schema.registrations.id, value) : eq(schema.registrations.squareOrderId, value));
      if (reg) return { kind: "registration", id: reg.id };
      const [don] = await db
        .select()
        .from(schema.donations)
        .where(by === "id" ? eq(schema.donations.id, value) : eq(schema.donations.squareOrderId, value));
      if (don) return { kind: "donation", id: don.id };
      const [mem] = await db
        .select()
        .from(schema.members)
        .where(by === "id" ? eq(schema.members.id, value) : eq(schema.members.squareOrderId, value));
      if (mem) return { kind: "membership", id: mem.id };
      return null;
    };

    const match = (refId ? await locate(refId, "id") : null) ?? (orderId ? await locate(orderId, "orderId") : null);

    if (!match) {
      // Money arrived that we can't attribute to anything. Previously this
      // returned 200 with handled:false and vanished — Square marks the webhook
      // delivered and nobody ever finds out. Record it and shout.
      await recordOrphanPayment(payment, squareCents);
      return await finish({ handled: false, orphan: true });
    }

    // ── amount verification ───────────────────────────────────────────────
    // Booking a payment as complete without checking WHAT was paid is how a
    // partial or wrong-order payment becomes a false positive. A shortfall of a
    // few cents is rounding; anything more is a human's problem, not ours.
    const expected = await expectedTotalCents(match.id);
    if (expected > 0 && squareCents > 0 && squareCents + 2 < expected) {
      await alertAmountMismatch({
        reference: match.id,
        paymentId: payment.id,
        expectedCents: expected,
        squareCents,
      });
      return await finish({ handled: false, mismatch: true, expected, received: squareCents });
    }

    if (match.kind === "registration") {
      await checkout.markRegistrationPaid(match.id, {
        method: "square",
        squarePaymentId: payment.id,
        confirmed: true,
        squareAmountCents: squareCents || null,
      });
    } else if (match.kind === "donation") {
      await donations.markDonationPaid(match.id, {
        method: "square",
        squarePaymentId: payment.id,
        confirmed: true,
        squareAmountCents: squareCents || null,
      });
    } else {
      await membership.activateMembershipPaid(match.id, {
        method: "square",
        squarePaymentId: payment.id,
        confirmed: true,
        squareAmountCents: squareCents || null,
      });
    }
    return await finish({ handled: true, kind: match.kind });
  } catch (err) {
    return await fail(err);
  }
}

/**
 * A completed Square payment whose reference_id and order_id match no
 * registration, donation or member. Lands in the Payments log as an unattributed
 * entry so the treasurer can reconcile it by hand, and alerts the admins.
 */
async function recordOrphanPayment(payment: SquarePayment, amountCents: number) {
  try {
    const { openPayments } = await import("@/lib/ledger");
    await openPayments([
      {
        kind: "donation", // unattributed money is booked as a gift until reconciled
        entityId: payment.id ?? payment.order_id ?? "unknown",
        payerName: "Unknown (unmatched Square payment)",
        payerEmail: "",
        // Record what Square says it took. This used to be hard-coded to 0,
        // which made an orphan invisible in every total on the dashboard.
        amountCents: amountCents || 0,
        method: "square",
        status: "pending_verification",
        squarePaymentId: payment.id ?? null,
        squareOrderId: payment.order_id ?? null,
        reference: payment.reference_id ?? null,
        source: "orphan",
        keepZero: true,
        note: "Square reported a completed payment we could not match to a registration, donation or member. Reconcile manually.",
      },
    ]);
  } catch {
    /* never fail the webhook on bookkeeping */
  }
  await alertOrphanPayment({
    paymentId: payment.id,
    orderId: payment.order_id,
    referenceId: payment.reference_id,
    amountCents,
  });
}
