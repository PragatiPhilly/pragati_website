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
import { markRegistrationPaid } from "@/lib/checkout";
import { markDonationPaid } from "@/lib/donations";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-square-hmacsha256-signature");
  const notificationUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/square`;

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

    let handled = false;
    if (refId) {
      const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, refId));
      if (reg) {
        await markRegistrationPaid(reg.id, { method: "square", squarePaymentId: payment.id });
        handled = true;
      } else {
        const [don] = await db.select().from(schema.donations).where(eq(schema.donations.id, refId));
        if (don) {
          await markDonationPaid(don.id, { method: "square", squarePaymentId: payment.id });
          handled = true;
        }
      }
    }
    if (!handled && orderId) {
      const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.squareOrderId, orderId));
      if (reg) {
        await markRegistrationPaid(reg.id, { method: "square", squarePaymentId: payment.id });
        handled = true;
      } else {
        const [don] = await db.select().from(schema.donations).where(eq(schema.donations.squareOrderId, orderId));
        if (don) {
          await markDonationPaid(don.id, { method: "square", squarePaymentId: payment.id });
          handled = true;
        }
      }
    }
    return NextResponse.json({ ok: true, handled });
  }

  return NextResponse.json({ ok: true, ignored: payload.type });
}
