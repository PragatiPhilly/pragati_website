/**
 * spec/19 — seasons: one event's data kept and re-loadable after the next
 * event starts; split child prices (5–11 / 12–17) for Kali Pujo 2026.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://seasons-tests";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.TEST_EMAIL_OVERRIDE = "sayantankundu93@gmail.com";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

import { getDb, schema } from "../src/db/client";
import { createTestSchema } from "./helpers/schema";
import { createCheckout, markRegistrationPaid } from "../src/lib/checkout";
import { openPayments, listPayments } from "../src/lib/ledger";
import { setConfig } from "../src/lib/system-config";
import {
  closeOutAndSwitch,
  computeEventSummary,
  donationEventId,
  inLens,
  listArchives,
  loadAttribution,
  paymentEventId,
} from "../src/lib/seasons";
import { passesForBand, youthBandFor } from "../src/lib/bands";
import { setupKaliPujo2026 } from "../src/lib/data-migrations";
import { priceParty, type DeskPerson } from "../src/lib/desk/party";

let durga = "";
let kali = "";
const actor = { userId: "admin-1", name: "Admin" };

async function buy(eventId: string, email: string, attendees: Parameters<typeof createCheckout>[0]["attendees"]) {
  const r = await createCheckout({ eventId, buyerName: "Buyer", buyerEmail: email, buyerPhone: "2155550100", isMemberPurchase: false, paymentMethod: "zelle", attendees });
  const [reg] = await getDb().select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, r.confirmationNumber));
  await markRegistrationPaid(reg.id, { method: "zelle", adminUserId: "admin-1" });
  return reg;
}
async function donate(name: string, cents: number) {
  const [d] = await getDb()
    .insert(schema.donations)
    .values({ confirmationNumber: `DON-${name}`, donorName: name, donorEmail: `${name}@x.org`, amountCents: cents, paymentMethod: "offline", status: "paid", paidAt: new Date() })
    .returning();
  await openPayments([{ kind: "donation", entityId: d.id, payerName: name, payerEmail: `${name}@x.org`, amountCents: cents, method: "offline", status: "paid" } as never]);
  return d;
}

beforeAll(async () => {
  await createTestSchema();
  const db = getDb();
  const [d] = await db
    .insert(schema.events)
    .values({ slug: "durga-pujo-2026", name: "Durga Pujo 2026", startsAt: new Date("2026-10-09T20:00:00Z"), endsAt: new Date("2026-10-12T03:00:00Z"), status: "published", days: [{ key: "sat", date: "2026-10-10", label: "Sat" }] })
    .returning();
  durga = d.id;
  await db.insert(schema.ticketTypes).values([
    { eventId: durga, name: "Adult", ageBand: "adult", dayKeys: ["sat"], withFood: true, priceMemberCents: 9000, priceNonmemberCents: 10000 },
    { eventId: durga, name: "Child", ageBand: "child_5_18", dayKeys: ["sat"], withFood: true, priceMemberCents: 3500, priceNonmemberCents: 3500 },
  ]);
  await setConfig("active_event_slug", "durga-pujo-2026");
});

describe("Kali Pujo 2026 setup (self-applying)", () => {
  it("creates the draft event once, with the EC's prices, and never overwrites", async () => {
    expect(await setupKaliPujo2026()).toMatch(/created/);
    expect(await setupKaliPujo2026()).toMatch(/already exists/);
    const [ev] = await getDb().select().from(schema.events).where(eq(schema.events.slug, "kali-pujo-2026"));
    kali = ev.id;
    expect(ev.status).toBe("draft");
    expect(ev.venueName).toBe("West Bradford Elementary School");
    const types = await getDb().select().from(schema.ticketTypes).where(eq(schema.ticketTypes.eventId, kali));
    const price = (band: string) => types.find((t) => t.ageBand === band)!;
    expect([price("adult").priceMemberCents, price("adult").priceNonmemberCents]).toEqual([5000, 5500]);
    expect(price("child_12_17").priceNonmemberCents).toBe(2500);
    expect(price("child_5_11").priceNonmemberCents).toBe(1500);
    expect(price("child_under_5").priceNonmemberCents).toBe(0);
  });
});

describe("split child prices", () => {
  it("a child takes the most specific band the event sells", async () => {
    expect(youthBandFor(4)).toBe("child_5_11"); // (under-5 is decided before this)
    expect(youthBandFor(11)).toBe("child_5_11");
    expect(youthBandFor(12)).toBe("child_12_17");
    const durgaTypes = [{ ageBand: "child_5_18" }, { ageBand: "adult" }];
    expect(passesForBand(durgaTypes, "child_12_17").map((t) => t.ageBand)).toEqual(["child_5_18"]); // single price event
    const kaliTypes = [{ ageBand: "child_5_11" }, { ageBand: "child_12_17" }];
    expect(passesForBand(kaliTypes, "child_12_17").map((t) => t.ageBand)).toEqual(["child_12_17"]);
    expect(passesForBand(kaliTypes, "child_5_18")).toEqual([]); // age unknown → no price can be picked
  });

  it("checkout: 14 → $25, 8 → $15, 2 → free; adult non-member $55", async () => {
    const res = await createCheckout({
      eventId: kali,
      buyerName: "Kali Family",
      buyerEmail: "kali@x.org",
      buyerPhone: "2155550111",
      isMemberPurchase: false,
      paymentMethod: "zelle",
      attendees: [
        { firstName: "Mum", isKid: false, days: ["sat"], withFood: true, foodPref: "veg" },
        { firstName: "Teen", isKid: true, age: 14, days: ["sat"], withFood: true, foodPref: "non_veg" },
        { firstName: "Kid", isKid: true, age: 8, days: ["sat"], withFood: true, foodPref: "kid_veg" },
        { firstName: "Baby", isKid: true, age: 2, days: ["sat"], withFood: true, foodPref: "kid_veg" },
      ],
    });
    expect(res.totalCents).toBe(5500 + 2500 + 1500 + 0);
  });

  it("walk-in desk asks for a child's age instead of guessing the price", () => {
    const types = [
      { id: "a", eventId: kali, name: "Adult", ageBand: "adult", dayKeys: ["sat"], withFood: true, priceMemberCents: 5000, priceNonmemberCents: 5500 },
      { id: "c", eventId: kali, name: "Child", ageBand: "child_5_11", dayKeys: ["sat"], withFood: true, priceMemberCents: 1500, priceNonmemberCents: 1500 },
      { id: "t", eventId: kali, name: "Youth", ageBand: "child_12_17", dayKeys: ["sat"], withFood: true, priceMemberCents: 2500, priceNonmemberCents: 2500 },
    ].map((t) => ({ description: null, pricingModel: "per_person", checkInStart: null, capacity: null, soldCount: 0, requiresFoodSelection: true, saleStartsAt: null, saleEndsAt: null, displayOrder: 0, archivedAt: null, onlineClosedAt: null, createdAt: new Date(), updatedAt: new Date(), ...t })) as never;
    const p = (ref: string, age?: number): DeskPerson => ({ ref, firstName: ref, kind: "youth", age, days: ["sat"], withFood: true, foodPref: "kid_veg" });
    const known = priceParty([p("Teen", 13), p("Kid", 7)], types, { eventDayCount: 1, isMemberPurchase: false, discountMode: "per_adult" });
    expect(known.listPriceCents).toBe(2500 + 1500);
    const unknown = priceParty([p("NoAge")], types, { eventDayCount: 1, isMemberPurchase: false, discountMode: "per_adult" });
    expect(unknown.problems[0]?.why).toMatch(/age/);
  });
});

describe("seasons — nothing moves, every tab can load a past event", () => {
  let durgaReg = "";
  let durgaGift = "";
  it("Durga Pujo money: a booking, an in-checkout gift is via its booking, a standalone gift is unfiled", async () => {
    const reg = await buy(durga, "das@x.org", [{ firstName: "Amit", isKid: false, days: ["sat"], withFood: true, foodPref: "non_veg" }]);
    durgaReg = reg.id;
    durgaGift = (await donate("Ghosh", 10100)).id;
    const a = await loadAttribution();
    const pays = await listPayments();
    const regPay = pays.find((p) => p.kind === "registration" && p.entityId === durgaReg)!;
    expect(paymentEventId(a, regPay)).toBe(durga);
    expect(donationEventId(a, durgaGift)).toBeNull(); // not filed yet = the current event (Durga)
  });

  it("close-out files the strays under Durga, freezes its numbers, makes Kali current and publishes it", async () => {
    const r = await closeOutAndSwitch(kali, { publish: true, actor });
    expect(r.tagged.donations).toBe(1);
    expect(r.published).toBe(true);
    const [ev] = await getDb().select().from(schema.events).where(eq(schema.events.id, kali));
    expect(ev.status).toBe("published");
    const a = await loadAttribution();
    expect(donationEventId(a, durgaGift)).toBe(durga);
    const [arch] = await listArchives();
    expect(arch.eventId).toBe(durga);
    expect(arch.summary.registrations.paid).toBe(1);
    expect(arch.summary.money.donations).toBe(10100);
    expect(arch.summary.money.tickets).toBe(10000);
  });

  it("after the switch, new money lands in Kali and Durga's view is unchanged", async () => {
    const kaliGift = await donate("Sen", 2500);
    await buy(kali, "roy@x.org", [{ firstName: "Anik", isKid: false, days: ["sat"], withFood: true, foodPref: "veg" }]);
    const [k] = await getDb().select().from(schema.events).where(eq(schema.events.id, kali));
    const [d] = await getDb().select().from(schema.events).where(eq(schema.events.id, durga));
    const a = await loadAttribution();
    const pays = await listPayments();
    const sumFor = (lens: { event: typeof k; isCurrent: boolean }) =>
      pays.filter((p) => p.status === "paid" && inLens(paymentEventId(a, p), lens)).reduce((n, p) => n + p.amountCents, 0);
    expect(sumFor({ event: d, isCurrent: false })).toBe(10000 + 10100); // Durga: frozen as it was
    // Kali: the new gift + Anik's adult pass (the earlier Kali family checkout is unpaid Zelle)
    expect(sumFor({ event: k, isCurrent: true })).toBe(2500 + 5500);
    expect(donationEventId(a, kaliGift.id)).toBeNull(); // unfiled = the current event (Kali)
  });

  it("the live summary of a past event still loads, through the same lens", async () => {
    const s = await computeEventSummary(durga, { isCurrent: false });
    expect(s.registrations.paid).toBe(1);
    expect(s.donations.count).toBe(1);
  });
});

describe("Kali Pujo 2026 time fix (self-applying)", () => {
  it("restores 7:00 PM Eastern and one day when the old form saved it as UTC; leaves a correct event alone", async () => {
    const { fixKaliPujo2026Times } = await import("../src/lib/data-migrations");
    const db = getDb();
    await db
      .update(schema.events)
      .set({
        startsAt: new Date("2026-11-14T19:00:00Z"),
        endsAt: new Date("2026-11-15T04:30:00Z"),
        days: [
          { key: "sat", date: "2026-11-14", label: "Saturday, Nov 14" },
          { key: "sun", date: "2026-11-15", label: "Sunday, Nov 15" },
        ],
      })
      .where(eq(schema.events.id, kali));
    expect(await fixKaliPujo2026Times()).toMatch(/fixed/);
    const [ev] = await db.select().from(schema.events).where(eq(schema.events.id, kali));
    expect(ev.startsAt.toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(ev.endsAt.toISOString()).toBe("2026-11-15T04:30:00.000Z");
    expect((ev.days as { key: string }[]).map((d) => d.key)).toEqual(["sat"]);
    expect(await fixKaliPujo2026Times()).toMatch(/already correct/);
  });
});
