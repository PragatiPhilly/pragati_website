"use server";

import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import { requireSectionAccess } from "@/lib/auth/access";
import { markHandedOut, undoHandedOut } from "@/lib/coupons/store";

export async function markCouponsGivenAction(registrationIds: string[]): Promise<{ ok: boolean; marked: number }> {
  const user = await requireSectionAccess("coupons");
  const marked = await markHandedOut(registrationIds, { userId: user.userId, name: user.name ?? user.email });
  if (marked.length) {
    await getDb().insert(schema.auditLog).values({
      userId: user.userId,
      action: "update",
      entityType: "coupon_handout",
      changes: { given: marked },
    });
  }
  revalidatePath("/admin/coupons");
  return { ok: true, marked: marked.length };
}

export async function undoCouponsGivenAction(registrationIds: string[]): Promise<{ ok: boolean }> {
  const user = await requireSectionAccess("coupons");
  await undoHandedOut(registrationIds);
  await getDb().insert(schema.auditLog).values({
    userId: user.userId,
    action: "update",
    entityType: "coupon_handout",
    changes: { undone: registrationIds },
  });
  revalidatePath("/admin/coupons");
  return { ok: true };
}
