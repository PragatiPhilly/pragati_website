"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { lookupSquarePaymentSafe } from "@/lib/payments/square";

/**
 * The buyer is standing in front of us saying "I paid". Ask Square.
 *
 * The success page used to do nothing but re-render every 2 seconds and hope a
 * webhook turned up. That makes the webhook a single point of failure with a
 * human watching it fail. This closes the loop from the buyer's side: if Square
 * has the money, we settle right now, no matter what the webhook did.
 *
 * Read-only from the buyer's perspective — it can only ever move a record
 * towards "paid", and only on Square's own word.
 */
export async function verifyPaymentWithSquare(conf: string): Promise<{ paid: boolean; recovered: boolean }> {
  if (!conf) return { paid: false, recovered: false };
  const db = getDb();

  const [reg] = await db
    .select()
    .from(schema.registrations)
    .where(eq(schema.registrations.confirmationNumber, conf));
  if (reg) {
    if (reg.status === "paid") return { paid: true, recovered: false };
    const check = await lookupSquarePaymentSafe(reg.squareOrderId);
    if (check.ok && check.payment) {
      const { markRegistrationPaid } = await import("@/lib/checkout");
      await markRegistrationPaid(reg.id, {
        method: "square",
        squarePaymentId: check.payment.paymentId,
        confirmed: true,
        squareAmountCents: check.payment.amountCents,
      });
      return { paid: true, recovered: true };
    }
    return { paid: false, recovered: false };
  }

  const [don] = await db.select().from(schema.donations).where(eq(schema.donations.confirmationNumber, conf));
  if (don) {
    if (don.status === "paid") return { paid: true, recovered: false };
    const check = await lookupSquarePaymentSafe(don.squareOrderId);
    if (check.ok && check.payment) {
      const { markDonationPaid } = await import("@/lib/donations");
      await markDonationPaid(don.id, {
        method: "square",
        squarePaymentId: check.payment.paymentId,
        confirmed: true,
        squareAmountCents: check.payment.amountCents,
      });
      return { paid: true, recovered: true };
    }
  }
  return { paid: false, recovered: false };
}
