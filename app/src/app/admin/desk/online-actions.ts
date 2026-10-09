"use server";

/** Desk actions for ONLINE bookings that were never paid (see lib/desk/online.ts). */
import { revalidatePath } from "next/cache";
import { DeskError, requireDesk } from "@/lib/desk/guards";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { settleOnlineBooking, startOnlineCardPayment, type OnlineSettleMethod } from "@/lib/desk/online";

type Result<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

async function run<T>(fn: () => Promise<{ message?: string; data?: T }>): Promise<Result<T>> {
  try {
    await ensureDeskSchema();
    const out = await fn();
    revalidatePath("/admin/desk");
    return { ok: true, ...out };
  } catch (e) {
    if (e instanceof DeskError) return { ok: false, error: e.message };
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    console.error("[desk-online]", msg);
    return { ok: false, error: msg };
  }
}

export async function settleOnlineBookingAction(
  registrationId: string,
  input: { method: OnlineSettleMethod; checkNumber?: string; bank?: string; holder?: { userId: string; displayName: string }; note?: string }
): Promise<Result> {
  return run(async () => {
    const actor = await requireDesk();
    await settleOnlineBooking(registrationId, input, actor);
    return { message: "Paid ✓ — their passes now work at the gate and the tickets email is on its way." };
  });
}

export async function startOnlineCardAction(registrationId: string): Promise<Result<{ url: string; amountCents: number }>> {
  return run(async () => {
    const actor = await requireDesk();
    return { data: await startOnlineCardPayment(registrationId, actor) };
  });
}

/** Same-price changes to one pass: name, veg/non-veg, or a single-day pass moved to another day. */
export async function changeTicketAction(
  ticketId: string,
  patch: { firstName?: string; lastName?: string; foodPref?: "veg" | "non_veg"; toTicketTypeId?: string }
): Promise<Result> {
  return run(async () => {
    const actor = await requireDesk();
    const { changeTicket } = await import("@/lib/desk/changes");
    const summary = await changeTicket(ticketId, patch, actor);
    revalidatePath("/admin/coupons");
    revalidatePath("/admin/kitchen");
    return { message: `${summary}. Their pass QR stays the same — email the passes again if they want the updated copy.` };
  });
}

/** Turn one offline notebook entry into a real walk-in booking (safe to repeat). */
export async function importOfflineEntryAction(
  entry: import("@/lib/desk/offline").OfflineEntry
): Promise<Result<{ conf: string; registrationId: string; notes: string[] }>> {
  return run(async () => {
    const actor = await requireDesk();
    const { importOfflineEntry } = await import("@/lib/desk/offline");
    return { data: await importOfflineEntry(entry, actor) };
  });
}
