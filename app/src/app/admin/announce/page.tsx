/** Email everyone coming on a Pujo day — see lib/announce.ts. */
import { requireSectionAccess } from "@/lib/auth/access";
import { getActiveEvent } from "@/lib/queries/events";
import { audienceFor } from "@/lib/announce";
import { getConfig } from "@/lib/system-config";
import { sentToday } from "@/lib/email";
import type { EventDayLite } from "@/lib/checkin/daily";
import AnnounceForm from "./AnnounceForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Email attendees" };

export default async function AnnouncePage() {
  await requireSectionAccess("announce");
  const event = await getActiveEvent();
  if (!event) return <p style={{ color: "var(--ink-soft)" }}>No active event.</p>;
  const days = (event.days as EventDayLite[] | null) ?? [];
  const options = [];
  for (const d of days) {
    const a = await audienceFor(event, d.key);
    options.push({ key: d.key, label: `Everyone coming ${(d.label ?? d.key).split(",")[0]}`, count: a.emails.length, noEmail: a.noEmail });
  }
  const all = await audienceFor(event, "all");
  options.push({ key: "all", label: "Everyone booked for any day", count: all.emails.length, noEmail: all.noEmail });
  const budget = Number(await getConfig<number | string>("email_daily_budget")) || 280;
  const used = await sentToday().catch(() => 0);

  return (
    <div className="max-w-2xl">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Email attendees</h1>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        One email to every family with a pass for a day — parking, timing changes, reminders. Sent to the person who booked (one email per
        address). Emails used in the last 24 hours: {used} of {budget}.
      </p>
      <AnnounceForm options={options} budgetLeft={Math.max(0, budget - 25 - used)} />
    </div>
  );
}
