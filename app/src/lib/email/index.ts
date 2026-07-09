/**
 * Email abstraction with priorities, a daily budget, and an outbox queue.
 *
 * Providers (see providers.ts): Brevo (300/day free) → Resend (100/day free)
 * → console. APP_ENV=test still redirects every recipient to
 * TEST_EMAIL_OVERRIDE. Every actually-sent email lands in email_log.
 *
 * Priorities:
 *   1 CRITICAL   — tickets, receipts, password resets, invites. Always sent
 *                  immediately, even if the daily budget is exhausted.
 *   2 NORMAL     — default. Sent immediately unless the day's budget is down
 *                  to the reserve (kept for priority-1), then queued for the
 *                  next drain / next day.
 *   3 DIGESTABLE — e.g. Zelle treasurer alerts. Always queued; the 15-minute
 *                  drain combines all pending ones sharing a digestKey into
 *                  ONE email (100 registrations ≠ 100 alert emails).
 *
 * Failed sends are queued and retried with backoff — a provider outage delays
 * mail instead of losing it. The drain runs from /api/cron/sweep.
 */
import { and, eq, gte, lte, sql as dsql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensureScanTables } from "@/lib/scans/ensure";
import { deliver } from "./providers";

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
  /** 1 critical (always send now) · 2 normal (default) · 3 digestable (batched) */
  priority?: 1 | 2 | 3;
  /** priority-3 mails sharing a digestKey are combined into one email */
  digestKey?: string;
};

const RESERVE_FOR_CRITICAL = 25; // keep this many sends for priority-1 mail
const MAX_ATTEMPTS = 10;

// ── helpers ─────────────────────────────────────────────────────

function applyTestOverride(mail: Mail): { to: string; subject: string } {
  const isTest = (process.env.APP_ENV ?? "test") === "test";
  const override = process.env.TEST_EMAIL_OVERRIDE;
  return {
    to: isTest && override ? override : mail.to,
    subject: isTest ? `[TEST → ${mail.to}] ${mail.subject}` : mail.subject,
  };
}

/** Emails actually sent in the last 24h — the working "daily" usage number. */
export async function sentToday(): Promise<number> {
  const db = getDb();
  const dayAgo = new Date(Date.now() - 24 * 3600_000);
  const [row] = await db
    .select({ n: dsql<number>`count(*)` })
    .from(schema.emailLog)
    .where(and(eq(schema.emailLog.status, "sent"), gte(schema.emailLog.sentAt, dayAgo)));
  return Number(row?.n ?? 0);
}

async function dailyBudget(): Promise<number> {
  const { getConfig } = await import("@/lib/system-config");
  const v = await getConfig<number | string>("email_daily_budget");
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 280;
}

async function logEmail(
  mail: Mail,
  to: string,
  subject: string,
  r: { ok: boolean; provider: string; messageId?: string; error?: string }
) {
  const db = getDb();
  await db.insert(schema.emailLog).values({
    toEmail: to,
    originalToEmail: mail.to,
    template: mail.template,
    subject,
    bodyText: mail.text,
    status: r.ok ? "sent" : "failed",
    providerMessageId: r.ok ? `${r.provider}${r.messageId ? `:${r.messageId}` : ""}` : undefined,
    error: r.ok ? undefined : r.error,
    relatedRegistrationId: mail.relatedRegistrationId,
    relatedUserId: mail.relatedUserId,
    sentAt: new Date(),
  });
}

async function enqueue(mail: Mail, reason?: string) {
  await ensureScanTables();
  const db = getDb();
  await db.insert(schema.emailOutbox).values({
    priority: mail.priority ?? 2,
    digestKey: mail.digestKey,
    payload: mail as unknown as Record<string, unknown>,
    lastError: reason,
  });
}

// ── the public API (same signature as before) ───────────────────

export async function sendMail(mail: Mail): Promise<void> {
  const priority = mail.priority ?? 2;

  // digestable mail never sends directly — the drain batches it
  if (priority === 3) {
    await enqueue(mail);
    return;
  }

  // budget check: priority 2 yields to the reserve; priority 1 never waits
  if (priority === 2) {
    const [used, budget] = await Promise.all([sentToday(), dailyBudget()]);
    if (used >= budget - RESERVE_FOR_CRITICAL) {
      await enqueue(mail, `deferred: daily send budget reached (${used}/${budget})`);
      return;
    }
  }

  const { to, subject } = applyTestOverride(mail);
  const result = await deliver({ to, subject, text: mail.text, attachments: mail.attachments });
  await logEmail(mail, to, subject, result.ok ? result : { ok: false, provider: result.provider, error: result.error });
  if (!result.ok) {
    await enqueue(mail, result.error); // don't lose it — the outbox retries with backoff
  }
}

// ── outbox drain (called by the 15-min sweep cron) ──────────────

function backoffMinutes(attempts: number): number {
  return Math.min(5 * 2 ** attempts, 240); // 10m, 20m, 40m … cap 4h
}

async function markSent(ids: string[]) {
  const db = getDb();
  await Promise.all(
    ids.map((id) =>
      db.update(schema.emailOutbox).set({ status: "sent", sentAt: new Date() }).where(eq(schema.emailOutbox.id, id))
    )
  );
}

async function markRetry(rows: { id: string; attempts: number }[], error: string) {
  const db = getDb();
  await Promise.all(
    rows.map((r) =>
      db
        .update(schema.emailOutbox)
        .set({
          attempts: r.attempts + 1,
          nextAttemptAt: new Date(Date.now() + backoffMinutes(r.attempts + 1) * 60_000),
          lastError: error,
          status: r.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "queued",
        })
        .where(eq(schema.emailOutbox.id, r.id))
    )
  );
}

export async function drainOutbox(maxSends = 40): Promise<{ sent: number; digests: number; deferred: number }> {
  await ensureScanTables();
  const db = getDb();
  const due = await db
    .select()
    .from(schema.emailOutbox)
    .where(and(eq(schema.emailOutbox.status, "queued"), lte(schema.emailOutbox.nextAttemptAt, new Date())))
    .orderBy(schema.emailOutbox.priority, schema.emailOutbox.createdAt)
    .limit(200);
  if (due.length === 0) return { sent: 0, digests: 0, deferred: 0 };

  const [used, budget] = await Promise.all([sentToday(), dailyBudget()]);
  let remaining = Math.max(0, budget - RESERVE_FOR_CRITICAL - used);
  let sent = 0;
  let digests = 0;
  let deferred = 0;

  const attempt = async (mail: Mail): Promise<{ ok: boolean; error?: string }> => {
    const { to, subject } = applyTestOverride(mail);
    const result = await deliver({ to, subject, text: mail.text, attachments: mail.attachments });
    await logEmail(mail, to, subject, result.ok ? result : { ok: false, provider: result.provider, error: result.error });
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  };

  // 1. digestable mail — one combined email per digestKey, throttled to at
  //    most one alert per `zelle_alert_minutes` (Admin → Settings)
  const { getConfig } = await import("@/lib/system-config");
  const alertMinutes = Number(await getConfig<number | string>("zelle_alert_minutes")) || 5;

  const digestGroups = new Map<string, typeof due>();
  for (const row of due) {
    if (row.priority === 3 && row.digestKey) {
      const arr = digestGroups.get(row.digestKey) ?? [];
      arr.push(row);
      digestGroups.set(row.digestKey, arr);
    }
  }
  for (const [key, rows] of digestGroups) {
    if (sent >= maxSends || remaining <= 0) {
      deferred += rows.length;
      continue;
    }
    // throttle: if an alert with this template went out recently, wait —
    // pending rows keep accumulating and ship as one digest next time
    const template = (rows[0].payload as unknown as Mail).template;
    const [lastSent] = await db
      .select()
      .from(schema.emailLog)
      .where(and(eq(schema.emailLog.template, template), eq(schema.emailLog.status, "sent")))
      .orderBy(dsql`${schema.emailLog.sentAt} DESC`)
      .limit(1);
    if (lastSent?.sentAt && Date.now() - lastSent.sentAt.getTime() < alertMinutes * 60_000) {
      deferred += rows.length;
      continue;
    }
    const mails = rows.map((r) => r.payload as unknown as Mail);
    const combined: Mail =
      mails.length === 1
        ? mails[0]
        : {
            ...mails[0],
            subject: `⏳ ${mails.length} Zelle payments awaiting verification`,
            text:
              `${mails.length} new items since the last digest:\n\n` +
              mails.map((m, i) => `── ${i + 1} of ${mails.length} ──────────\n${m.text}`).join("\n\n"),
            priority: 3,
            digestKey: key,
          };
    const r = await attempt(combined);
    if (r.ok) {
      sent += 1;
      remaining -= 1;
      digests += 1;
      await markSent(rows.map((x) => x.id));
    } else {
      await markRetry(rows, r.error ?? "send failed");
    }
  }

  // 2. retries + deferred normal mail, priority order
  for (const row of due) {
    if (row.priority === 3 && row.digestKey) continue; // handled above
    if (sent >= maxSends) {
      deferred++;
      continue;
    }
    const mail = row.payload as unknown as Mail;
    const isCritical = (mail.priority ?? row.priority) === 1;
    if (!isCritical && remaining <= 0) {
      deferred++;
      continue;
    }
    const r = await attempt(mail);
    if (r.ok) {
      sent += 1;
      if (!isCritical) remaining -= 1;
      await markSent([row.id]);
    } else {
      await markRetry([row], r.error ?? "send failed");
    }
  }

  return { sent, digests, deferred };
}
