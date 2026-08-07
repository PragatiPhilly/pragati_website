"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { getConfig } from "@/lib/system-config";
import { activateMembershipPaid } from "@/lib/membership";
import { openPayments, voidPayments, OUTSTANDING, type PaymentMethod } from "@/lib/ledger";
import { ensurePaymentsTable } from "@/lib/ledger-ensure";

export type MemberActionState = { error?: string; ok?: boolean } | undefined;

/**
 * Activate a membership against a REAL payment record.
 *
 * The old one-click "Activate ✓" flipped the status with no amount, no method
 * and no reference, so there was no way after the fact to tell a verified $35
 * Zelle from a misclick — and membership revenue never reached any report.
 * Activation now always produces a `payments` row.
 */
export async function activateMemberAction(_p: MemberActionState, formData: FormData): Promise<MemberActionState> {
  const admin = await requireAdmin();
  const memberId = String(formData.get("memberId") ?? "");
  const method = String(formData.get("method") ?? "zelle") as PaymentMethod;
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const amountDollars = Number(String(formData.get("amount") ?? "").trim());

  if (!memberId) return { error: "Missing member." };
  if (!["zelle", "offline", "square", "comped"].includes(method)) return { error: "Pick how the dues were paid." };
  if (!Number.isFinite(amountDollars) || amountDollars < 0) return { error: "Enter a valid amount." };
  const amountCents = Math.round(amountDollars * 100);
  if (method !== "comped" && amountCents === 0) {
    return { error: "Amount can't be $0 — choose “Comped” if this membership is free." };
  }

  const db = getDb();
  const [member] = await db.select().from(schema.members).where(eq(schema.members.id, memberId));
  if (!member) return { error: "Member record not found." };
  if (member.membershipStatus === "active") return { error: "This membership is already active." };

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, member.userId));

  // Reuse any dues row the member already opened (card checkout they abandoned,
  // or a Zelle they told us about) rather than double-counting the revenue.
  await ensurePaymentsTable();
  const [open] = await db
    .select()
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.kind, "membership"),
        eq(schema.payments.entityId, memberId),
        inArray(schema.payments.status, OUTSTANDING)
      )
    );

  if (open) {
    await db
      .update(schema.payments)
      .set({ amountCents, method, reference, updatedAt: new Date() })
      .where(eq(schema.payments.id, open.id));
  } else {
    await openPayments([
      {
        kind: "membership",
        entityId: memberId,
        memberId,
        payerName: `${member.primaryFirstName} ${member.primaryLastName}`.trim(),
        payerEmail: user?.email ?? "",
        amountCents,
        method,
        reference,
        verifiedBy: admin.userId,
        note: "Annual dues — verified by admin",
      },
    ]);
  }

  // Settles the ledger row, sets the expiry + member number, sends the welcome email.
  await activateMembershipPaid(memberId, { method, verifiedBy: admin.userId, reference: reference ?? undefined });

  revalidatePath("/admin/members");
  revalidatePath("/admin/payments");
  revalidatePath("/admin");
  return { ok: true };
}

/** Mark a member inactive (lapsed, refunded, or entered in error). Leaves settled payments alone. */
export async function deactivateMemberAction(memberId: string) {
  const admin = await requireAdmin();
  const db = getDb();
  const [member] = await db.select().from(schema.members).where(eq(schema.members.id, memberId));
  if (!member || member.membershipStatus === "inactive") return;

  await db
    .update(schema.members)
    .set({ membershipStatus: "inactive", updatedAt: new Date() })
    .where(eq(schema.members.id, memberId));

  // Any dues we were still waiting on are moot now.
  await voidPayments(memberId, "Member marked inactive");

  await db.insert(schema.auditLog).values({
    userId: admin.userId,
    action: "update",
    entityType: "members",
    entityId: memberId,
    changes: { membershipStatus: { from: member.membershipStatus, to: "inactive" } },
  });

  revalidatePath("/admin/members");
  revalidatePath("/admin");
}

/** Prefill for the activate form. */
export async function getMembershipPrice(): Promise<number> {
  return Number(await getConfig<number>("membership_annual_price_cents"));
}
