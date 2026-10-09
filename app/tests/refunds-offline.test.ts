/**
 * Refunds / partial cancellation (lib/refunds.ts) and the offline walk-in
 * notebook (lib/desk/offline.ts).
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://refunds-offline";
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
import { createCheckout, markRegistrationPaid } from "../src/lib/checkout";
import { cancelAndRefund, refundView, voidedTicketIds } from "../src/lib/refunds";
import { entryScanAction } from "../src/app/admin/checkin/actions";
import { mealReport } from "../src/lib/reports/meals";
import { requireDesk, type DeskActor } from "../src/lib/desk/guards";
import { openShift } from "../src/lib/desk/shifts";
import { importOfflineEntry, type OfflineEntry } from "../src/lib/desk/offline";
import { deskOrderSummary } from "../src/lib/desk/summary";
import { setConfig } from "../src/lib/system-config";

let eventId = "";
const tt: Record<string, string> = {};
const DAYS = [
  { key: "sat", label: "Saturday", date: "2030-10-12" },
  { key: "sun", label: "Sunday", date: "2030-10-13" },
];
let actor: DeskActor;
const sold = async (id: string) => (await getDb().select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, id)))[0].soldCount;

beforeAll(async () => {
  await createTestSchema();
  const db = getDb();
  await db.insert(schema.users).values({ id: "u-super", email: "super@pragati.test", passwordHash: "x", role: "super_admin" });
  const [ev] = await db
    .insert(schema.events)
    .values({ slug: "rf", name: "RF", startsAt: new Date("2030-10-12"), endsAt: new Date("2030-10-13"), status: "published", days: DAYS })
    .returning();
  eventId = ev.id;
  await setConfig("active_event_slug", "rf");
  const rows = await db
    .insert(schema.ticketTypes)
    .values([
      { eventId, name: "Adult Sat food", ageBand: "adult", dayKeys: ["sat"], withFood: true, priceMemberCents: 9000, priceNonmemberCents: 10000 },
      { eventId, name: "Kid Sat", ageBand: "child_5_18", dayKeys: ["sat"], withFood: true, priceMemberCents: 3500, priceNonmemberCents: 3500 },
    ])
    .returning();
  [tt.adult, tt.kid] = rows.map((r) => r.id);
  actor = await requireDesk();
});

async function paidFamily(email: string) {
  const res = await createCheckout({
    eventId,
    buyerName: "Fam",
    buyerEmail: email,
    isMemberPurchase: false,
    paymentMethod: "zelle",
    attendees: [
      { firstName: "Mum", isKid: false, days: ["sat"], withFood: true, foodPref: "non_veg" },
      { firstName: "Kid", isKid: true, age: 9, days: ["sat"], withFood: true, foodPref: "kid" },
    ],
  });
  const [reg] = await getDb().select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, res.confirmationNumber));
  await markRegistrationPaid(reg.id, { method: "zelle", adminUserId: "u-super" });
  return reg;
}

describe("cancel & refund", () => {
  it("RF-1 cancelling one pass voids it, gives the seat back, records the refund, and the gate refuses it", async () => {
    const reg = await paidFamily("rf1@x.com");
    const tix = await getDb().select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id));
    const kid = tix.find((t) => t.attendeeFirstName === "Kid")!;
    const before = await sold(tt.kid);
    await cancelAndRefund(reg.id, { ticketIds: [kid.id], refundCents: 3500, method: "zelle", note: "kid can't come" }, actor);
    expect((await voidedTicketIds()).has(kid.id)).toBe(true);
    expect(await sold(tt.kid)).toBe(before - 1);
    const v = await refundView(reg.id);
    expect(v?.refundedCents).toBe(3500);
    const r = await entryScanAction(kid.qrCode);
    expect(r.kind).toBe("invalid");
    if (r.kind === "invalid") expect(r.reason).toMatch(/CANCELLED/);
    // The kitchen no longer counts the kid's Saturday meals
    const meals = await mealReport(eventId, DAYS);
    const sat = meals.find((d) => d.key === "sat")!;
    expect(sat.meals.every((m) => m.kid === 0)).toBe(true);
  });

  it("RF-2 can't refund more than was paid, can't cancel a used pass, can't refund an unpaid booking", async () => {
    const reg = await paidFamily("rf2@x.com");
    await expect(cancelAndRefund(reg.id, { ticketIds: [], refundCents: 999999, method: "cash", note: "x" }, actor)).rejects.toThrow(/more than/);
    const [t] = await getDb().select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id));
    await getDb().update(schema.tickets).set({ checkedInAt: new Date() }).where(eq(schema.tickets.id, t.id));
    await expect(cancelAndRefund(reg.id, { ticketIds: [t.id], refundCents: 0, method: "cash", note: "x" }, actor)).rejects.toThrow(/already used/);
    const res = await createCheckout({ eventId, buyerName: "U", buyerEmail: "u@x.com", isMemberPurchase: false, paymentMethod: "zelle", attendees: [{ firstName: "U", isKid: false, days: ["sat"], withFood: true, foodPref: "veg" }] });
    const [unpaid] = await getDb().select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, res.confirmationNumber));
    await expect(cancelAndRefund(unpaid.id, { ticketIds: [], refundCents: 100, method: "cash", note: "x" }, actor)).rejects.toThrow(/Only a paid/);
  });
});

describe("offline notebook", () => {
  const entry = (): OfflineEntry => ({
    id: "11111111-2222-3333-4444-555555555555",
    createdAt: new Date().toISOString(),
    buyerName: "Offline Family",
    buyerPhone: "2155550000",
    people: [
      { name: "Dad Offline", ticketTypeId: tt.adult, foodPref: "veg" },
      { name: "Kid Offline", ticketTypeId: tt.kid, age: 8, foodPref: "kid" },
    ],
    payment: "cash",
    amountCents: 13500,
  });

  it("OF-1 an entry becomes a paid walk-in booking with the cash in the cash box", async () => {
    await openShift({ eventId, station: "desk-1", openingFloatCents: 0 }, actor);
    const r = await importOfflineEntry(entry(), actor);
    const s = await deskOrderSummary(r.registrationId);
    expect(s?.tickets.length).toBe(2);
    expect(s?.collectedCents).toBe(13500);
    expect(s?.balanceCents).toBe(0);
    expect(s?.reg.deskState).toBe("closed");
  });

  it("OF-2 syncing the same entry again never creates a second booking or takes the money twice", async () => {
    const r1 = await importOfflineEntry(entry(), actor);
    const r2 = await importOfflineEntry(entry(), actor);
    expect(r2.registrationId).toBe(r1.registrationId);
    const s = await deskOrderSummary(r1.registrationId);
    expect(s?.collectedCents).toBe(13500);
    expect(r2.notes[0]).toMatch(/Already synced/);
  });

  it("OF-3 not paid yet → booking let in owing the balance", async () => {
    const e = { ...entry(), id: "99999999-2222-3333-4444-555555555555", payment: "unpaid" as const, amountCents: 0, buyerName: "Owes Family" };
    const r = await importOfflineEntry(e, actor);
    const s = await deskOrderSummary(r.registrationId);
    expect(s?.balanceCents).toBe(13500);
    expect(s?.reg.admittedUnsettledAt).not.toBeNull();
  });
});
