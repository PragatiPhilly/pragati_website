/**
 * Event-day reporting: the day summary (dashboard + nightly email), the
 * once-a-night send, and "Email attendees" audience + its typed confirmation.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://event-day-reports";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.TEST_EMAIL_OVERRIDE = "sayantankundu93@gmail.com";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

vi.mock("../src/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/auth/session")>();
  return { ...actual, getSession: async () => ({ userId: "u-super", email: "super@pragati.test", role: "super_admin" }) };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));

import { getDb, schema } from "../src/db/client";
import { createTestSchema } from "./helpers/schema";
import { nyYmd, recordCheckin } from "../src/lib/checkin/daily";
import { buildDaySummary, maybeSendNightlySummary, summaryEmail } from "../src/lib/reports/day-summary";
import { audienceFor } from "../src/lib/announce";
import { sendAnnouncementAction } from "../src/app/admin/announce/actions";
import { setConfig } from "../src/lib/system-config";

const ymd = (o: number) => nyYmd(new Date(Date.now() + o * 86_400_000));
const DAYS = [
  { key: "fri", date: ymd(0), label: "Friday" },
  { key: "sat", date: ymd(1), label: "Saturday" },
];
let event: { id: string; name: string; days: unknown };

beforeAll(async () => {
  await createTestSchema();
  const db = getDb();
  // The shared helper creates an older email_outbox shape; the app's own
  // ensure (lib/scans/ensure.ts) is what production uses — use that here.
  const client = (db as unknown as { $client: { exec: (sql: string) => Promise<unknown> } }).$client;
  await client.exec("DROP TABLE IF EXISTS email_outbox;");
  const { ensureScanTables } = await import("../src/lib/scans/ensure");
  await ensureScanTables();
  await db.insert(schema.users).values({ id: "u-super", email: "super@pragati.test", passwordHash: "x", role: "super_admin" });
  const [ev] = await db.insert(schema.events).values({ slug: "rep", name: "Rep", startsAt: new Date(), endsAt: new Date(), status: "published", days: DAYS }).returning();
  event = ev;
  await setConfig("active_event_slug", "rep");
  const [both, satOnly] = await db
    .insert(schema.ticketTypes)
    .values([
      { eventId: ev.id, name: "Both", ageBand: "adult", dayKeys: ["fri", "sat"], withFood: true, priceMemberCents: 1, priceNonmemberCents: 1 },
      { eventId: ev.id, name: "Sat", ageBand: "adult", dayKeys: ["sat"], withFood: true, priceMemberCents: 1, priceNonmemberCents: 1 },
    ])
    .returning();
  const reg = async (conf: string, email: string, status: string, extra: Record<string, unknown> = {}) =>
    (
      await db
        .insert(schema.registrations)
        .values({ confirmationNumber: conf, eventId: ev.id, buyerEmail: email, buyerName: conf, subtotalCents: 0, totalCents: 5000, paymentMethod: "zelle", status, paidAt: status === "paid" ? new Date() : null, ...extra })
        .returning()
    )[0];
  const a = await reg("A", "a@x.com", "paid");
  const b = await reg("B", "b@x.com", "paid");
  const c = await reg("C", "c@x.com", "pending_payment");
  const w = await reg("W", "", "paid", { source: "desk", deskState: "closed" });
  const tix = (r: string, tt: string, day: string, n: string) =>
    db.insert(schema.tickets).values({ registrationId: r, ticketTypeId: tt, attendeeFirstName: n, foodPref: "non_veg", dayKey: day, qrCode: `q-${n}` }).returning();
  const [ta] = await tix(a.id, both.id, "all", "a1");
  await tix(b.id, satOnly.id, "sat", "b1");
  await tix(c.id, satOnly.id, "sat", "c1");
  await tix(w.id, both.id, "all", "w1");
  await recordCheckin(ta.id, DAYS[0], "u-super");
  await db.insert(schema.payments).values([
    { kind: "registration", entityId: a.id, payerName: "A", payerEmail: "a@x.com", amountCents: 5000, method: "zelle", status: "paid", paidAt: new Date() },
    { kind: "registration", entityId: w.id, payerName: "W", payerEmail: "", amountCents: 3000, method: "cash", status: "paid", paidAt: new Date(), source: "desk", custody: "in_drawer" },
  ]);
});

describe("day summary", () => {
  it("ER-1 counts who's in, walk-ins, and money by method for today", async () => {
    const s = (await buildDaySummary(event))!;
    expect(s.day.key).toBe("fri");
    expect(s.attendance).toEqual({ expected: 2, inside: 1 }); // a1 + w1 cover Friday; a1 is in
    expect(s.walkIns.bookings).toBe(1);
    expect(s.money.totalCents).toBe(8000);
    expect(s.money.rows.find((r) => r.label === "Cash")?.deskCents).toBe(3000);
    expect(s.money.rows.find((r) => r.label === "Zelle")?.onlineCents).toBe(5000);
    expect(s.custody.find((c) => c.label === "In the cash box")?.amountCents).toBe(3000);
    expect(s.open.unpaidOnline).toBe(1);
    expect(summaryEmail(s).subject).toContain("1 in");
  });

  it("ER-2 the nightly email goes once, only after 11 PM New York", async () => {
    const at = (h: number) => {
      // an instant whose New York hour is h, today
      for (let m = 0; m < 48 * 60; m += 30) {
        const d = new Date(Date.now() - 24 * 3600_000 + m * 60_000);
        const hh = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false }).format(d));
        if (hh === h && nyYmd(d) === ymd(0)) return d;
      }
      throw new Error("no instant");
    };
    expect(await maybeSendNightlySummary(at(20))).toBeNull();
    expect(await maybeSendNightlySummary(at(23))).toMatch(/^sent fri/);
    expect(await maybeSendNightlySummary(at(23))).toBeNull(); // already sent today
  });
});

describe("email attendees", () => {
  it("ER-3 audience = buyers with a pass that day, one per email, walk-ins without email counted", async () => {
    const fri = await audienceFor(event, "fri");
    expect(fri.emails.map((e) => e.email)).toEqual(["a@x.com"]);
    expect(fri.noEmail).toBe(1);
    const sat = await audienceFor(event, "sat");
    expect(sat.emails.map((e) => e.email).sort()).toEqual(["a@x.com", "b@x.com"]); // C unpaid → not included
  });

  it("ER-4 sending needs the typed count to match, then queues one email per family", async () => {
    const wrong = await sendAnnouncementAction("sat", "Parking update", "Use lot C please.", 5);
    expect(wrong.ok).toBe(false);
    const ok = await sendAnnouncementAction("sat", "Parking update", "Use lot C please.", 2);
    expect(ok.ok).toBe(true);
    const out = await getDb().select().from(schema.emailOutbox);
    const mine = out.filter((o) => (o.payload as { template?: string }).template === "announcement");
    expect(mine.length).toBe(2);
    void eq;
  });
});
