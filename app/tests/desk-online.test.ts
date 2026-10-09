/**
 * Online bookings at the walk-in desk: taking payment for an unpaid one, the
 * "no desk tender on an online booking" guard, and same-price booking changes.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://desk-online-tests";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.TEST_EMAIL_OVERRIDE = "sayantankundu93@gmail.com";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

let SESSION: { userId: string; email: string; role: "volunteer" | "admin" | "super_admin" } | null = {
  userId: "u-super",
  email: "super@pragati.test",
  role: "super_admin",
};
vi.mock("../src/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/auth/session")>();
  return { ...actual, getSession: async () => SESSION };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));

import { getDb, schema } from "../src/db/client";
import { createTestSchema } from "./helpers/schema";
import { createCheckout } from "../src/lib/checkout";
import { requireDesk, type DeskActor } from "../src/lib/desk/guards";
import { openShift } from "../src/lib/desk/shifts";
import { addTender, custodyGroups } from "../src/lib/desk/tenders";
import { onlineBookingState, settleOnlineBooking } from "../src/lib/desk/online";
import { changeTicket, dayOptions } from "../src/lib/desk/changes";

let eventId = "";
let actor: DeskActor;
const tt: Record<string, string> = {};

async function webBooking(name: string, email: string, days: string[], method: "square" | "zelle" = "square") {
  const res = await createCheckout({
    eventId,
    buyerName: name,
    buyerEmail: email,
    isMemberPurchase: false,
    paymentMethod: method,
    attendees: [{ firstName: name, isKid: false, days, withFood: true, foodPref: "non_veg" }],
  });
  const [reg] = await getDb().select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, res.confirmationNumber));
  return reg;
}
const soldOf = async (id: string) => (await getDb().select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, id)))[0].soldCount;

beforeAll(async () => {
  await createTestSchema();
  const db = getDb();
  await db.insert(schema.users).values({ id: "u-super", email: "super@pragati.test", passwordHash: "x", role: "super_admin" });
  const [ev] = await db
    .insert(schema.events)
    .values({
      slug: "online-desk",
      name: "Online Desk",
      startsAt: new Date("2026-10-09"),
      endsAt: new Date("2026-10-11"),
      status: "published",
      days: [
        { key: "fri", label: "Friday, Oct 9", date: "2026-10-09" },
        { key: "sat", label: "Saturday, Oct 10", date: "2026-10-10" },
        { key: "sun", label: "Sunday, Oct 11", date: "2026-10-11" },
      ],
    })
    .returning();
  eventId = ev.id;
  const rows = await db
    .insert(schema.ticketTypes)
    .values([
      { eventId, name: "Adult Sat food", ageBand: "adult", dayKeys: ["sat"], withFood: true, priceMemberCents: 9000, priceNonmemberCents: 10000 },
      { eventId, name: "Adult Sun food", ageBand: "adult", dayKeys: ["sun"], withFood: true, priceMemberCents: 9000, priceNonmemberCents: 10000 },
      { eventId, name: "Adult Fri food", ageBand: "adult", dayKeys: ["fri"], withFood: true, priceMemberCents: 6000, priceNonmemberCents: 7000 },
    ])
    .returning();
  [tt.sat, tt.sun, tt.fri] = rows.map((r) => r.id);
  actor = await requireDesk();
});

describe("online bookings at the desk", () => {
  it("OD-1 a desk tender can never be added to an online booking (no double charge)", async () => {
    const reg = await webBooking("Paid", "paid@x.com", ["sat"]);
    await expect(
      addTender({ registrationId: reg.id, method: "cash", amountCents: 10000, cashTenderedCents: 10000 } as never, actor)
    ).rejects.toThrow(/booked online/);
  });

  it("OD-2 cash needs an open cash box", async () => {
    const reg = await webBooking("NoBox", "nobox@x.com", ["sat"]);
    await expect(settleOnlineBooking(reg.id, { method: "cash" }, actor)).rejects.toThrow(/cash box/);
  });

  it("OD-3 cash at the desk marks the online booking paid, takes the seat, drops the card fee, and shows in Money to bank", async () => {
    const shift = await openShift({ eventId, station: "desk-1", openingFloatCents: 0 }, actor);
    const reg = await webBooking("Cash", "cash@x.com", ["sat"]);
    const st = await onlineBookingState(reg.id);
    expect(st?.owesCents).toBe(10000);
    expect(st!.cardCents).toBeGreaterThanOrEqual(10000);
    const before = await soldOf(tt.sat);
    await settleOnlineBooking(reg.id, { method: "cash" }, actor);
    const [after] = await getDb().select().from(schema.registrations).where(eq(schema.registrations.id, reg.id));
    expect(after.status).toBe("paid");
    expect(await soldOf(tt.sat)).toBe(before + 1);
    const rows = await getDb().select().from(schema.payments).where(eq(schema.payments.entityId, reg.id));
    expect(rows.every((r) => r.status === "paid" && r.method === "cash" && r.custody === "in_drawer" && r.feeCents === 0 && r.shiftId === shift.id)).toBe(true);
    const groups = await custodyGroups();
    expect(groups.some((g) => g.custody === "in_drawer" && g.tenders.some((t) => t.entityId === reg.id))).toBe(true);
  });

  it("OD-4 a paid booking or an admin-cancelled one can't be settled again", async () => {
    const reg = await webBooking("Twice", "twice@x.com", ["sat"]);
    await settleOnlineBooking(reg.id, { method: "zelle_org" }, actor);
    await expect(settleOnlineBooking(reg.id, { method: "zelle_org" }, actor)).rejects.toThrow(/already paid/);
    const c = await webBooking("Cancelled", "cancelled@x.com", ["sat"]);
    await getDb().update(schema.registrations).set({ status: "cancelled" }).where(eq(schema.registrations.id, c.id));
    await expect(settleOnlineBooking(c.id, { method: "zelle_org" }, actor)).rejects.toThrow(/cancelled by an admin/);
  });

  it("OD-5 an unpaid retry by a family that already paid is flagged", async () => {
    const retry = await webBooking("Cash", "CASH@x.com", ["sun"]);
    const st = await onlineBookingState(retry.id);
    expect(st?.paidSiblings.length).toBe(1);
  });
});

describe("changing a booking (same price only)", () => {
  it("CH-1 veg ↔ non-veg and a name fix", async () => {
    const reg = await webBooking("Food", "food@x.com", ["sat"]);
    const [t] = await getDb().select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id));
    await changeTicket(t.id, { foodPref: "veg", firstName: "Foodie", lastName: "Sen" }, actor);
    const [u] = await getDb().select().from(schema.tickets).where(eq(schema.tickets.id, t.id));
    expect(u.foodPref).toBe("veg");
    expect(u.attendeeFirstName).toBe("Foodie");
  });

  it("CH-2 Saturday → Sunday at the same price; seats follow on a paid booking; QR unchanged", async () => {
    const reg = await webBooking("Mover", "mover@x.com", ["sat"]);
    await settleOnlineBooking(reg.id, { method: "zelle_org" }, actor);
    const [t] = await getDb().select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id));
    const types = await getDb().select().from(schema.ticketTypes).where(eq(schema.ticketTypes.eventId, eventId));
    const opts = dayOptions(t, types.find((x) => x.id === tt.sat)!, types, []);
    expect(opts.map((o) => o.ticketTypeId)).toEqual([tt.sun]); // Friday costs less → not offered
    const sat0 = await soldOf(tt.sat);
    const sun0 = await soldOf(tt.sun);
    await changeTicket(t.id, { toTicketTypeId: tt.sun }, actor);
    const [u] = await getDb().select().from(schema.tickets).where(eq(schema.tickets.id, t.id));
    expect(u.dayKey).toBe("sun");
    expect(u.ticketTypeId).toBe(tt.sun);
    expect(u.qrCode).toBe(t.qrCode);
    expect(await soldOf(tt.sat)).toBe(sat0 - 1);
    expect(await soldOf(tt.sun)).toBe(sun0 + 1);
  });

  it("CH-3 a different-price day or a used pass is refused", async () => {
    const reg = await webBooking("Nope", "nope@x.com", ["sat"]);
    const [t] = await getDb().select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id));
    await expect(changeTicket(t.id, { toTicketTypeId: tt.fri }, actor)).rejects.toThrow(/same-price/);
    await getDb().update(schema.tickets).set({ checkedInAt: new Date() }).where(eq(schema.tickets.id, t.id));
    await expect(changeTicket(t.id, { toTicketTypeId: tt.sun }, actor)).rejects.toThrow(/already been used/);
  });
});
