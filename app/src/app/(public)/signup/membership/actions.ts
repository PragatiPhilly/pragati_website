"use server";

import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { getDb, schema } from "@/db/client";
import { getConfig } from "@/lib/system-config";
import { createSquarePaymentLink } from "@/lib/payments/square";
import { cardProcessingFeeCents } from "@/lib/pricing";
import { ensureMembershipColumn } from "@/lib/membership-ensure";
import { openPayments, attachSquareOrder } from "@/lib/ledger";

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
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, member.userId));

  // Record the intended dues payment BEFORE sending them to Square. This is the
  // gap that made membership revenue invisible: previously the only trace of a
  // card dues payment was members.square_order_id plus an audit-log blob.
  await openPayments([
    {
      kind: "membership",
      entityId: member.id,
      memberId: member.id,
      payerName: `${member.primaryFirstName} ${member.primaryLastName}`.trim(),
      payerEmail: user?.email ?? "",
      amountCents: price,
      feeCents: cardProcessingFeeCents(price),
      method: "square",
      reference: conf,
      note: "Annual dues — card checkout",
    },
  ]);

  const link = await createSquarePaymentLink({
    referenceId: member.id,
    confirmationNumber: conf,
    amountCents: price + cardProcessingFeeCents(price),
    description: "Pragati Annual Membership",
    redirectPath: `/checkout/success?conf=${encodeURIComponent(conf)}&membership=1`,
  });

  // remember the order id so the Square webhook can match this payment (live Square)
  await ensureMembershipColumn();
  await db.update(schema.members).set({ squareOrderId: link.squareOrderId }).where(eq(schema.members.id, member.id));
  await attachSquareOrder("membership", member.id, link.squareOrderId);

  return { url: link.url };
}

/**
 * "I've sent the Zelle" for membership dues. Previously this flow wrote NOTHING
 * to the database — the member page just showed the Zelle memo and the row sat
 * at pending_payment until a human happened to notice the bank feed. Now it
 * opens a pending_verification ledger row so the dues land in the treasurer's
 * Zelle queue alongside registrations and donations.
 */
export async function declareMembershipZelleSent(): Promise<{ ok?: boolean; error?: string }> {
  const session = await getSession();
  if (!session?.memberId) return { error: "Please sign in first." };

  const db = getDb();
  const [member] = await db.select().from(schema.members).where(eq(schema.members.id, session.memberId));
  if (!member) return { error: "Member record not found." };
  if (member.membershipStatus === "active") return { error: "Your membership is already active." };

  const price = Number(await getConfig<number>("membership_annual_price_cents"));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, member.userId));
  const memo = `MEM ${member.primaryFirstName} ${member.primaryLastName}`.trim();

  await openPayments([
    {
      kind: "membership",
      entityId: member.id,
      memberId: member.id,
      payerName: `${member.primaryFirstName} ${member.primaryLastName}`.trim(),
      payerEmail: user?.email ?? "",
      amountCents: price,
      method: "zelle",
      reference: memo,
      note: "Annual dues — member reported Zelle sent",
    },
  ]);

  return { ok: true };
}
