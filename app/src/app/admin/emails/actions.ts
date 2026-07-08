"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { sendMail } from "@/lib/email";

/**
 * Retry a failed (or lost) email — re-sends the logged copy to the ORIGINAL
 * recipient. Fail-safe for Resend outages: once the provider is back, admins
 * clear the failures from the Email log without touching code.
 * (Attachments aren't stored in the log, so a retried backup email is sent
 * fresh from Admin → Registrations → "Email backup now" instead.)
 */
export async function resendEmailAction(emailLogId: string): Promise<{ ok: boolean; note: string }> {
  const s = await getSession();
  if (!s || !["admin", "super_admin"].includes(s.role)) throw new Error("UNAUTHORIZED");

  const db = getDb();
  const [entry] = await db.select().from(schema.emailLog).where(eq(schema.emailLog.id, emailLogId));
  if (!entry) return { ok: false, note: "Log entry not found." };
  if (entry.template === "registration_backup") {
    return { ok: false, note: "Backups can't be retried from the log (attachment isn't stored) — use “Email backup now” on the Registrations page." };
  }
  if (!entry.bodyText) return { ok: false, note: "This entry has no stored body to resend." };

  await sendMail({
    to: entry.originalToEmail ?? entry.toEmail,
    subject: entry.subject.replace(/^\[TEST → .*?\] /, ""),
    text: entry.bodyText,
    template: entry.template,
    relatedRegistrationId: entry.relatedRegistrationId ?? undefined,
    relatedUserId: entry.relatedUserId ?? undefined,
  });

  await db.insert(schema.auditLog).values({
    userId: s.userId,
    action: "email_resent",
    entityType: "email_log",
    entityId: emailLogId,
  });
  revalidatePath("/admin/emails");
  return { ok: true, note: "Re-sent — a new entry appears at the top of the log." };
}
