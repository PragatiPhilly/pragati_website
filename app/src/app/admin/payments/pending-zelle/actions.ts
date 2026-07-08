"use server";

import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { markRegistrationPaid, cancelRegistration } from "@/lib/checkout";
import { markDonationPaid } from "@/lib/donations";
import { eq } from "drizzle-orm";

async function audit(userId: string, action: string, entityType: string, entityId: string) {
  const db = getDb();
  await db.insert(schema.auditLog).values({ userId, action, entityType, entityId });
}

export async function markZellePaidAction(kind: "registration" | "donation", id: string) {
  const admin = await requireAdmin();
  if (kind === "registration") {
    await markRegistrationPaid(id, { method: "zelle", adminUserId: admin.userId });
    await audit(admin.userId, "zelle_mark_paid", "registrations", id);
  } else {
    await markDonationPaid(id, { method: "zelle", adminUserId: admin.userId });
    await audit(admin.userId, "zelle_mark_paid", "donations", id);
  }
  revalidatePath("/admin/payments/pending-zelle");
  revalidatePath("/admin");
}

export async function cancelZelleAction(kind: "registration" | "donation", id: string) {
  const admin = await requireAdmin();
  if (kind === "registration") {
    await cancelRegistration(id, "cancelled_no_payment");
    await audit(admin.userId, "zelle_cancel", "registrations", id);
  } else {
    const db = getDb();
    await db
      .update(schema.donations)
      .set({ status: "cancelled_no_payment", cancelledAt: new Date() })
      .where(eq(schema.donations.id, id));
    await audit(admin.userId, "zelle_cancel", "donations", id);
  }
  revalidatePath("/admin/payments/pending-zelle");
  revalidatePath("/admin");
}
