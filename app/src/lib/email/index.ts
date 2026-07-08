/**
 * Email abstraction.
 * - EMAIL_PROVIDER=console → logs to server console (dev/test default)
 * - EMAIL_PROVIDER=resend  → real sending via Resend API
 * - APP_ENV=test           → ALL recipients redirected to TEST_EMAIL_OVERRIDE
 * Every email is recorded in email_log either way.
 */
import { getDb, schema } from "@/db/client";

export type MailAttachment = {
  filename: string;
  /** base64-encoded file content */
  content: string;
};

export type Mail = {
  to: string;
  subject: string;
  text: string;
  template: string;
  relatedRegistrationId?: string;
  relatedUserId?: string;
  attachments?: MailAttachment[];
};

export async function sendMail(mail: Mail): Promise<void> {
  const db = getDb();
  const isTest = (process.env.APP_ENV ?? "test") === "test";
  const override = process.env.TEST_EMAIL_OVERRIDE;
  const to = isTest && override ? override : mail.to;
  const subject = isTest ? `[TEST → ${mail.to}] ${mail.subject}` : mail.subject;

  let status = "sent";
  let providerMessageId: string | undefined;
  let error: string | undefined;

  const provider = process.env.EMAIL_PROVIDER ?? "console";
  if (provider === "resend" && process.env.RESEND_API_KEY) {
    try {
      const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          subject,
          text: mail.text,
          ...(mail.attachments?.length ? { attachments: mail.attachments } : {}),
        }),
      });
      if (res.ok) {
        providerMessageId = (await res.json()).id;
      } else {
        status = "failed";
        error = `Resend ${res.status}: ${await res.text()}`;
      }
    } catch (e) {
      status = "failed";
      error = String(e);
    }
  } else {
    // console provider
    const att = mail.attachments?.length
      ? `\n[attachments: ${mail.attachments.map((a) => `${a.filename} (${Math.round(a.content.length * 0.75)} bytes)`).join(", ")}]`
      : "";
    console.log(`\n━━━ 📧 EMAIL [${mail.template}] ━━━\nTo: ${to}\nSubject: ${subject}\n\n${mail.text}${att}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  }

  await db.insert(schema.emailLog).values({
    toEmail: to,
    originalToEmail: mail.to,
    template: mail.template,
    subject,
    bodyText: mail.text,
    status,
    providerMessageId,
    error,
    relatedRegistrationId: mail.relatedRegistrationId,
    relatedUserId: mail.relatedUserId,
    sentAt: new Date(),
  });
}
