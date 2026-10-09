/**
 * "Closed online" passes (Admin → Events → per-pass switch).
 *
 * The promise: an admin can stop the PUBLIC website from selling a pass, the
 * walk-in desk keeps selling it, and nothing about pricing changes. Each test
 * defends one line of that promise.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://online-closed-tests";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.TEST_EMAIL_OVERRIDE = "sayantankundu93@gmail.com";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

import { getDb, schema } from "../src/db/client";
import { createCheckout, resolveTicketType, type CheckoutInput } from "../src/lib/checkout";
import { ensureExtraColumns } from "../src/lib/schema-ensure";
import { onlineClosedMessage } from "../src/lib/event-days";
import { createTestSchema } from "./helpers/schema";

let eventId = "";
const id = { allFood: "", satFood: "", concertSat: "", concertSun: "", lunch: "" };

const buyer = (over: Partial<CheckoutInput>): CheckoutInput => ({
  eventId,
  buyerName: "Test Buyer",
  buyerEmail: "buyer@example.com",
  isMemberPurchase: false,
  paymentMethod: "zelle",
  attendees: [],
  ...over,
});
const regCount = async () => (await getDb().select().from(schema.registrations)).length;

beforeAll(async () => {
  await createTestSchema();
  await ensureExtraColumns();
  const db = getDb();
  const [ev] = await db
    .insert(schema.events)
    .values({
      slug: "closed-test",
      name: "Closed Test",
      startsAt: new Date("2026-10-09"),
      endsAt: new Date("2026-10-11"),
      status: "published",
      days: [
        { key: "fri", label: "Fri", date: "2026-10-09" },
        { key: "sat", label: "Sat", date: "2026-10-10" },
        { key: "sun", label: "Sun", date: "2026-10-11" },
      ],
    })
    .returning();
  eventId = ev.id;
  const rows = await db
    .insert(schema.ticketTypes)
    .values([
      { eventId, name: "Adult all days food", ageBand: "adult", dayKeys: ["fri", "sat", "sun"], withFood: true, priceMemberCents: 16000, priceNonmemberCents: 17000, onlineClosedAt: new Date() },
      { eventId, name: "Adult Sat food", ageBand: "adult", dayKeys: ["sat"], withFood: true, priceMemberCents: 9000, priceNonmemberCents: 10000 },
      { eventId, name: "Concert Sat", ageBand: "concert", dayKeys: ["sat"], withFood: false, priceMemberCents: 3500, priceNonmemberCents: 3500 },
      { eventId, name: "Concert Sun", ageBand: "concert", dayKeys: ["sun"], withFood: false, priceMemberCents: 3500, priceNonmemberCents: 3500, onlineClosedAt: new Date() },
      { eventId, name: "Extra lunch", ageBand: "addon", dayKeys: ["sat"], withFood: true, priceMemberCents: 1500, priceNonmemberCents: 1500, onlineClosedAt: new Date() },
    ])
    .returning();
  [id.allFood, id.satFood, id.concertSat, id.concertSun, id.lunch] = rows.map((r) => r.id);
});

describe("closed-online passes", () => {
  it("CL-1 a web checkout that lands on a closed day pass is refused, with the walk-in desk named, and nothing is created", async () => {
    const before = await regCount();
    await expect(
      createCheckout(buyer({ source: "web", attendees: [{ firstName: "A", isKid: false, days: ["fri", "sat", "sun"], withFood: true, foodPref: "non_veg" }] }))
    ).rejects.toThrow(onlineClosedMessage("Adult all days food"));
    expect(await regCount()).toBe(before);
  });

  it("CL-2 a closed pass is NOT swapped for a different open pass — same days, same price, or refused", async () => {
    // All 3 days must never quietly become 3 × "Adult Sat food" or anything else.
    await expect(
      createCheckout(buyer({ attendees: [{ firstName: "A", isKid: false, days: ["fri", "sat", "sun"], withFood: true, foodPref: "veg" }] }))
    ).rejects.toThrow(/closed/);
  });

  it("CL-3 an open pass still sells online at its normal price", async () => {
    const res = await createCheckout(buyer({ source: "web", attendees: [{ firstName: "B", isKid: false, days: ["sat"], withFood: true, foodPref: "non_veg" }] }));
    expect(res.totalCents).toBe(10000);
  });

  it("CL-4 concerts: an open night sells, a closed night is refused", async () => {
    const ok = await createCheckout(buyer({ attendees: [{ firstName: "C", isKid: false, days: ["sat"], withFood: false, foodPref: "none", concertOnly: true }] }));
    expect(ok.totalCents).toBe(3500);
    await expect(
      createCheckout(buyer({ attendees: [{ firstName: "C", isKid: false, days: ["sun"], withFood: false, foodPref: "none", concertOnly: true }] }))
    ).rejects.toThrow(onlineClosedMessage("Concert Sun"));
  });

  it("CL-5 a closed add-on extra is refused", async () => {
    await expect(
      createCheckout(
        buyer({
          attendees: [{ firstName: "D", isKid: false, days: ["sat"], withFood: true, foodPref: "non_veg" }],
          addons: [{ ticketTypeId: id.lunch, qty: 1 }],
        })
      )
    ).rejects.toThrow(onlineClosedMessage("Extra lunch"));
  });

  it("CL-6 the walk-in desk is unaffected: matching still finds the closed pass for staff", async () => {
    const types = await getDb().select().from(schema.ticketTypes).where(eq(schema.ticketTypes.eventId, eventId));
    const m = resolveTicketType({ firstName: "W", isKid: false, days: ["fri", "sat", "sun"], withFood: true, foodPref: "non_veg" }, types, 3);
    expect(m.type.id).toBe(id.allFood);
    expect(m.type.onlineClosedAt).not.toBeNull();
  });

  it("CL-7 reopening the pass makes it sell online again", async () => {
    await getDb().update(schema.ticketTypes).set({ onlineClosedAt: null }).where(eq(schema.ticketTypes.id, id.allFood));
    const res = await createCheckout(buyer({ attendees: [{ firstName: "E", isKid: false, days: ["fri", "sat", "sun"], withFood: true, foodPref: "non_veg" }] }));
    expect(res.totalCents).toBe(17000);
  });
});
