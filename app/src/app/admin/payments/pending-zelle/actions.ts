"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { markRegistrationPaid, cancelRegistration } from "@/lib/checkout";
import { markDonationPaid } from "@/lib/donations";
import { activateMembershipPaid } from "@/lib/membership";
import { voidPayments, OUTSTANDING } from "@/lib/ledger";
import { ensurePaymentsTable } from "@/lib/ledger-ensure";

export type ZelleKind = "registration" | "donation" | "membership";

async function audit(userId: string, action: string, entityType: string, entityId: string) {
  const db = getDb();
  await db.insert(schema.auditLog).values({ userId, action, entityType, entityId });
}

/**
 * Confirm a Zelle payment. Guarded: these actions take an id from the client, so
 * they verify the row is actually awaiting verification first — otherwise a
 * stale tab or a hand-crafted request could re-settle or wipe a completed payment.
 */
export async function markZellePaidAction(kind: ZelleKind, id: string) {
  const admin = await requireAdmin();
  const db = getDb();

  if (kind === "registration") {
    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, id));
    if (!reg || reg.status !== "pending_zelle_verification") return;
    await markRegistrationPaid(id, { method: "zelle", adminUserId: admin.userId });
    await audit(admin.userId, "zelle_mark_paid", "registrations", id);
  } else if (kind === "donation") {
    const [don] = await db.select().from(schema.donations).where(eq(schema.donations.id, id));
    if (!don || don.status !== "pending_zelle_verification") return;
    await markDonationPaid(id, { method: "zelle", adminUserId: admin.userId });
    await audit(admin.userId, "zelle_mark_paid", "donations", id);
  } else {
    const [member] = await db.select().from(schema.members).where(eq(schema.members.id, id));
    if (!member || member.membershipStatus === "active") return;
    await activateMembershipPaid(id, { method: "zelle", verifiedBy: admin.userId });
    await audit(admin.userId, "zelle_mark_paid", "members", id);
  }

  revalidatePath("/admin/payments/pending-zelle");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/members");
  revalidatePath("/admin");
}

/** The money never arrived. Never touches an already-settled row. */
export async function cancelZelleAction(kind: ZelleKind, id: string) {
  const admin = await requireAdmin();
  const db = getDb();

  if (kind === "registration") {
    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, id));
    if (!reg || reg.status !== "pending_zelle_verification") return;
    await cancelRegistration(id, "cancelled_no_payment");
    await audit(admin.userId, "zelle_cancel", "registrations", id);
  } else if (kind === "donation") {
    const [don] = await db.select().from(schema.donations).where(eq(schema.donations.id, id));
    if (!don || don.status !== "pending_zelle_verification") return;
    await db
      .update(schema.donations)
      .set({ status: "cancelled_no_payment", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.donations.id, id));
    await voidPayments(id, "Zelle never arrived");
    await audit(admin.userId, "zelle_cancel", "donations", id);
  } else {
    // Membership dues: drop the expected payment but leave the member row as
    // pending_payment — they're still on the roster, they just haven't paid.
    await ensurePaymentsTable();
    const open = await db
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.kind, "membership"),
          eq(schema.payments.entityId, id),
          inArray(schema.payments.status, OUTSTANDING)
        )
      );
    if (open.length === 0) return;
    await voidPayments(id, "Zelle never arrived");
    await audit(admin.userId, "zelle_cancel", "members", id);
  }

  revalidatePath("/admin/payments/pending-zelle");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/members");
  revalidatePath("/admin");
}
