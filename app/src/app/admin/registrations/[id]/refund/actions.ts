"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { cancelAndRefund, RefundError, type RefundMethod } from "@/lib/refunds";

export async function cancelAndRefundAction(
  registrationId: string,
  input: { ticketIds: string[]; refundCents: number; method: RefundMethod; note: string }
): Promise<{ ok: boolean; message: string }> {
  const admin = await requireAdmin();
  try {
    const r = await cancelAndRefund(registrationId, input, admin);
    revalidatePath("/admin/registrations");
    revalidatePath(`/admin/registrations/${registrationId}/refund`);
    return {
      ok: true,
      message: `Done — ${r.voided} pass${r.voided === 1 ? "" : "es"} cancelled, $${(r.refundCents / 100).toFixed(2)} refund recorded.`,
    };
  } catch (e) {
    if (e instanceof RefundError) return { ok: false, message: e.message };
    console.error("[refund]", e);
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong." };
  }
}
