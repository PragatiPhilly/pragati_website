/**
 * Per-day gate check-in (lib/checkin/daily.ts + the gate actions).
 *
 * The bug this fixes: a 3-day pass scanned on Friday read "already used" on
 * Saturday, and a Sunday ticket scanned on Saturday was let in and then
 * "used up" for Sunday. The event days here are built around the REAL today,
 * because the gate decides by the wall clock in New York.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://daily-checkin-tests";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.TEST_EMAIL_OVERRIDE = "sayantankundu93@gmail.com";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

vi.mock("../src/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/auth/session")>();
  return { ...actual, getSession: async () => ({ userId: "u-gate", email: "gate@pragati.test", role: "volunteer" }) };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));

import { getDb, schema } from "../src/db/client";
import { createTestSchema } from "./helpers/schema";
import { nyYmd, recordCheckin, todayOf, dailyState, todayCounts } from "../src/lib/checkin/daily";
import { entryScanAction, lookupTicketsAction, undoCheckInAction, checkInAllAction } from "../src/app/admin/checkin/actions";

const ymd = (offset: number) => nyYmd(new Date(Date.now() + offset * 86_400_000));
// yesterday = "fri", today = "sat", tomorrow = "sun"
const DAYS = [
  { key: "fri", date: ymd(-1), label: "Friday" },
  { key: "sat", date: ymd(0), label: "Saturday" },
  { key: "sun", date: ymd(1), label: "Sunday" },
];
let eventId = "";
let regId = "";
const qr: Record<string, string> = {};
const tid: Record<string, string> = {};

beforeAll(async () => {
  await createTestSchema();
  const db = getDb();
  const [ev] = await db
    .insert(schema.events)
    .values({ slug: "gate", name: "Gate", startsAt: new Date(), endsAt: new Date(), status: "published", days: DAYS })
    .returning();
  eventId = ev.id;
  const [all3, satSun, sunOnly] = await db
    .insert(schema.ticketTypes)
    .values([
      { eventId, name: "All 3 days", ageBand: "adult", dayKeys: ["fri", "sat", "sun"], priceMemberCents: 1, priceNonmemberCents: 1 },
      { eventId, name: "Sat & Sun", ageBand: "adult", dayKeys: ["sat", "sun"], priceMemberCents: 1, priceNonmemberCents: 1 },
      { eventId, name: "Sunday", ageBand: "adult", dayKeys: ["sun"], priceMemberCents: 1, priceNonmemberCents: 1 },
    ])
    .returning();
  const [reg] = await db
    .insert(schema.registrations)
    .values({ confirmationNumber: "PRG-G-1", eventId, buyerEmail: "g@x.com", buyerName: "Gupta", subtotalCents: 0, totalCents: 0, paymentMethod: "square", status: "paid", paidAt: new Date() })
    .returning();
  regId = reg.id;
  const mk = async (key: string, ttId: string, day: string) => {
    qr[key] = `PRAGATI-TKT-${key}`;
    const [t] = await db
      .insert(schema.tickets)
      .values({ registrationId: reg.id, ticketTypeId: ttId, attendeeFirstName: key, foodPref: "non_veg", dayKey: day, qrCode: qr[key] })
      .returning();
    tid[key] = t.id;
  };
  await mk("full", all3.id, "all"); // 3-day pass, one ticket
  await mk("bsat", satSun.id, "sat"); // Sat & Sun bundle → one ticket per day
  await mk("bsun", satSun.id, "sun");
  await mk("sunday", sunOnly.id, "sun");
  // the 3-day pass was scanned YESTERDAY (old-style: only tickets.checked_in_at)
  await db.update(schema.tickets).set({ checkedInAt: new Date(Date.now() - 86_400_000) }).where(eq(schema.tickets.id, tid.full));
});

describe("per-day gate check-in", () => {
  it("DC-1 a 3-day pass used yesterday is let in again today", async () => {
    const r = await entryScanAction(qr.full);
    expect(r.kind).toBe("checked_in");
  });

  it("DC-2 scanning it twice on the same day is flagged as a duplicate", async () => {
    const r = await entryScanAction(qr.full);
    expect(r.kind).toBe("duplicate");
  });

  it("DC-3 a ticket for another day is refused, naming the right day", async () => {
    const r = await entryScanAction(qr.sunday);
    expect(r.kind).toBe("invalid");
    if (r.kind === "invalid") expect(r.reason).toContain("Sunday");
    // …and it was NOT burned
    const [t] = await getDb().select().from(schema.tickets).where(eq(schema.tickets.id, tid.sunday));
    expect(t.checkedInAt).toBeNull();
  });

  it("DC-4 lookup marks tomorrow's tickets 'not for today' so 'check in all' skips them", async () => {
    const list = await lookupTicketsAction("PRG-G-1");
    const byName = Object.fromEntries(list.map((t) => [t.attendee, t]));
    expect(byName.bsun.notToday).toBe("Sunday");
    expect(byName.sunday.notToday).toBe("Sunday");
    expect(byName.bsat.notToday).toBeUndefined();
    expect(byName.full.checkedInAt).not.toBeNull(); // in today (DC-1)
    const eligible = list.filter((t) => !t.checkedInAt && !t.notToday).map((t) => t.id);
    expect(eligible).toEqual([tid.bsat]);
    await checkInAllAction(eligible);
    const [sun] = await getDb().select().from(schema.tickets).where(eq(schema.tickets.id, tid.bsun));
    expect(sun.checkedInAt).toBeNull();
  });

  it("DC-5 today's counter counts only tickets valid today", async () => {
    const c = await todayCounts(eventId, DAYS);
    expect(c?.today.key).toBe("sat");
    expect(c?.expected).toBe(2); // full + bsat
    expect(c?.inside).toBe(2);
  });

  it("DC-6 undo removes TODAY's check-in only — yesterday's stays on record", async () => {
    await undoCheckInAction(tid.full);
    const db = getDb();
    const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, tid.full));
    const st = await dailyState(t, ["fri", "sat", "sun"], DAYS);
    expect(st.inAt).toBeNull();
    const r = await entryScanAction(qr.full);
    expect(r.kind).toBe("checked_in");
  });

  it("DC-7 tomorrow the same 3-day pass is fresh again", async () => {
    const db = getDb();
    const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, tid.full));
    const tomorrow = new Date(Date.now() + 86_400_000);
    expect(todayOf(DAYS, tomorrow)?.key).toBe("sun");
    const st = await dailyState(t, ["fri", "sat", "sun"], DAYS, tomorrow);
    expect(st.wrongDay).toBe(false);
    expect(st.inAt).toBeNull();
  });

  it("DC-8 outside the event dates the old once-only rule is unchanged", async () => {
    const db = getDb();
    const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, tid.full));
    const farAway = new Date(Date.now() + 30 * 86_400_000);
    const st = await dailyState(t, ["fri", "sat", "sun"], DAYS, farAway);
    expect(st.today).toBeNull();
    expect(st.inAt).not.toBeNull(); // used → stays used, exactly like before
    await recordCheckin(tid.full, null, "u"); // no day row written outside event days
    void regId;
  });
});
