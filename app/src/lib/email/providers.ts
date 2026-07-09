/**
 * Email delivery providers. sendMail() tries them in order until one works:
 *
 *   BREVO_API_KEY set   → Brevo first  (free tier: 300/day — the workhorse)
 *   RESEND_API_KEY set  → Resend next  (free tier: 100/day — automatic fallback)
 *   neither / EMAIL_PROVIDER=console → console (dev: logs instead of sending)
 *
 * From-address: EMAIL_FROM, falling back to RESEND_FROM_EMAIL. For Brevo the
 * address must be a verified sender in the Brevo dashboard.
 */
import type { MailAttachment } from "./index";

export type OutboundMail = {
  to: string;
  subject: string;
  text: string;
  attachments?: MailAttachment[];
};

export type ProviderResult =
  | { ok: true; provider: string; messageId?: string }
  | { ok: false; provider: string; error: string };

function fromAddress(): { name: string; email: string; raw: string } {
  const raw = process.env.EMAIL_FROM ?? process.env.RESEND_FROM_EMAIL ?? "Pragati <onboarding@resend.dev>";
  const m = raw.match(/^\s*(.*?)\s*<\s*(.+?)\s*>\s*$/);
  if (m) return { name: m[1] || "Pragati", email: m[2], raw };
  return { name: "Pragati", email: raw.trim(), raw };
}

async function sendViaBrevo(mail: OutboundMail): Promise<ProviderResult> {
  const from = fromAddress();
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": process.env.BREVO_API_KEY!,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: from.name, email: from.email },
        to: [{ email: mail.to }],
        subject: mail.subject,
        textContent: mail.text,
        ...(mail.attachments?.length
          ? { attachment: mail.attachments.map((a) => ({ name: a.filename, content: a.content })) }
          : {}),
      }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { messageId?: string };
      return { ok: true, provider: "brevo", messageId: data.messageId };
    }
    return { ok: false, provider: "brevo", error: `Brevo ${res.status}: ${(await res.text()).slice(0, 300)}` };
  } catch (e) {
    return { ok: false, provider: "brevo", error: `Brevo: ${String(e).slice(0, 300)}` };
  }
}

async function sendViaResend(mail: OutboundMail): Promise<ProviderResult> {
  const from = fromAddress();
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: from.raw,
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        ...(mail.attachments?.length ? { attachments: mail.attachments } : {}),
      }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { id?: string };
      return { ok: true, provider: "resend", messageId: data.id };
    }
    return { ok: false, provider: "resend", error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
  } catch (e) {
    return { ok: false, provider: "resend", error: `Resend: ${String(e).slice(0, 300)}` };
  }
}

function sendViaConsole(mail: OutboundMail): ProviderResult {
  const att = mail.attachments?.length
    ? `\n[attachments: ${mail.attachments.map((a) => `${a.filename} (${Math.round(a.content.length * 0.75)} bytes)`).join(", ")}]`
    : "";
  console.log(
    `\n━━━ 📧 EMAIL ━━━\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}${att}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
  );
  return { ok: true, provider: "console" };
}

/** Try each configured provider in order; first success wins. */
export async function deliver(mail: OutboundMail): Promise<ProviderResult> {
  // EMAIL_PROVIDER=console forces logging-only, even if API keys are present
  if ((process.env.EMAIL_PROVIDER ?? "console") === "console") {
    return sendViaConsole(mail);
  }
  const attempts: ProviderResult[] = [];
  if (process.env.BREVO_API_KEY) {
    const r = await sendViaBrevo(mail);
    if (r.ok) return r;
    attempts.push(r);
  }
  if (process.env.RESEND_API_KEY) {
    const r = await sendViaResend(mail);
    if (r.ok) return r;
    attempts.push(r);
  }
  if (attempts.length === 0) return sendViaConsole(mail); // no keys configured at all
  return {
    ok: false,
    provider: attempts.map((a) => a.provider).join("+"),
    error: attempts.map((a) => (a.ok ? "" : a.error)).join(" | "),
  };
}
