/** Donation checkout — mirrors the registration rails. */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { nextConfirmationNumber } from "@/lib/confirmation";
import { getConfig } from "@/lib/system-config";
import { createSquarePaymentLink } from "@/lib/payments/square";
import { cardProcessingFeeCents } from "@/lib/pricing";
import { getZelleInstructions, type ZelleInstructions } from "@/lib/payments/zelle";
import { sendMail } from "@/lib/email";
import * as T from "@/lib/email/templates";

export type DonationInput = {
  donorName: string;
  donorEmail: string;
  donorPhone?: string;
  amountCents: number;
  inHonorOrMemory: "none" | "in_honor_of" | "in_memory_of";
  honoreeName?: string;
  honoreeNotifyEmail?: string;
  message?: string;
  isAnonymous: boolean;
  paymentMethod: "square" | "zelle";
  memberId?: string;
};

export type DonationResult =
  | { kind: "square_redirect"; confirmationNumber: string; url: string }
  | { kind: "zelle_instructions"; confirmationNumber: string; zelle: ZelleInstructions };

export async function createDonation(input: DonationInput): Promise<DonationResult> {
  const db = getDb();
  const conf = await nextConfirmationNumber("DON");
  const [don] = await db
    .insert(schema.donations)
    .values({
      confirmationNumber: conf,
      memberId: input.memberId,
      donorName: input.donorName,
      donorEmail: input.donorEmail,
      donorPhone: input.donorPhone,
      amountCents: input.amountCents,
      inHonorOrMemory: input.inHonorOrMemory,
      honoreeName: input.honoreeName,
      honoreeNotifyEmail: input.honoreeNotifyEmail,
      message: input.message,
      isAnonymous: input.isAnonymous,
      paymentMethod: input.paymentMethod,
      status: input.paymentMethod === "zelle" ? "pending_zelle_verification" : "pending_payment",
    })
    .returning();

  if (input.paymentMethod === "square") {
    const link = await createSquarePaymentLink({
      referenceId: don.id,
      confirmationNumber: conf,
      amountCents: input.amountCents + cardProcessingFeeCents(input.amountCents),
      description: `Donation to Pragati — ${conf}`,
    });
    await db.update(schema.donations).set({ squareOrderId: link.squareOrderId }).where(eq(schema.donations.id, don.id));
    return { kind: "square_redirect", confirmationNumber: conf, url: link.url };
  }
  const zelle = await getZelleInstructions(conf, input.amountCents);
  return { kind: "zelle_instructions", confirmationNumber: conf, zelle };
}

export async function markDonationPaid(donationId: string, via: { method: "square" | "zelle"; squarePaymentId?: string; adminUserId?: string }) {
  const db = getDb();
  const [don] = await db.select().from(schema.donations).where(eq(schema.donations.id, donationId));
  if (!don || don.status === "paid") return;
  await db
    .update(schema.donations)
    .set({
      status: "paid",
      paidAt: new Date(),
      squarePaymentId: via.squarePaymentId ?? don.squarePaymentId,
      zelleVerifiedBy: via.method === "zelle" ? via.adminUserId : don.zelleVerifiedBy,
      zelleVerifiedAt: via.method === "zelle" ? new Date() : don.zelleVerifiedAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.donations.id, donationId));

  const [orgName, orgAddress] = await Promise.all([getConfig<string>("org_name"), getConfig<string>("org_address")]);
  const receipt = T.donationReceiptEmail({
    donorName: don.donorName,
    conf: don.confirmationNumber,
    amountCents: don.amountCents,
    honoree: don.honoreeName ?? undefined,
    honorType: don.inHonorOrMemory,
    orgName,
    orgAddress,
  });
  await sendMail({ to: don.donorEmail, ...receipt, template: "donation_receipt", priority: 1 });

  if (don.honoreeNotifyEmail && don.inHonorOrMemory !== "none") {
    await sendMail({
      to: don.honoreeNotifyEmail,
      subject: `A donation was made ${don.inHonorOrMemory === "in_memory_of" ? "in memory of" : "in honor of"} ${don.honoreeName}`,
      text: `Namaskar,\n\n${don.isAnonymous ? "Someone" : don.donorName} has made a donation to ${orgName} ${
        don.inHonorOrMemory === "in_memory_of" ? "in memory of" : "in honor of"
      } ${don.honoreeName}.\n\n${don.message ? `Their message: "${don.message}"\n\n` : ""}With warmth,\n${orgName}`,
      template: "honoree_notify",
    });
  }
}
