/**
 * The card processing fee is a setting (Admin → Settings), not a constant.
 * EC decision for Kali Pujo 2026: off, but switchable back on with no code change.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://card-fee-tests";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.TEST_EMAIL_OVERRIDE = "sayantankundu93@gmail.com";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

import { getDb, schema } from "../src/db/client";
import { createTestSchema } from "./helpers/schema";
import { cardProcessingFeeCents } from "../src/lib/pricing";
import { cardFeeRate } from "../src/lib/payments/card-fee";
import { createCheckout } from "../src/lib/checkout";

let eventId = "";
const set = async (key: string, value: unknown) =>
  getDb().insert(schema.systemConfig).values({ key, value }).onConflictDoUpdate({ target: schema.systemConfig.key, set: { value } });

async function squareFee(): Promise<number> {
  const r = await createCheckout({
    eventId,
    buyerName: "Fee Test",
    buyerEmail: "fee@example.com",
    buyerPhone: "2155550111",
    isMemberPurchase: false,
    paymentMethod: "square",
    attendees: [{ firstName: "A", isKid: false, days: ["sat"], withFood: true, foodPref: "veg" }],
  });
  const [reg] = await getDb().select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, r.confirmationNumber));
  return reg.processingFeeCents;
}

beforeAll(async () => {
  await createTestSchema();
  const [ev] = await getDb()
    .insert(schema.events)
    .values({ slug: "fee", name: "Fee", startsAt: new Date(), endsAt: new Date(), status: "published", days: [{ key: "sat", date: "2026-11-07", label: "Sat" }] })
    .returning();
  eventId = ev.id;
  await getDb().insert(schema.ticketTypes).values({ eventId, name: "Adult", ageBand: "adult", dayKeys: ["sat"], withFood: true, priceMemberCents: 10000, priceNonmemberCents: 10000 });
});

describe("card processing fee setting", () => {
  it("is OFF by default — no fee on a card checkout", async () => {
    expect(await cardFeeRate()).toBe(0);
    expect(await squareFee()).toBe(0);
  });
  it("switched on in Settings → 3% again, with no code change", async () => {
    await set("card_fee_enabled", "yes");
    expect(await cardFeeRate()).toBeCloseTo(0.03);
    expect(await squareFee()).toBe(300);
  });
  it("the percentage is a setting too, and a typo can't charge more than 10%", async () => {
    await set("card_fee_percent", 2.5);
    expect(await squareFee()).toBe(250);
    await set("card_fee_percent", 30);
    expect(await cardFeeRate()).toBeCloseTo(0.1);
    await set("card_fee_enabled", "no");
    expect(await cardFeeRate()).toBe(0);
  });
  it("rate 0 means no fee anywhere the helper is used", () => {
    expect(cardProcessingFeeCents(10000, 0)).toBe(0);
    expect(cardProcessingFeeCents(10000)).toBe(300);
  });
});
