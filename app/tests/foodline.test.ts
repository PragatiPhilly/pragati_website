/**
 * spec/18 — plate choices, under-5 passes, and the food line by party.
 * Numbers in the test names are the test-case numbers in the spec.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://foodline-tests";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.TEST_EMAIL_OVERRIDE = "sayantankundu93@gmail.com";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";

import { getDb, schema } from "../src/db/client";
import { createTestSchema } from "./helpers/schema";
import { coerceFoodPref, plateChoices, plateOf } from "../src/lib/food";
import { couponsForTicket, whoIs } from "../src/lib/coupons/rules";
import { plateForWindow } from "../src/lib/foodline/rules";
import {
  addExtras,
  changePlate,
  ensureFoodlineSchema,
  foodLookup,
  giveFood,
  giveOne,
  loadFoodParty,
  undoGive,
  windowStats,
  FoodError,
} from "../src/lib/foodline/party";
import { createCheckout, markRegistrationPaid } from "../src/lib/checkout";

const DAYS = ["fri", "sat", "sun"];
const admin = { userId: "admin-1", role: "admin", name: "Admin" };
const vol = { userId: "vol-1", role: "volunteer", name: "Vol" };

// ── rules (pure) ─────────────────────────────────────────────────────────
describe("plate choices (1–5)", () => {
  it("1. adults pick adult plates; 12–17 pick any of four; 5–11 and under-5 pick kid plates; unknown age → four", () => {
    expect(plateChoices("adult", 40)).toEqual(["adult_non_veg", "adult_veg"]);
    expect(plateChoices("youth", 12)).toHaveLength(4);
    expect(plateChoices("youth", 17)).toHaveLength(4);
    expect(plateChoices("youth", 11)).toEqual(["kid_non_veg", "kid_veg"]);
    expect(plateChoices("under5", 3)).toEqual(["kid_non_veg", "kid_veg"]);
    expect(plateChoices("youth", undefined)).toHaveLength(4);
  });
  it("2. the adult-meal age is a setting", () => {
    expect(plateChoices("youth", 11, 10)).toHaveLength(4);
    expect(plateChoices("youth", 13, 14)).toEqual(["kid_non_veg", "kid_veg"]);
  });
  it("3. server coercion keeps the diet, never guesses one", () => {
    expect(coerceFoodPref("veg", "youth", 8)).toBe("kid_veg");
    expect(coerceFoodPref("non_veg", "youth", 8)).toBe("kid_non_veg");
    expect(coerceFoodPref("veg", "youth", 14)).toBe("veg");
    expect(coerceFoodPref("kid_veg", "adult", 40)).toBe("veg");
    expect(coerceFoodPref("none", "under5", 2)).toBe("kid"); // always a plate, diet not guessed
    expect(coerceFoodPref("none", "youth", 9, 12, true)).toBe("none"); // desk "not eating"
    expect(coerceFoodPref("none", "adult", 40)).toBe("none");
    expect(coerceFoodPref("garbage", "youth", 9)).toBe("kid");
  });
  it("4. the old 'kid' value is a kid plate with no diet", () => {
    expect(plateOf("kid")).toBe("kid");
    expect(plateOf("none")).toBeNull();
  });
  it("5. a teen on an adult plate counts as Adult; kid veg counts as veg", () => {
    const teen = { ageBand: "child_5_18", passWithFood: true, passDayKeys: ["sat"], dayKey: "sat", foodPref: "veg", age: 14 };
    expect(whoIs(teen)).toBe("Adult");
    expect(couponsForTicket(teen, DAYS)).toEqual([
      { key: "A_sat_L", veg: true },
      { key: "A_sat_D", veg: true },
    ]);
    const kidVeg = { ...teen, foodPref: "kid_veg", age: 8 };
    expect(whoIs(kidVeg)).toBe("Kid");
    expect(couponsForTicket(kidVeg, DAYS).every((c) => c.veg)).toBe(true);
  });
  it("7. an under-5 on a no-food 'Under 5 : Free' pass still gets a kid plate", () => {
    const u5 = { ageBand: "child_under_5", passWithFood: false, passDayKeys: null, dayKey: "sat", foodPref: "kid_veg", age: 3 };
    expect(couponsForTicket(u5, DAYS).map((c) => c.key)).toEqual(["K_sat_L", "K_sat_D"]);
    expect(plateForWindow({ dayKey: "sat", foodPref: "none", attendeeAge: 3 }, { ageBand: "child_under_5", withFood: false, dayKeys: null }, { kind: "lunch", dayKey: "sat" }, DAYS)).toEqual({ plate: "kid" });
  });
  it("15. no-food adult and concert adult get no plate; concert kid gets one at dinner only", () => {
    const w = (kind: string) => ({ kind, dayKey: "sat" });
    expect(plateForWindow({ dayKey: "sat", foodPref: "none", attendeeAge: null }, { ageBand: "adult", withFood: false, dayKeys: ["sat"] }, w("dinner"), DAYS)).toMatchObject({ plate: null, why: "no_food_pass" });
    expect(plateForWindow({ dayKey: "sat", foodPref: "none", attendeeAge: 40 }, { ageBand: "concert", withFood: false, dayKeys: ["sat"] }, w("dinner"), DAYS)).toMatchObject({ plate: null, why: "concert" });
    expect(plateForWindow({ dayKey: "sat", foodPref: "none", attendeeAge: 9 }, { ageBand: "concert", withFood: false, dayKeys: ["sat"] }, w("dinner"), DAYS)).toEqual({ plate: "kid" });
    expect(plateForWindow({ dayKey: "sat", foodPref: "none", attendeeAge: 9 }, { ageBand: "concert", withFood: false, dayKeys: ["sat"] }, w("lunch"), DAYS)).toMatchObject({ plate: null });
    expect(plateForWindow({ dayKey: "sun", foodPref: "non_veg", attendeeAge: null }, { ageBand: "adult", withFood: true, dayKeys: ["sun"] }, w("dinner"), DAYS)).toMatchObject({ plate: null, why: "not_today" });
  });
});

// ── database ─────────────────────────────────────────────────────────────
let eventId = "";
let dinner = "";
let lunch = "";
const tt: Record<string, string> = {};

async function seedReg(opts: { conf: string; email: string; phone?: string; status?: string; source?: string; deskState?: string | null; admitted?: boolean; parent?: string }, people: { first: string; type: string; food: string; age?: number; day?: string }[]) {
  const db = getDb();
  const [reg] = await db
    .insert(schema.registrations)
    .values({
      confirmationNumber: opts.conf,
      eventId,
      buyerEmail: opts.email,
      buyerName: `${people[0].first} Family`,
      buyerPhone: opts.phone ?? null,
      subtotalCents: 0,
      totalCents: 0,
      paymentMethod: "offline",
      status: opts.status ?? "paid",
      source: opts.source ?? "web",
      deskState: opts.deskState ?? null,
      admittedUnsettledAt: opts.admitted ? new Date() : null,
      parentRegistrationId: opts.parent ?? null,
    })
    .returning();
  const tix = [];
  for (const p of people) {
    const [t] = await db
      .insert(schema.tickets)
      .values({
        registrationId: reg.id,
        ticketTypeId: tt[p.type],
        attendeeFirstName: p.first,
        attendeeLastName: "Das",
        attendeeAge: p.age ?? null,
        foodPref: p.food,
        dayKey: p.day ?? "all",
        qrCode: `PRAGATI-TKT-${opts.conf}-${p.first}`,
      })
      .returning();
    tix.push(t);
  }
  return { reg, tix };
}

let das: Awaited<ReturnType<typeof seedReg>>;

beforeAll(async () => {
  await createTestSchema();
  await ensureFoodlineSchema();
  const db = getDb();
  const [ev] = await db
    .insert(schema.events)
    .values({
      slug: "kali-test",
      name: "Kali Test",
      startsAt: new Date("2026-11-07"),
      endsAt: new Date("2026-11-08"),
      status: "published",
      days: [
        { key: "fri", label: "Fri", date: "2026-11-06" },
        { key: "sat", label: "Sat", date: "2026-11-07" },
        { key: "sun", label: "Sun", date: "2026-11-08" },
      ],
    })
    .returning();
  eventId = ev.id;
  const types = await db
    .insert(schema.ticketTypes)
    .values([
      { eventId, name: "Adult all food", ageBand: "adult", dayKeys: DAYS, withFood: true, priceMemberCents: 9000, priceNonmemberCents: 10000 },
      { eventId, name: "Adult sat no food", ageBand: "adult", dayKeys: ["sat"], withFood: false, priceMemberCents: 5000, priceNonmemberCents: 6000 },
      { eventId, name: "Child all", ageBand: "child_5_18", dayKeys: DAYS, withFood: true, priceMemberCents: 3000, priceNonmemberCents: 3000 },
      { eventId, name: "Adult sun", ageBand: "adult", dayKeys: ["sun"], withFood: true, priceMemberCents: 4000, priceNonmemberCents: 4000 },
      { eventId, name: "Concert sat", ageBand: "concert", dayKeys: ["sat"], withFood: false, priceMemberCents: 2000, priceNonmemberCents: 2000 },
    ])
    .returning();
  for (const t of types) tt[t.name] = t.id;
  const [d] = await db.insert(schema.scanSessions).values({ eventId, kind: "dinner", dayKey: "sat", label: "Sat · Dinner", status: "open" }).returning();
  const [l] = await db.insert(schema.scanSessions).values({ eventId, kind: "lunch", dayKey: "sat", label: "Sat · Lunch", status: "closed" }).returning();
  dinner = d.id;
  lunch = l.id;

  das = await seedReg({ conf: "PRG-2026-0101", email: "das@example.com", phone: "215-555-0101" }, [
    { first: "Amit", type: "Adult all food", food: "non_veg" },
    { first: "Rina", type: "Adult all food", food: "non_veg" },
    { first: "Tia", type: "Child all", food: "kid_veg", age: 8 },
    { first: "Bubai", type: "Child all", food: "kid_non_veg", age: 3 },
    { first: "Dadu", type: "Adult sat no food", food: "none" },
    { first: "Pishi", type: "Adult sun", food: "veg", day: "sun" },
  ]);
});

describe("food line by party (9–20)", () => {
  it("9. one booking, owed plates by type for the window", async () => {
    const p = (await loadFoodParty(dinner, das.reg.id))!;
    expect(p.booking.booked.adult_non_veg).toBe(2);
    expect(p.booking.booked.kid_veg).toBe(1);
    expect(p.booking.booked.kid_non_veg).toBe(1);
    expect(p.booking.booked.total).toBe(4);
    // Dadu (no-food pass) is listed but not counted; Pishi (Sunday) is not today
    expect(p.booking.people.find((x) => x.name.startsWith("Dadu"))?.plate).toBeNull();
    expect(p.booking.otherDayPasses).toBe(1);
  });

  it("scanning ANY pass on the booking opens the whole party", async () => {
    const r = await foodLookup(dinner, `https://x.org/t/${das.tix[2].qrCode}`);
    expect(r.kind).toBe("party");
    if (r.kind === "party") expect(r.party.booking.registrationId).toBe(das.reg.id);
  });

  it("10/11. give some now, the rest later; then ALL GIVEN", async () => {
    const r1 = await giveFood(dinner, das.reg.id, { adult_non_veg: 1, kid_veg: 1 }, vol);
    expect(r1.givenTotal).toBe(2);
    expect(r1.party.booking.left.total).toBe(2);
    expect(r1.party.booking.left.adult_non_veg).toBe(1);
    // a later scan shows what is still owed
    const again = (await loadFoodParty(dinner, das.reg.id))!;
    expect(again.booking.left.total).toBe(2);
    // asking for more than is left gives only what is left
    const r2 = await giveFood(dinner, das.reg.id, { adult_non_veg: 5, kid_non_veg: 1 }, vol);
    expect(r2.givenTotal).toBe(2);
    expect(r2.short).toBe(4);
    expect(r2.party.booking.left.total).toBe(0);
    // each pass at most once in the window
    const rows = await getDb().select().from(schema.ticketScans).where(eq(schema.ticketScans.sessionId, dinner));
    expect(new Set(rows.map((x) => x.ticketId)).size).toBe(rows.length);
    expect(rows.length).toBe(4);
  });

  it("12. two phones racing for the last plate — exactly one wins", async () => {
    const fam = await seedReg({ conf: "PRG-2026-0102", email: "race@example.com" }, [{ first: "Solo", type: "Adult all food", food: "veg" }]);
    const [a, b] = await Promise.all([
      giveFood(dinner, fam.reg.id, { adult_veg: 1 }, vol),
      giveFood(dinner, fam.reg.id, { adult_veg: 1 }, admin),
    ]);
    expect(a.givenTotal + b.givenTotal).toBe(1);
    expect(a.short + b.short).toBe(1);
  });

  it("13. unpaid is refused; a walk-in let in owing money is served", async () => {
    const unpaid = await seedReg({ conf: "PRG-2026-0103", email: "u@example.com", status: "pending_zelle_verification" }, [{ first: "Unpaid", type: "Adult all food", food: "veg" }]);
    const p = (await loadFoodParty(dinner, unpaid.reg.id))!;
    expect(p.booking.blocked).toMatch(/NOT PAID/);
    await expect(giveFood(dinner, unpaid.reg.id, { adult_veg: 1 }, vol)).rejects.toBeInstanceOf(FoodError);

    const owes = await seedReg({ conf: "PRG-2026-0104", email: "o@example.com", status: "pending_payment", source: "desk", deskState: "open", admitted: true }, [{ first: "Owes", type: "Adult all food", food: "veg" }]);
    const r = await giveFood(dinner, owes.reg.id, { adult_veg: 1 }, vol);
    expect(r.givenTotal).toBe(1);
  });

  it("14. a refunded pass is not counted", async () => {
    const fam = await seedReg({ conf: "PRG-2026-0105", email: "v@example.com" }, [
      { first: "Keep", type: "Adult all food", food: "veg" },
      { first: "Gone", type: "Adult all food", food: "veg" },
    ]);
    const { ensureRefundSchema } = await import("../src/lib/refunds");
    await ensureRefundSchema();
    await getDb().insert(schema.ticketVoids).values({ ticketId: fam.tix[1].id, registrationId: fam.reg.id });
    const p = (await loadFoodParty(dinner, fam.reg.id))!;
    expect(p.booking.booked.total).toBe(1);
    expect(p.booking.people.map((x) => x.name)).toEqual(["Keep Das"]);
  });

  it("16. undo — the plate is owed again; volunteers only their own, recently", async () => {
    const fam = await seedReg({ conf: "PRG-2026-0106", email: "undo@example.com" }, [{ first: "Undo", type: "Adult all food", food: "non_veg" }]);
    await giveOne(dinner, fam.tix[0].id, vol);
    await expect(undoGive(dinner, fam.tix[0].id, { userId: "vol-2", role: "volunteer" })).rejects.toBeInstanceOf(FoodError);
    const p = (await undoGive(dinner, fam.tix[0].id, vol))!;
    expect(p.booking.left.total).toBe(1);
    const audit = await getDb().select().from(schema.auditLog).where(and(eq(schema.auditLog.action, "meal_undo"), eq(schema.auditLog.entityId, fam.tix[0].id)));
    expect(audit).toHaveLength(1);
  });

  it("17. change a plate at the line — counts move; a child cannot be given an adult plate under the age", async () => {
    const fam = await seedReg({ conf: "PRG-2026-0107", email: "chg@example.com" }, [
      { first: "Mum", type: "Adult all food", food: "veg" },
      { first: "Teen", type: "Child all", food: "kid_veg", age: 14 },
      { first: "Small", type: "Child all", food: "kid_veg", age: 7 },
    ]);
    let p = (await changePlate(dinner, fam.tix[0].id, "adult_non_veg", vol))!;
    expect(p.booking.booked.adult_non_veg).toBe(1);
    expect(p.booking.booked.adult_veg).toBe(0);
    p = (await changePlate(dinner, fam.tix[1].id, "adult_veg", vol))!;
    expect(p.booking.booked.adult_veg).toBe(1);
    await expect(changePlate(dinner, fam.tix[2].id, "adult_veg", vol)).rejects.toBeInstanceOf(FoodError);
  });

  it("18. off-list plates count in the window, not in any family", async () => {
    await addExtras(dinner, "adult_veg", 3, "Volunteer", null, vol);
    await expect(addExtras(dinner, "adult_veg", 1, "Other", "", vol)).rejects.toBeInstanceOf(FoodError);
    const s = (await windowStats(dinner))!;
    expect(s.extras.adult_veg).toBe(3);
    expect(s.extras.total).toBe(3);
    expect(s.recent.some((r) => r.kind === "extra")).toBe(true);
  });

  it("19. the family's other booking (same email / phone, or a desk add-on) is linked", async () => {
    const more = await seedReg({ conf: "PRG-2026-0108", email: "DAS@example.com " }, [{ first: "Late", type: "Child all", food: "kid_non_veg", age: 6 }]);
    const byPhone = await seedReg({ conf: "PRG-2026-0109", email: "other@example.com", phone: "(215) 555 0101" }, [{ first: "Phone", type: "Adult all food", food: "veg" }]);
    const addOn = await seedReg({ conf: "PRG-2026-0110", email: "", parent: das.reg.id, source: "desk", deskState: "settled" }, [{ first: "Desk", type: "Adult all food", food: "veg" }]);
    const p = (await loadFoodParty(dinner, das.reg.id))!;
    const ids = p.linked.map((l) => l.registrationId);
    expect(ids).toContain(more.reg.id);
    expect(ids).toContain(byPhone.reg.id);
    expect(ids).toContain(addOn.reg.id);
    expect(p.linked.find((l) => l.registrationId === more.reg.id)?.leftTotal).toBe(1);
  });

  it("20. a closed window refuses", async () => {
    await expect(giveFood(lunch, das.reg.id, { adult_non_veg: 1 }, vol)).rejects.toThrow(/closed/);
  });

  it("dashboard: booked / given / left and part-served families", async () => {
    const fam = await seedReg({ conf: "PRG-2026-0111", email: "part@example.com" }, [
      { first: "P1", type: "Adult all food", food: "non_veg" },
      { first: "P2", type: "Adult all food", food: "non_veg" },
    ]);
    await giveFood(dinner, fam.reg.id, { adult_non_veg: 1 }, vol);
    const s = (await windowStats(dinner))!;
    expect(s.given.total + s.left.total).toBe(s.booked.total);
    expect(s.owed.some((o) => o.registrationId === fam.reg.id && o.left === 1)).toBe(true);
  });

  it("name search finds the booking from an attendee's name", async () => {
    const r = await foodLookup(dinner, "Bubai");
    expect(r.kind).toBe("party");
    const none = await foodLookup(dinner, "Nobody-Here");
    expect(none.kind).toBe("none");
    const other = await foodLookup(dinner, "PRAGATI-TKT-does-not-exist");
    expect(other.kind === "none" && other.reason).toMatch(/NOT OUR TICKET/);
  });
});

describe("checkout (6, 8)", () => {
  it("6/8. an under-5 always gets a free pass; a teen's adult plate costs the same; a child's adult plate is coerced", async () => {
    const res = await createCheckout({
      eventId,
      buyerName: "Kundu Parent",
      buyerEmail: "kundu@example.com",
      buyerPhone: "2155550199",
      isMemberPurchase: false,
      paymentMethod: "zelle",
      attendees: [
        { firstName: "Parent", isKid: false, days: DAYS, withFood: true, foodPref: "non_veg" },
        { firstName: "Teen", isKid: true, age: 14, days: DAYS, withFood: true, foodPref: "veg" },
        { firstName: "Kiddo", isKid: true, age: 8, days: DAYS, withFood: true, foodPref: "non_veg" },
        { firstName: "Baby", isKid: true, age: 2, days: DAYS, withFood: true, foodPref: "kid_veg" },
      ],
    });
    const db = getDb();
    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.confirmationNumber, res.confirmationNumber));
    const tix = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id));
    const by = (n: string) => tix.find((t) => t.attendeeFirstName === n)!;
    expect(by("Teen").foodPref).toBe("veg"); // 14 may have the adult plate
    expect(by("Teen").priceCents).toBe(3000); // same youth price
    expect(by("Kiddo").foodPref).toBe("kid_non_veg"); // 8 → kid plate, same diet
    expect(by("Baby")).toBeTruthy(); // under-5 gets a pass of their own
    expect(by("Baby").priceCents).toBe(0);
    expect(by("Baby").foodPref).toBe("kid_veg");
    expect(res.totalCents).toBe(10000 + 3000 + 3000);
    // paying never counts the free under-5 against the youth pass's seats
    await markRegistrationPaid(reg.id, { method: "zelle", adminUserId: "admin-1" });
    const [child] = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, tt["Child all"]));
    expect(child.soldCount).toBe(2); // Teen + Kiddo; Baby borrows the type for free
  });
});
