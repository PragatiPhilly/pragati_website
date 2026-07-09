/**
 * Email outbox semantics against a real (in-memory) PGlite DB:
 * - digestable mail (Zelle alerts) is queued, then combined into ONE email
 * - critical mail sends immediately even when the daily budget is exhausted
 * - normal mail defers to the outbox when the budget is nearly spent
 * - deferred mail actually goes out on a later drain (the "spill over" ask)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { desc, eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://email-tests";
process.env.APP_ENV = "test";
process.env.TEST_EMAIL_OVERRIDE = "mgmt@example.org";
process.env.EMAIL_PROVIDER = "console"; // console "sends" always succeed

import { getDb, schema } from "../src/db/client";
import { ensureScanTables } from "../src/lib/scans/ensure";
import { sendMail, drainOutbox, sentToday } from "../src/lib/email";

beforeAll(async () => {
  await ensureScanTables();
  const db = getDb();
  const client = (db as unknown as { $client: { exec: (sql: string) => Promise<unknown> } }).$client;
  await client.exec(`
  CREATE TABLE IF NOT EXISTS email_log (id text PRIMARY KEY DEFAULT gen_random_uuid()::text, to_email text NOT NULL, original_to_email text, template text NOT NULL, subject text NOT NULL, body_text text, status text NOT NULL DEFAULT 'queued', provider_message_id text, error text, related_user_id text, related_registration_id text, sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE IF NOT EXISTS system_config (key text PRIMARY KEY, value jsonb, updated_at timestamptz NOT NULL DEFAULT now(), updated_by text);
  `);
});

describe("digestable alerts", () => {
  it("queues instead of sending, then combines into one digest email", async () => {
    const db = getDb();
    for (let i = 1; i <= 3; i++) {
      await sendMail({
        to: "treasurer@example.org",
        subject: `⏳ Zelle pending: PRG-2026-000${i} — $45.00`,
        text: `Registration PRG-2026-000${i} awaits verification.`,
        template: "admin_alert",
        priority: 3,
        digestKey: "zelle-alerts",
      });
    }
    // nothing sent yet — all three are waiting in the outbox
    expect(await sentToday()).toBe(0);
    const queued = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.status, "queued"));
    expect(queued).toHaveLength(3);

    const result = await drainOutbox();
    expect(result.sent).toBe(1); // ONE digest email, not three
    expect(result.digests).toBe(1);

    const [logged] = await db.select().from(schema.emailLog).orderBy(desc(schema.emailLog.createdAt)).limit(1);
    expect(logged.subject).toContain("3 Zelle payments awaiting verification");
    expect(logged.bodyText).toContain("PRG-2026-0001");
    expect(logged.bodyText).toContain("PRG-2026-0003");
    expect(logged.status).toBe("sent");
  });

  it("throttles: alerts arriving right after a digest wait for the next window", async () => {
    const db = getDb();
    // one more claim arrives seconds after the digest above went out
    await sendMail({
      to: "treasurer@example.org",
      subject: "⏳ Zelle pending: PRG-2026-0009 — $60.00",
      text: "Registration PRG-2026-0009 awaits verification.",
      template: "admin_alert",
      priority: 3,
      digestKey: "zelle-alerts",
    });
    const result = await drainOutbox();
    expect(result.sent).toBe(0); // held back — last alert was < zelle_alert_minutes ago
    expect(result.deferred).toBe(1);
    const queued = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.status, "queued"));
    expect(queued).toHaveLength(1); // still safely waiting for the next window

    // fast-forward: pretend the last alert was 10 minutes ago → next drain sends it
    await db
      .update(schema.emailLog)
      .set({ sentAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(schema.emailLog.template, "admin_alert"));
    const next = await drainOutbox();
    expect(next.sent).toBe(1); // the window opened, the held alert went out
  });
});

describe("daily budget", () => {
  it("defers normal mail when the budget is nearly spent, but critical mail still sends", async () => {
    const db = getDb();
    // pretend the day's budget is tiny: 2 sends, reserve is 25 → normal mail must defer
    await db.insert(schema.systemConfig).values({ key: "email_daily_budget", value: 2 });

    await sendMail({ to: "someone@example.org", subject: "Newsletter-ish", text: "hello", template: "misc" }); // priority 2
    const queuedNormal = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.status, "queued"));
    expect(queuedNormal.length).toBe(1); // deferred, not sent
    expect(queuedNormal[0].lastError).toContain("daily send budget");

    const before = await sentToday();
    await sendMail({ to: "buyer@example.org", subject: "Your tickets 🎟", text: "QR inside", template: "ticket", priority: 1 });
    expect(await sentToday()).toBe(before + 1); // critical ignored the budget

    // deferred normal mail is NOT lost: raise the budget (a new day) and drain
    await db.update(schema.systemConfig).set({ value: 500 }).where(eq(schema.systemConfig.key, "email_daily_budget"));
    const drained = await drainOutbox();
    expect(drained.sent).toBeGreaterThanOrEqual(1);
    const still = await db.select().from(schema.emailOutbox).where(eq(schema.emailOutbox.status, "queued"));
    expect(still).toHaveLength(0); // spill-over delivered
  });
});
