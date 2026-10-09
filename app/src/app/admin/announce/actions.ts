"use server";

import { getDb, schema } from "@/db/client";
import { requireSectionAccess } from "@/lib/auth/access";
import { getActiveEvent } from "@/lib/queries/events";
import { audienceFor, renderAnnouncement } from "@/lib/announce";

function check(subject: string, message: string): string | null {
  if (subject.trim().length < 3) return "Write a subject.";
  if (message.trim().length < 5) return "Write the message.";
  if (subject.length > 150) return "Keep the subject under 150 characters.";
  if (message.length > 5000) return "Keep the message under 5,000 characters.";
  return null;
}

/** Send ONE copy to yourself, to see exactly what families will get. */
export async function sendTestAnnouncementAction(subject: string, message: string): Promise<{ ok: boolean; message: string }> {
  const s = await requireSectionAccess("announce");
  const bad = check(subject, message);
  if (bad) return { ok: false, message: bad };
  const { text, html } = await renderAnnouncement(subject.trim(), message);
  const { sendMail } = await import("@/lib/email");
  await sendMail({ to: s.email, subject: `[TEST] ${subject.trim()}`, text, html, template: "announcement_test", priority: 1 });
  return { ok: true, message: `Test sent to ${s.email}.` };
}

/** Queue the email for everyone coming on `dayKey`. `confirmCount` must match — a typed safety check. */
export async function sendAnnouncementAction(
  dayKey: string,
  subject: string,
  message: string,
  confirmCount: number
): Promise<{ ok: boolean; message: string }> {
  const s = await requireSectionAccess("announce");
  const bad = check(subject, message);
  if (bad) return { ok: false, message: bad };
  const event = await getActiveEvent();
  if (!event) return { ok: false, message: "No active event." };
  const aud = await audienceFor(event, dayKey);
  if (aud.emails.length === 0) return { ok: false, message: "Nobody to send to for that day." };
  if (confirmCount !== aud.emails.length)
    return { ok: false, message: `The number you typed doesn't match — it should be ${aud.emails.length}.` };

  const { text, html } = await renderAnnouncement(subject.trim(), message);
  const { queueMail, drainOutbox } = await import("@/lib/email");
  for (const r of aud.emails) {
    await queueMail({ to: r.email, subject: subject.trim(), text, html, template: "announcement", priority: 2 });
  }
  await getDb().insert(schema.auditLog).values({
    userId: s.userId,
    action: "announcement_sent",
    entityType: "event",
    entityId: event.id,
    changes: { day: dayKey, subject: subject.trim(), recipients: aud.emails.length },
  });
  // Start sending now; the 15-minute sweep finishes the rest within the daily budget.
  const r = await drainOutbox(40).catch(() => ({ sent: 0, deferred: 0, digests: 0 }));
  const left = Math.max(0, aud.emails.length - r.sent);
  return {
    ok: true,
    message:
      `Queued for ${aud.emails.length} families. ${r.sent} sent right away` +
      (left ? `; the other ${left} go out over the next few 15-minute rounds (the daily email budget protects ticket emails).` : "."),
  };
}
