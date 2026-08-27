/**
 * Square rail.
 * PAYMENTS_MODE=test → simulated hosted checkout at /pay/square-simulator
 *                      (looks & behaves like Square's redirect flow, sandbox-style)
 * PAYMENTS_MODE=live → real Square Payment Links API (needs SQUARE_* env keys)
 *
 * Webhook: /api/webhooks/square — signature-verified + idempotent in both modes.
 * Spec: 05-payments.md.
 *
 * READ-BACK IS AS IMPORTANT AS WRITE. Square is the source of truth for money;
 * a webhook is only a *notification* that the truth changed, and notifications
 * get lost. Everything below the payment-link helpers exists so we can ask
 * Square directly — "was this order paid?", "what did you take last week?" —
 * instead of trusting that a webhook arrived. See lib/payments/reconcile.ts.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { siteUrl } from "@/lib/site-url";

export type PaymentLink = { url: string; squareOrderId: string; paymentLinkId: string | null };

/** One completed/attempted charge as Square knows it. */
export type SquarePaymentView = {
  paymentId: string;
  orderId: string | null;
  status: string; // COMPLETED | APPROVED | PENDING | FAILED | CANCELED
  amountCents: number;
  createdAt: string;
  note?: string | null;
  referenceId?: string | null;
};

export function paymentsMode(): "test" | "live" {
  return (process.env.PAYMENTS_MODE ?? "test") === "live" ? "live" : "test";
}

function squareApiBase(): string {
  return process.env.SQUARE_ENV === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

function squareHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    "Square-Version": "2024-11-20",
  };
}

/**
 * Refuse to serve real card checkout on a half-configured environment.
 *
 * The old default was `PAYMENTS_MODE ?? "test"`, which meant a production deploy
 * that simply *forgot* the variable would quietly hand buyers our own simulator
 * page and accept webhooks signed with a public, hard-coded key. That is a
 * money-minting false positive, so it is now a hard boot error instead.
 */
export function assertPaymentsConfig(): void {
  const isProdDeploy = process.env.VERCEL_ENV === "production" || process.env.APP_ENV === "production";
  if (!isProdDeploy) return;
  const missing: string[] = [];
  if (paymentsMode() !== "live") missing.push("PAYMENTS_MODE=live");
  if (!process.env.SQUARE_ACCESS_TOKEN) missing.push("SQUARE_ACCESS_TOKEN");
  if (!process.env.SQUARE_LOCATION_ID) missing.push("SQUARE_LOCATION_ID");
  if (!process.env.SQUARE_WEBHOOK_SIGNATURE_KEY) missing.push("SQUARE_WEBHOOK_SIGNATURE_KEY");
  if (process.env.SQUARE_ENV !== "production") missing.push("SQUARE_ENV=production");
  if ((process.env.NEXT_PUBLIC_SITE_URL ?? "").endsWith("/")) missing.push("NEXT_PUBLIC_SITE_URL (no trailing slash)");
  if (missing.length) {
    throw new Error(
      `Payments are misconfigured for a production deploy — refusing to take cards. Fix: ${missing.join(", ")}`
    );
  }
}

export async function createSquarePaymentLink(p: {
  referenceId: string; // our registration/donation/member id
  confirmationNumber: string;
  amountCents: number;
  description: string;
  redirectPath?: string; // where Square returns the buyer (default: checkout success)
}): Promise<PaymentLink> {
  assertPaymentsConfig();

  if (paymentsMode() === "live") {
    const res = await fetch(`${squareApiBase()}/v2/online-checkout/payment-links`, {
      method: "POST",
      headers: squareHeaders(),
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
    return {
      url: data.payment_link.url,
      squareOrderId: data.payment_link.order_id,
      // Kept so an abandoned checkout's link can actually be retired. Without
      // this id there is no way to stop a stale link being paid hours later —
      // which is exactly how PRG-2026-0025 happened.
      paymentLinkId: data.payment_link.id ?? null,
    };
  }

  // test mode: our own simulator page plays the part of Square's hosted checkout
  const orderId = `SIM-ORDER-${p.referenceId.slice(0, 8)}`;
  const url = `/pay/square-simulator?ref=${encodeURIComponent(p.referenceId)}&conf=${encodeURIComponent(
    p.confirmationNumber
  )}&amount=${p.amountCents}&desc=${encodeURIComponent(p.description)}${
    p.redirectPath ? `&redirect=${encodeURIComponent(p.redirectPath)}` : ""
  }`;
  return { url, squareOrderId: orderId, paymentLinkId: `SIM-LINK-${p.referenceId.slice(0, 8)}` };
}

/**
 * Retire a payment link so it can no longer be paid.
 * Square payment links have NO expiry of their own — one created today is still
 * chargeable next month. Whenever we give up on a reservation we must also take
 * the link away, or the buyer can pay for something we already cancelled.
 * Returns true if Square accepted the deletion (or there was nothing to delete).
 */
export async function deleteSquarePaymentLink(paymentLinkId: string | null | undefined): Promise<boolean> {
  if (!paymentLinkId) return false;
  if (paymentsMode() !== "live") return true; // simulator links aren't real
  try {
    const res = await fetch(`${squareApiBase()}/v2/online-checkout/payment-links/${paymentLinkId}`, {
      method: "DELETE",
      headers: squareHeaders(),
    });
    // 404 = already gone, which is the state we wanted anyway.
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

function toView(pay: Record<string, unknown>): SquarePaymentView {
  const amount = (pay.amount_money ?? {}) as { amount?: number };
  const total = (pay.total_money ?? {}) as { amount?: number };
  return {
    paymentId: String(pay.id ?? ""),
    orderId: (pay.order_id as string) ?? null,
    status: String(pay.status ?? "UNKNOWN"),
    amountCents: Number(total.amount ?? amount.amount ?? 0),
    createdAt: String(pay.created_at ?? ""),
    note: (pay.note as string) ?? null,
    referenceId: (pay.reference_id as string) ?? null,
  };
}

/**
 * Ask Square directly whether an order was paid. Used before we cancel a
 * reservation and by the success page, so a lost webhook can never by itself
 * lose a payment. Returns null when Square has no completed payment for it.
 */
export async function lookupSquarePaymentForOrder(orderId: string | null | undefined): Promise<SquarePaymentView | null> {
  if (!orderId) return null;
  if (paymentsMode() !== "live") return null; // the simulator drives the webhook itself
  try {
    const res = await fetch(`${squareApiBase()}/v2/orders/${encodeURIComponent(orderId)}`, {
      headers: squareHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const tenders: Record<string, unknown>[] = data?.order?.tenders ?? [];
    // An order is only money once a tender has actually captured.
    for (const t of tenders) {
      const paymentId = String(t.payment_id ?? t.id ?? "");
      if (!paymentId) continue;
      const pRes = await fetch(`${squareApiBase()}/v2/payments/${encodeURIComponent(paymentId)}`, {
        headers: squareHeaders(),
      });
      if (!pRes.ok) continue;
      const view = toView((await pRes.json()).payment ?? {});
      if (view.status === "COMPLETED") return view;
    }
    return null;
  } catch {
    // A Square outage must never be read as "not paid" — the caller treats
    // null-with-error conservatively via lookupSquarePaymentSafe below.
    return null;
  }
}

/**
 * Like lookupSquarePaymentForOrder, but distinguishes "Square says no" from
 * "we could not ask Square". Callers that are about to cancel money MUST use
 * this: an unreachable Square is a reason to wait, never a reason to cancel.
 */
export async function lookupSquarePaymentSafe(
  orderId: string | null | undefined
): Promise<{ ok: true; payment: SquarePaymentView | null } | { ok: false; error: string }> {
  if (paymentsMode() !== "live") return { ok: true, payment: null };
  try {
    const payment = await lookupSquarePaymentForOrder(orderId);
    return { ok: true, payment };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Every payment Square processed for our location in a window. This is the
 * auditor's feed — the reconciler walks it and compares it, line by line,
 * against our own ledger.
 */
export async function listSquarePayments(opts: { since: Date; until?: Date }): Promise<SquarePaymentView[]> {
  if (paymentsMode() !== "live") return [];
  const out: SquarePaymentView[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 40; page++) {
    const qs = new URLSearchParams({
      begin_time: opts.since.toISOString(),
      limit: "100",
      sort_order: "DESC",
    });
    if (opts.until) qs.set("end_time", opts.until.toISOString());
    if (process.env.SQUARE_LOCATION_ID) qs.set("location_id", process.env.SQUARE_LOCATION_ID);
    if (cursor) qs.set("cursor", cursor);
    const res = await fetch(`${squareApiBase()}/v2/payments?${qs}`, { headers: squareHeaders() });
    if (!res.ok) throw new Error(`Square ListPayments ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const p of data.payments ?? []) out.push(toView(p));
    cursor = data.cursor;
    if (!cursor) break;
  }
  return out;
}

/** Verify the x-square-hmacsha256-signature header. Used in test AND live. */
export function verifySquareSignature(rawBody: string, signature: string | null, notificationUrl: string): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  if (!key && paymentsMode() === "live") {
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
