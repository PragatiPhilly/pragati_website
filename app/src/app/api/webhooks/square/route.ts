/**
 * Square webhook — the SOURCE OF TRUTH for card payments.
 * Signature-verified + idempotent (processed_webhook_events).
 * The test-mode simulator posts the same shape with a valid signature,
 * so this exact code path is exercised end-to-end before going live.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { verifySquareSignature } from "@/lib/payments/square";
import { siteUrl } from "@/lib/site-url";
import { markRegistrationPaid } from "@/lib/checkout";
import { markDonationPaid } from "@/lib/donations";
import { activateMembershipPaid } from "@/lib/membership";
import { ensureMembershipColumn } from "@/lib/membership-ensure";

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
    data?: { object?: { payment?: { id?: string; status?: string; order_id?: string; reference_id?: string } } };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const eventId = payload.event_id;
  if (!eventId) return NextResponse.json({ error: "Missing event_id" }, { status: 400 });

  const db = getDb();
  // idempotency
  const inserted = await db
    .insert(schema.processedWebhookEvents)
    .values({ eventId, provider: "square" })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const payment = payload.data?.object?.payment;
  if (payload.type === "payment.updated" && payment?.status === "COMPLETED") {
    // match by reference_id (simulator) or square order id (live)
    const refId = payment.reference_id;
    const orderId = payment.order_id;
    // The members table predates the card-dues feature; ensure the columns exist
    // BEFORE any branch queries them (the reference_id branch used to skip this
    // and would 500 on an older database instead of falling through).
    await ensureMembershipColumn();

    const settle = async (kind: "registration" | "donation" | "membership", id: string) => {
      if (kind === "registration") await markRegistrationPaid(id, { method: "square", squarePaymentId: payment.id });
      else if (kind === "donation") await markDonationPaid(id, { method: "square", squarePaymentId: payment.id });
      else await activateMembershipPaid(id, { method: "square", squarePaymentId: payment.id });
    };

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
    if (match) {
      await settle(match.kind, match.id);
      return NextResponse.json({ ok: true, handled: true, kind: match.kind });
    }

    // Money arrived that we can't attribute to anything. Previously this
    // returned 200 with handled:false and vanished — Square marks the webhook
    // delivered and nobody ever finds out. Record it and shout.
    await recordOrphanPayment(payment);
    return NextResponse.json({ ok: true, handled: false, orphan: true });
  }

  return NextResponse.json({ ok: true, ignored: payload.type });
}

/**
 * A completed Square payment whose reference_id and order_id match no
 * registration, donation or member. Lands in the Payments log as an unattributed
 * entry so the treasurer can reconcile it by hand, and alerts the admins.
 */
async function recordOrphanPayment(payment: { id?: string; order_id?: string; reference_id?: string }) {
  try {
    const { openPayments } = await import("@/lib/ledger");
    await openPayments([
      {
        kind: "donation", // unattributed money is booked as a gift until reconciled
        entityId: payment.id ?? payment.order_id ?? "unknown",
        payerName: "Unknown (unmatched Square payment)",
        payerEmail: "",
        amountCents: 0,
        method: "square",
        status: "pending_verification",
        squarePaymentId: payment.id ?? null,
        squareOrderId: payment.order_id ?? null,
        reference: payment.reference_id ?? null,
        source: "orphan",
        keepZero: true, // amount is unknown until a human reconciles it
        note: "Square reported a completed payment we could not match to a registration, donation or member. Reconcile manually.",
      },
    ]);
  } catch {
    /* never fail the webhook on bookkeeping */
  }
  try {
    const { sendMail } = await import("@/lib/email");
    const { getConfig } = await import("@/lib/system-config");
    const to = await getConfig<string>("treasurer_notification_email");
    if (!to) return;
    const lines = [
      `Payment id: ${payment.id ?? "—"}`,
      `Order id: ${payment.order_id ?? "—"}`,
      `Reference: ${payment.reference_id ?? "—"}`,
    ];
    await sendMail({
      to,
      subject: "⚠️ Unmatched Square payment needs reconciling",
      text: `Square reported a COMPLETED payment we could not attribute to any registration, donation or member.\n\n${lines.join("\n")}\n\nIt is sitting in the Payments log as an unattributed entry: ${siteUrl("/admin/payments")}`,
      html: `<p>Square reported a <strong>COMPLETED</strong> payment we could not attribute to any registration, donation or member.</p><p>${lines.join("<br>")}</p><p>It is sitting in the Payments log as an unattributed entry: <a href="${siteUrl("/admin/payments")}">open the Payments log</a>.</p>`,
      template: "admin_alert",
      priority: 1,
    });
  } catch {
    /* alerting is best-effort */
  }
}
