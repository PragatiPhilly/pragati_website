"use server";

import { requireSectionAccess } from "@/lib/auth/access";
import { getActiveEvent } from "@/lib/queries/events";
import { sendDaySummary } from "@/lib/reports/day-summary";

export async function emailSummaryNowAction(dayKey: string): Promise<{ ok: boolean; message: string }> {
  await requireSectionAccess("live");
  const event = await getActiveEvent();
  if (!event) return { ok: false, message: "No active event." };
  const r = await sendDaySummary(event, dayKey);
  return r.sentTo.length
    ? { ok: true, message: `Sent to ${r.sentTo.join(", ")}` }
    : { ok: false, message: "No recipient set — add one in Settings → Emails (Nightly Pujo-day summary)." };
}
