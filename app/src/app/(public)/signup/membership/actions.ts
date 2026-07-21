"use server";

import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDb, schema } from "@/db/client";
import { getConfig } from "@/lib/system-config";
import { createSquarePaymentLink } from "@/lib/payments/square";

/**
 * Start a card checkout for annual membership dues. Uses the same Square rail
 * (and test-mode simulator) as event tickets; the webhook activates the member
 * on payment via activateMembershipPaid(). Returns a URL for the client to
 * redirect to.
 */
export async function startMembershipCardCheckout(): Promise<{ url?: string; error?: string }> {
  const session = await getSession();
  if (!session?.memberId) return { error: "Please sign in first." };

  const db = getDb();
  const [member] = await db.select().from(schema.members).where(eq(schema.members.id, session.memberId));
  if (!member) return { error: "Member record not found." };
  if (member.membershipStatus === "active") return { error: "Your membership is already active." };

  const price = Number(await getConfig<number>("membership_annual_price_cents"));
  const conf = `MEM-${member.id.slice(0, 6).toUpperCase()}`;

  const link = await createSquarePaymentLink({
    referenceId: member.id,
    confirmationNumber: conf,
    amountCents: price,
    description: "Pragati Annual Membership",
    redirectPath: `/checkout/success?conf=${encodeURIComponent(conf)}&membership=1`,
  });

  return { url: link.url };
}
