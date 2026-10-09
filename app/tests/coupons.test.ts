/**
 * Coupon desk — the coupon rules (pure) and the handout store (PGlite).
 * The rules are the ones the hand-made Coupon Desk pages used; each case below
 * is one sentence of those rules.
 */
import { describe, it, expect, beforeAll } from "vitest";

process.env.PGLITE_DIR = "memory://coupon-tests";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.TEST_EMAIL_OVERRIDE = "sayantankundu93@gmail.com";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

import { getDb, schema } from "../src/db/client";
import { couponsForTicket, standingOf, addToTally, emptyTally, orderedKeys, type CouponTicket } from "../src/lib/coupons/rules";
import { loadCouponDesk, markHandedOut, undoHandedOut } from "../src/lib/coupons/store";
import { createTestSchema } from "./helpers/schema";

const DAYS = ["fri", "sat", "sun"];
const T = (over: Partial<CouponTicket>): CouponTicket => ({
  ageBand: "adult",
  passWithFood: true,
  passDayKeys: ["fri", "sat", "sun"],
  dayKey: "all",
  foodPref: "non_veg",
  age: null,
  ...over,
});
const keys = (t: CouponTicket) => couponsForTicket(t, DAYS).map((c) => c.key);

describe("coupon rules", () => {
  it("adult 3-day pass with food: Fri dinner, Sat lunch+dinner, Sun lunch+dinner", () => {
    expect(keys(T({}))).toEqual(["A_fri_D", "A_sat_L", "A_sat_D", "A_sun_L", "A_sun_D"]);
  });
  it("a combo pass stored per day gives that day's coupons only", () => {
    expect(keys(T({ passDayKeys: ["fri", "sun"], dayKey: "sun" }))).toEqual(["A_sun_L", "A_sun_D"]);
  });
  it("kid pass gives kid coupons", () => {
    expect(keys(T({ ageBand: "child_5_18", passDayKeys: ["sat"], foodPref: "kid" }))).toEqual(["K_sat_L", "K_sat_D"]);
  });
  it("concert-only: kid gets the kid dinner that night, adult gets nothing", () => {
    expect(keys(T({ ageBand: "concert", passWithFood: false, passDayKeys: ["sat"], dayKey: "sat", foodPref: "none", age: 8 }))).toEqual(["K_sat_D"]);
    expect(keys(T({ ageBand: "concert", passWithFood: false, passDayKeys: ["sat"], dayKey: "sat", foodPref: "none", age: null }))).toEqual([]);
  });
  it("without-food passes and add-ons give nothing", () => {
    expect(keys(T({ passWithFood: false, foodPref: "none" }))).toEqual([]);
    expect(keys(T({ ageBand: "addon", passDayKeys: ["sat"] }))).toEqual([]);
  });
  it("students get adult coupons; veg is counted on the coupon", () => {
    const tally = addToTally(emptyTally(), T({ ageBand: "student", passDayKeys: ["sat"], foodPref: "veg" }), DAYS);
    expect(tally.counts).toEqual({ A_sat_L: 1, A_sat_D: 1 });
    expect(tally.veg).toEqual({ A_sat_L: 1, A_sat_D: 1 });
    expect(orderedKeys(tally)).toEqual(["A_sat_L", "A_sat_D"]);
  });
  it("standing: paid counts, admitted walk-in owes, pending is unpaid, cancelled / voided skipped", () => {
    expect(standingOf({ status: "paid", source: "web", deskState: null, admittedUnsettledAt: null })).toBe("ready");
    expect(standingOf({ status: "pending_payment", source: "desk", deskState: "open", admittedUnsettledAt: new Date() })).toBe("owes");
    expect(standingOf({ status: "pending_payment", source: "web", deskState: null, admittedUnsettledAt: null })).toBe("unpaid");
    expect(standingOf({ status: "pending_zelle_verification", source: "web", deskState: null, admittedUnsettledAt: null })).toBe("unpaid");
    expect(standingOf({ status: "cancelled_no_payment", source: "web", deskState: null, admittedUnsettledAt: null })).toBe("skip");
    expect(standingOf({ status: "paid", source: "desk", deskState: "voided", admittedUnsettledAt: null })).toBe("skip");
  });
});

describe("coupon desk store", () => {
  let eventId = "";
  const since = new Date("2026-10-09T04:00:00Z"); // Oct 9, midnight New York
  const reg: Record<string, string> = {};

  beforeAll(async () => {
    await createTestSchema();
    const db = getDb();
    const [ev] = await db
      .insert(schema.events)
      .values({ slug: "c", name: "C", startsAt: new Date("2026-10-09"), endsAt: new Date("2026-10-11"), status: "published", days: DAYS.map((k) => ({ key: k, label: k, date: "" })) })
      .returning();
    eventId = ev.id;
    const [all3, kidSat] = await db
      .insert(schema.ticketTypes)
      .values([
        { eventId, name: "Adult 3 days", ageBand: "adult", dayKeys: DAYS, withFood: true, priceMemberCents: 1, priceNonmemberCents: 1 },
        { eventId, name: "Kid Sat", ageBand: "child_5_18", dayKeys: ["sat"], withFood: true, priceMemberCents: 1, priceNonmemberCents: 1 },
      ])
      .returning();
    const mk = async (key: string, email: string, status: string, at: string) => {
      const [r] = await db
        .insert(schema.registrations)
        .values({ confirmationNumber: `PRG-T-${key}`, eventId, buyerEmail: email, buyerName: key, subtotalCents: 0, totalCents: 0, paymentMethod: "zelle", status, createdAt: new Date(at), paidAt: status === "paid" ? new Date(at) : null })
        .returning();
      reg[key] = r.id;
      return r.id;
    };
    const tix = async (regId: string, ttId: string, name: string, food: string) =>
      db.insert(schema.tickets).values({ registrationId: regId, ticketTypeId: ttId, attendeeFirstName: name, foodPref: food, qrCode: `q-${regId}-${name}` });

    await tix(await mk("old", "roy@x.com", "paid", "2026-10-05T15:00:00Z"), all3.id, "Old", "non_veg"); // before the window
    const today = await mk("today", "Roy@X.com", "paid", "2026-10-09T14:00:00Z"); // same family, new booking
    await tix(today, kidSat.id, "Kid", "kid");
    await tix(await mk("pend", "sen@x.com", "pending_payment", "2026-10-09T15:00:00Z"), all3.id, "Sen", "veg");
  });

  it("only registrations since the start time, grouped by family email, with earlier bookings noted", async () => {
    const fams = await loadCouponDesk(eventId, DAYS, since);
    const roy = fams.find((f) => f.email.toLowerCase() === "roy@x.com")!;
    expect(roy.regs.map((r) => r.conf)).toEqual(["PRG-T-today"]);
    expect(roy.regs[0].tally.counts).toEqual({ K_sat_L: 1, K_sat_D: 1 });
    expect(roy.earlier).toEqual(["PRG-T-old"]);
    const sen = fams.find((f) => f.email === "sen@x.com")!;
    expect(sen.regs[0].standing).toBe("unpaid");
  });

  it("mark given is shared and undoable; an unpaid booking can't be marked", async () => {
    const marked = await markHandedOut([reg.today, reg.pend], { userId: "u1", name: "Ria" });
    expect(marked).toEqual([reg.today]);
    let fams = await loadCouponDesk(eventId, DAYS, since);
    expect(fams.find((f) => f.regs[0].id === reg.today)!.regs[0].given?.by).toBe("Ria");
    expect(fams.find((f) => f.regs[0].id === reg.pend)!.regs[0].given).toBeNull();
    await undoHandedOut([reg.today]);
    fams = await loadCouponDesk(eventId, DAYS, since);
    expect(fams.find((f) => f.regs[0].id === reg.today)!.regs[0].given).toBeNull();
  });
});
