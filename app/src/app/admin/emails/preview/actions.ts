"use server";

import { getSession } from "@/lib/auth/session";
import { getDb, schema } from "@/db/client";
import { isEmail } from "@/lib/validation";
import { sendMail } from "@/lib/email";
import { buildSampleEmails } from "@/lib/email/samples";

export type TestSendResult = { ok: true; sent: number; to: string } | { ok: false; error: string };

/**
 * Send sample copies of every template to one address so they can be checked in
 * a real inbox (Gmail on a phone especially). Nothing is written to the
 * registrations/donations tables — this only renders templates and sends mail.
 *
 * Sent at priority 1 so the daily budget can't silently defer them, and clearly
 * subject-prefixed so nobody mistakes one for a real receipt.
 */
export async function sendTestEmailsAction(toEmail: string, keys?: string[]): Promise<TestSendResult> {
  const session = await getSession();
  if (!session || session.role !== "super_admin") return { ok: false, error: "Super-admin required." };

  const to = toEmail.trim().toLowerCase();
  if (!isEmail(to)) return { ok: false, error: "Please enter a valid email address." };

  try {
    const all = await buildSampleEmails();
    const chosen = keys?.length ? all.filter((s) => keys.includes(s.key)) : all;
    if (chosen.length === 0) return { ok: false, error: "Nothing selected to send." };

    for (const s of chosen) {
      await sendMail({
        to,
        subject: `[TEST] ${s.subject}`,
        text: `⚠️ This is a TEST email sent from Admin → Email previews. It is not a real receipt.\n\n${s.text}`,
        html: s.html,
        template: `test_${s.key}`,
        priority: 1,
      });
    }

    await getDb()
      .insert(schema.auditLog)
      .values({
        userId: session.userId,
        action: "send_test_emails",
        entityType: "email_log",
        changes: { to, count: chosen.length, keys: chosen.map((c) => c.key) },
      });

    return { ok: true, sent: chosen.length, to };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong sending the test emails." };
  }
}
