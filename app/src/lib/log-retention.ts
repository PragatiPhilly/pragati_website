/**
 * Keep the free-tier database lean by pruning bookkeeping rows past their useful
 * window. The data that matters — registrations, members, tickets, events,
 * donations, magazines — is NEVER touched. Only logs / idempotency records are
 * trimmed. Runs hourly from the sweep cron.
 *
 * Retention windows:
 *   processed_webhook_events  30 days  (idempotency guard; old ones are moot)
 *   email_outbox (sent/failed) 30 days (drained mail; queued rows are kept)
 *   email_log                180 days  (delivery history)
 *   audit_log                365 days  (admin action trail)
 */
import { and, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const DAY = 86_400_000;

export async function pruneOldLogs(): Promise<Record<string, number>> {
  const db = getDb();
  const cutoff = (days: number) => new Date(Date.now() - days * DAY);
  const out: Record<string, number> = {};

  const safe = async (name: string, run: () => Promise<number>) => {
    try {
      out[name] = await run();
    } catch {
      out[name] = -1; // table may not exist yet in a fresh DB — ignore
    }
  };

  await safe("webhookEvents", async () => {
    const r = await db
      .delete(schema.processedWebhookEvents)
      .where(lt(schema.processedWebhookEvents.processedAt, cutoff(30)))
      .returning({ t: schema.processedWebhookEvents.processedAt });
    return r.length;
  });
  await safe("emailOutbox", async () => {
    const r = await db
      .delete(schema.emailOutbox)
      .where(and(inArray(schema.emailOutbox.status, ["sent", "failed"]), lt(schema.emailOutbox.createdAt, cutoff(30))))
      .returning({ t: schema.emailOutbox.createdAt });
    return r.length;
  });
  await safe("emailLog", async () => {
    const r = await db
      .delete(schema.emailLog)
      .where(lt(schema.emailLog.createdAt, cutoff(180)))
      .returning({ t: schema.emailLog.createdAt });
    return r.length;
  });
  await safe("auditLog", async () => {
    const r = await db
      .delete(schema.auditLog)
      .where(lt(schema.auditLog.createdAt, cutoff(365)))
      .returning({ t: schema.auditLog.createdAt });
    return r.length;
  });

  return out;
}
