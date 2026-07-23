/**
 * Square rail.
 * PAYMENTS_MODE=test → simulated hosted checkout at /pay/square-simulator
 *                      (looks & behaves like Square's redirect flow, sandbox-style)
 * PAYMENTS_MODE=live → real Square Payment Links API (needs SQUARE_* env keys)
 *
 * Webhook: /api/webhooks/square — signature-verified + idempotent in both modes.
 * Spec: 05-payments.md.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { siteUrl } from "@/lib/site-url";

export type PaymentLink = { url: string; squareOrderId: string };

export async function createSquarePaymentLink(p: {
  referenceId: string; // our registration/donation/member id
  confirmationNumber: string;
  amountCents: number;
  description: string;
  redirectPath?: string; // where Square returns the buyer (default: checkout success)
}): Promise<PaymentLink> {
  const mode = process.env.PAYMENTS_MODE ?? "test";

  if (mode === "live") {
    const base =
      process.env.SQUARE_ENV === "production"
        ? "https://connect.squareup.com"
        : "https://connect.squareupsandbox.com";
    const res = await fetch(`${base}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-11-20",
      },
      body: JSON.stringify({
        idempotency_key: p.referenceId,
        quick_pay: {
          name: p.description,
          price_money: { amount: p.amountCents, currency: "USD" },
          location_id: process.env.SQUARE_LOCATION_ID,
        },
        payment_note: p.confirmationNumber,
        checkout_options: {
          redirect_url: siteUrl(p.redirectPath ?? `/checkout/success?conf=${p.confirmationNumber}`),
        },
      }),
    });
    if (!res.ok) throw new Error(`Square API error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { url: data.payment_link.url, squareOrderId: data.payment_link.order_id };
  }

  // test mode: our own simulator page plays the part of Square's hosted checkout
  const orderId = `SIM-ORDER-${p.referenceId.slice(0, 8)}`;
  const url = `/pay/square-simulator?ref=${encodeURIComponent(p.referenceId)}&conf=${encodeURIComponent(
    p.confirmationNumber
  )}&amount=${p.amountCents}&desc=${encodeURIComponent(p.description)}${
    p.redirectPath ? `&redirect=${encodeURIComponent(p.redirectPath)}` : ""
  }`;
  return { url, squareOrderId: orderId };
}

/** Verify the x-square-hmacsha256-signature header. Used in test AND live. */
export function verifySquareSignature(rawBody: string, signature: string | null, notificationUrl: string): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key && (process.env.PAYMENTS_MODE ?? "test") === "live") {
    // Never fall back to the well-known test key in live mode — an attacker
    // could forge "payment completed" webhooks and mint free tickets.
    console.error("SQUARE_WEBHOOK_SIGNATURE_KEY is not set — rejecting webhook.");
    return false;
  }
  const effectiveKey = key ?? "test-signature-key";
  if (!signature) return false;
  const expected = createHmac("sha256", effectiveKey).update(notificationUrl + rawBody).digest("base64");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

/** Helper for the simulator + tests to produce a valid signature. */
export function signSquareWebhook(rawBody: string, notificationUrl: string): string {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY ?? "test-signature-key";
  return createHmac("sha256", key).update(notificationUrl + rawBody).digest("base64");
}
