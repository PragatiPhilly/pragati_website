"use server";

/**
 * TEST MODE: fires a Square-shaped `payment.updated` webhook at our own
 * endpoint with a valid HMAC signature — identical to what production
 * Square would send. The webhook does the actual work.
 */
import { signSquareWebhook } from "@/lib/payments/square";
import { siteUrl } from "@/lib/site-url";

export async function simulateSquarePayment(referenceId: string) {
  if ((process.env.PAYMENTS_MODE ?? "test") !== "test") throw new Error("Simulator disabled outside test mode");

  const body = JSON.stringify({
    event_id: `sim-${crypto.randomUUID()}`,
    type: "payment.updated",
    data: {
      object: {
        payment: {
          id: `SIM-PAY-${referenceId.slice(0, 8)}`,
          status: "COMPLETED",
          order_id: `SIM-ORDER-${referenceId.slice(0, 8)}`,
          reference_id: referenceId,
        },
      },
    },
  });

  const url = siteUrl("/api/webhooks/square");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-square-hmacsha256-signature": signSquareWebhook(body, url),
    },
    body,
  });
  if (!res.ok) throw new Error(`Webhook failed: ${res.status}`);
}
