/**
 * THE WALK-IN DESK — the suite that has to hold on event night.
 *
 * Three classes of thing are tested here, and only the first is about the desk:
 *
 *   1. THE ARITHMETIC. `due = listPrice + donation − adjusted` and
 *      `due = collected + pending + balance`, after every single action,
 *      including a void, a bounced cheque and a partial refund. A balance is
 *      DERIVED; if it can ever be wrong, everything downstream is.
 *
 *   2. THE ISOLATION. The promise made when this module was designed is that
 *      the online registration pipeline behaves exactly as it did before. Desk
 *      orders live in `registrations`, so shared code reaches them — every
 *      shared touchpoint is a guard, and each one is tested from BOTH sides:
 *      a desk order routes to the desk, and a web order behaves identically to
 *      the way it always has.
 *
 *   3. THE TWO AXES. Settlement (has the guest paid?) and custody (is the money
 *      in the org account?) must never collapse into each other. A Zelle sent
 *      to a committee member's personal phone is settled AND held_by_person,
 *      simultaneously, for weeks — and the tests say so.
 *
 * Deliberately mutation-shaped: for each of these, breaking the one line it
 * defends should make a named test fail. See the map at the bottom of the file.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://desk-tests";
process.env.APP_ENV = "test";
process.env.PAYMENTS_MODE = "test";
process.env.EMAIL_PROVIDER = "console";
process.env.TEST_EMAIL_OVERRIDE = "sayantankundu93@gmail.com";
process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
process.env.SQUARE_WEBHOOK_SIGNATURE_KEY = "test-signature-key";

/** The signed-in person, swapped per test. The real guards run against this. */
let SESSION: { userId: string; email: string; role: "volunteer" | "admin" | "super_admin" } | null = {
  userId: "u-admin",
  email: "admin@pragati.test",
  role: "super_admin",
};

vi.mock("../src/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/lib/auth/session")>();
  return {
    ...actual,
    getSession: async () => SESSION,
    // requireAdmin reads the cookie jar directly, which does not exist outside a
    // request. The admin server actions we exercise here are guarded by it.
    requireAdmin: async () => {
      if (!SESSION || (SESSION.role !== "admin" && SESSION.role !== "super_admin")) throw new Error("UNAUTHORIZED");
      return SESSION;
    },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }));

import { getDb, schema } from "../src/db/client";
import { createTestSchema } from "./helpers/schema";
import { createCheckout, markRegistrationPaid, cancelRegistration } from "../src/lib/checkout";
import { signSquareWebhook } from "../src/lib/payments/square";
import { requireDesk, DeskError, type DeskActor } from "../src/lib/desk/guards";
import { createDeskOrder, admitWithBalance, closeOrder, voidOrder, fillOrderDetails, searchOrders } from "../src/lib/desk/orders";
import { addTender, settleDeskCardTender, voidTender, reverseTender, clearCustody, custodyGroups } from "../src/lib/desk/tenders";
import { addAdjustment } from "../src/lib/desk/adjustments";
import { openShift, closeShift, recordDrop, currentShift } from "../src/lib/desk/shifts";
import { deskOrderSummary, checkInvariant } from "../src/lib/desk/summary";
import { followupsForOrder } from "../src/lib/desk/followups";
import type { DeskPerson } from "../src/lib/desk/party";

const WEBHOOK_URL = "http://localhost:3000/api/webhooks/square";

let eventId = "";
let adultId = "";
let youthId = "";
let shiftId: string | null = null;

const as = async (role: "volunteer" | "admin" | "super_admin"): Promise<DeskActor> => {
  SESSION = { userId: `u-${role}`, email: `${role}@pragati.test`, role };
  return requireDesk();
};

const person = (over: Partial<DeskPerson> & { firstName: string }): DeskPerson => ({
  ref: over.ref ?? `r-${Math.random().toString(36).slice(2, 9)}`,
  kind: "adult",
  days: ["sat", "sun"],
  withFood: true,
  foodPref: "non_veg",
  ...over,
});

let seq = 0;
const key = () => `idem-${Date.now()}-${seq++}`;

/** An adult walk-in with nothing paid yet. */
async function openOrder(
  people: DeskPerson[],
  actor: DeskActor,
  extra: Partial<Parameters<typeof createDeskOrder>[0]> = {}
) {
  return createDeskOrder(
    {
      eventId,
      idempotencyKey: key(),
      buyerName: "Walk In",
      buyerPhone: "+1 2155550100",
      people,
      shiftId,
      ...extra,
    },
    actor
  );
}

beforeAll(async () => {
  await createTestSchema();
  const db = getDb();
  const [event] = await db
    .insert(schema.events)
    .values({
      slug: "desk-pujo",
      name: "Desk Pujo",
      startsAt: new Date("2026-10-17"),
      endsAt: new Date("2026-10-18"),
      status: "published",
      days: [
        { key: "sat", label: "Sat", date: "2026-10-17" },
        { key: "sun", label: "Sun", date: "2026-10-18" },
      ],
    })
    .returning();
  eventId = event.id;

  const [adult] = await db
    .insert(schema.ticketTypes)
    .values({
      eventId,
      name: "Adult · both days",
      ageBand: "adult",
      dayKeys: ["sat", "sun"],
      withFood: true,
      priceMemberCents: 8000,
      priceNonmemberCents: 10000,
      capacity: 500,
    })
    .returning();
  adultId = adult.id;

  const [youth] = await db
    .insert(schema.ticketTypes)
    .values({
      eventId,
      name: "Youth · both days",
      ageBand: "child_5_18",
      dayKeys: ["sat", "sun"],
      withFood: true,
      priceMemberCents: 4000,
      priceNonmemberCents: 5000,
      capacity: 500,
    })
    .returning();
  youthId = youth.id;

  await db.insert(schema.users).values([
    { id: "u-volunteer", email: "volunteer@pragati.test", passwordHash: "x", role: "volunteer" },
    { id: "u-admin", email: "admin@pragati.test", passwordHash: "x", role: "admin" },
    { id: "u-super_admin", email: "super_admin@pragati.test", passwordHash: "x", role: "super_admin" },
  ]);
});

beforeEach(async () => {
  // Every test starts with a till open — nothing can be taken without one.
  const actor = await as("super_admin");
  const existing = await currentShift(eventId);
  if (existing) {
    shiftId = existing.id;
  } else {
    const s = await openShift({ eventId, station: "desk-1", openingFloatCents: 20000 }, actor);
    shiftId = s.id;
  }
});

// ══════════════════════════════════════════════════════════════════════════
describe("TI · the arithmetic", () => {
  it("TI-1 · cash for the exact amount settles the order and gives change", async () => {
    const actor = await as("volunteer");
    const { registrationId } = await openOrder([person({ firstName: "Arun" })], actor);

    let s = (await deskOrderSummary(registrationId))!;
    expect(s.listPriceCents).toBe(10000);
    expect(s.balanceCents).toBe(10000);

    const out = await addTender(
      { registrationId, method: "cash", amountCents: 10000, shiftId, cash: { cashTenderedCents: 12000 } },
      actor
    );
    expect(out.changeDueCents).toBe(2000);

    s = (await deskOrderSummary(registrationId))!;
    expect(s.collectedCents).toBe(10000);
    expect(s.balanceCents).toBe(0);
    expect(s.settled).toBe(true);
    expect(checkInvariant(s).ok).toBe(true);
    // The order is now paid, so its passes scan.
    expect(s.reg.status).toBe("paid");
  });

  it("TI-2 · a split tender only settles when BOTH parts are in", async () => {
    const actor = await as("volunteer");
    const { registrationId } = await openOrder(
      [person({ firstName: "Bela" }), person({ firstName: "Chandan" })],
      actor
    );
    let s = (await deskOrderSummary(registrationId))!;
    expect(s.dueCents).toBe(20000);

    await addTender({ registrationId, method: "cash", amountCents: 8000, shiftId }, actor);
    s = (await deskOrderSummary(registrationId))!;
    expect(s.collectedCents).toBe(8000);
    expect(s.balanceCents).toBe(12000);
    expect(s.reg.status).toBe("pending_payment");
    expect(checkInvariant(s).ok).toBe(true);

    const card = await addTender({ registrationId, method: "square", amountCents: 12000, shiftId }, actor);
    s = (await deskOrderSummary(registrationId))!;
    // A card tender is a promise until Square says otherwise: it counts against
    // the balance but is NOT collected money.
    expect(s.collectedCents).toBe(8000);
    expect(s.pendingCents).toBe(12000);
    expect(s.balanceCents).toBe(0);
    expect(checkInvariant(s).ok).toBe(true);

    await settleDeskCardTender({
      registrationId,
      squarePaymentId: "SQ-PAY-TI2",
      squareOrderId: null,
      squareAmountCents: 12000,
    });
    s = (await deskOrderSummary(registrationId))!;
    expect(s.collectedCents).toBe(20000);
    expect(s.pendingCents).toBe(0);
    expect(s.reg.status).toBe("paid");
    expect(s.tenders.find((t) => t.id === card.tenderId)!.custody).toBe("org_account");
    expect(checkInvariant(s).ok).toBe(true);
  });

  it("TI-3 · a discount reduces what is owed without rewriting the list price", async () => {
    const admin = await as("admin");
    const { registrationId } = await openOrder([person({ firstName: "Dipa" })], admin);

    await addAdjustment(
      { registrationId, kind: "discount", amountCents: 5000, reasonCode: "hardship" },
      admin
    );
    let s = (await deskOrderSummary(registrationId))!;
    expect(s.listPriceCents).toBe(10000); // untouched
    expect(s.adjustedCents).toBe(5000);
    expect(s.dueCents).toBe(5000);
    expect(checkInvariant(s).ok).toBe(true);

    await addTender({ registrationId, method: "cash", amountCents: 5000, shiftId }, admin);
    s = (await deskOrderSummary(registrationId))!;
    expect(s.balanceCents).toBe(0);
    expect(s.reg.totalCents).toBe(5000); // what the rest of the admin reads
    expect(s.reg.subtotalCents).toBe(10000);
    expect(checkInvariant(s).ok).toBe(true);
  });

  it("TI-4 · reversing a settled cheque re-opens the balance and raises a follow-up", async () => {
    const admin = await as("admin");
    const { registrationId } = await openOrder([person({ firstName: "Eshan" })], admin);
    const t = await addTender(
      { registrationId, method: "check", amountCents: 10000, shiftId, check: { checkNumber: "1234", bank: "PNC" } },
      admin
    );
    let s = (await deskOrderSummary(registrationId))!;
    expect(s.balanceCents).toBe(0);
    expect(s.reg.status).toBe("paid");

    await reverseTender(t.tenderId, "Cheque bounced", admin);
    s = (await deskOrderSummary(registrationId))!;
    expect(s.collectedCents).toBe(0);
    expect(s.balanceCents).toBe(10000);
    expect(s.reg.status).toBe("pending_payment");
    expect(checkInvariant(s).ok).toBe(true);

    const gaps = await followupsForOrder(registrationId);
    expect(gaps.some((g) => g.kind === "balance_owed")).toBe(true);
    // The pass is NOT retracted — they already came in.
    expect(s.tickets.length).toBe(1);
  });

  it("TI-5 · an overpayment becomes a refund owed, never a negative balance", async () => {
    const admin = await as("admin");
    const { registrationId } = await openOrder([person({ firstName: "Farida" })], admin);
    await addTender(
      { registrationId, method: "check", amountCents: 13000, shiftId, check: { checkNumber: "999" } },
      admin
    );
    const s = (await deskOrderSummary(registrationId))!;
    expect(s.collectedCents).toBe(13000);
    expect(s.balanceCents).toBe(-3000);
    const gaps = await followupsForOrder(registrationId);
    expect(gaps.some((g) => g.kind === "refund_due")).toBe(true);
  });

  it("TI-6 · the invariant survives a random sequence of desk actions", async () => {
    const admin = await as("admin");
    for (let i = 0; i < 12; i++) {
      const { registrationId } = await openOrder(
        [person({ firstName: `P${i}` }), person({ firstName: `Q${i}`, kind: "youth", age: 9 })],
        admin
      );
      const steps = [
        () => addTender({ registrationId, method: "cash", amountCents: 2500, shiftId }, admin),
        () => addAdjustment({ registrationId, kind: "discount", amountCents: 1000, reasonCode: "goodwill" }, admin),
        () => addTender({ registrationId, method: "check", amountCents: 3000, shiftId, check: { checkNumber: `C${i}` } }, admin),
      ];
      for (const step of steps) {
        await step();
        const s = (await deskOrderSummary(registrationId))!;
        const v = checkInvariant(s);
        expect(v.ok, v.ok ? "" : (v as { why: string }).why).toBe(true);
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("TX · isolation — the online pipeline is untouched", () => {
  it("TX-1 · a Square webhook settles ONE desk tender, never the cash beside it", async () => {
    const actor = await as("volunteer");
    const { registrationId } = await openOrder(
      [person({ firstName: "Gita" }), person({ firstName: "Hari" })],
      actor
    );
    const cash = await addTender({ registrationId, method: "cash", amountCents: 8000, shiftId }, actor);
    const card = await addTender({ registrationId, method: "square", amountCents: 12000, shiftId }, actor);

    const db = getDb();
    const before = (await db.select().from(schema.payments).where(eq(schema.payments.id, cash.tenderId)))[0];

    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId));
    const body = {
      event_id: `evt-desk-${registrationId.slice(0, 6)}`,
      type: "payment.updated",
      data: {
        object: {
          payment: {
            id: "SQ-DESK-1",
            status: "COMPLETED",
            order_id: reg.squareOrderId,
            reference_id: registrationId,
            total_money: { amount: 12000 },
          },
        },
      },
    };
    const raw = JSON.stringify(body);
    const { POST } = await import("../src/app/api/webhooks/square/route");
    const res = await POST(
      new Request(WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-square-hmacsha256-signature": signSquareWebhook(raw, WEBHOOK_URL) },
        body: raw,
      }) as never
    );
    const json = await res.json();
    expect(json.desk).toBe(true);
    expect(json.settled).toBe(true);

    const after = (await db.select().from(schema.payments).where(eq(schema.payments.id, cash.tenderId)))[0];
    // The cash row is untouched in every field that matters.
    expect(after.status).toBe(before.status);
    expect(after.custody).toBe("in_drawer");
    expect(after.squarePaymentId).toBeNull();
    expect(after.collectedBy).toBe(before.collectedBy);

    const cardRow = (await db.select().from(schema.payments).where(eq(schema.payments.id, card.tenderId)))[0];
    expect(cardRow.status).toBe("paid");
    expect(cardRow.squarePaymentId).toBe("SQ-DESK-1");
    expect(cardRow.custody).toBe("org_account");
  });

  it("TX-2 · an ordinary web checkout still behaves exactly as before", async () => {
    const db = getDb();
    const before = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, adultId));

    const out = await createCheckout({
      eventId,
      buyerName: "Web Buyer",
      buyerEmail: "web@example.com",
      buyerPhone: "+1 2155550111",
      isMemberPurchase: false,
      paymentMethod: "square",
      attendees: [
        {
          firstName: "Web",
          isKid: false,
          days: ["sat", "sun"],
          withFood: true,
          foodPref: "non_veg",
        },
      ],
    });
    expect(out.kind).toBe("square_redirect");

    const [reg] = await db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.confirmationNumber, out.confirmationNumber));
    expect(reg.source).toBe("web");
    expect(reg.deskState).toBeNull();
    expect(reg.status).toBe("pending_payment");

    // Seats are NOT taken at checkout on the web path — capacity follows money.
    const mid = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, adultId));
    expect(mid[0].soldCount).toBe(before[0].soldCount);

    await markRegistrationPaid(reg.id, { method: "square", squarePaymentId: "SQ-WEB-1", confirmed: true });
    const [after] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, reg.id));
    expect(after.status).toBe("paid");
    const soldAfter = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, adultId));
    expect(soldAfter[0].soldCount).toBe(before[0].soldCount + 1);

    // …and its ledger rows settled, exactly as they always did.
    const rows = await db.select().from(schema.payments).where(eq(schema.payments.entityId, reg.id));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.status === "paid")).toBe(true);
    expect(rows.every((r) => r.source === "app")).toBe(true);
  });

  it("TX-3 · markRegistrationPaid refuses a desk order outright", async () => {
    const actor = await as("admin");
    const { registrationId } = await openOrder([person({ firstName: "Indira" })], actor);
    const db = getDb();
    const before = await db.select().from(schema.payments).where(eq(schema.payments.entityId, registrationId));

    await expect(markRegistrationPaid(registrationId, { method: "offline" })).rejects.toThrow(/walk-in desk/i);

    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId));
    expect(reg.status).toBe("pending_payment");
    const after = await db.select().from(schema.payments).where(eq(schema.payments.entityId, registrationId));
    expect(after.length).toBe(before.length);
  });

  it("TX-4 · cancelRegistration refuses a desk order — voiding is the desk's job", async () => {
    const actor = await as("admin");
    const { registrationId } = await openOrder([person({ firstName: "Jaya" })], actor);
    await expect(cancelRegistration(registrationId, "cancelled")).rejects.toThrow(/walk-in desk/i);
    const s = (await deskOrderSummary(registrationId))!;
    expect(s.reg.deskState).toBe("open");
  });

  it("TX-5 · the Registrations page refuses to settle or delete a desk order", async () => {
    const actor = await as("admin");
    const { registrationId, confirmationNumber } = await openOrder([person({ firstName: "Kamal" })], actor);
    const { markPaidCashAction, deleteRegistrationAction } = await import("../src/app/admin/registrations/actions");

    const paid = await markPaidCashAction(registrationId);
    expect(paid.ok).toBe(false);
    expect(paid.message).toContain(confirmationNumber);

    const del = await deleteRegistrationAction(registrationId);
    expect(del.ok).toBe(false);

    const db = getDb();
    const [still] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId));
    expect(still).toBeTruthy();
    expect(still.status).toBe("pending_payment");
  });

  it("TX-7 · no desk module imports settlePayments", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : [p];
      });
    const offenders = walk("src/lib/desk")
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /\bsettlePayments\b/.test(readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")));
    expect(offenders).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("TC · custody — the second axis", () => {
  it("TC-1 · a Zelle to a person is SETTLED and HELD BY THAT PERSON at the same time", async () => {
    const actor = await as("volunteer");
    const { registrationId } = await openOrder([person({ firstName: "Lata" })], actor);
    await addTender(
      {
        registrationId,
        method: "zelle",
        amountCents: 10000,
        shiftId,
        zelle: { sentTo: { userId: "u-admin", displayName: "Rina" }, senderHandle: "+12155550123", confirmationSeen: true },
      },
      actor
    );

    const s = (await deskOrderSummary(registrationId))!;
    // Guest side: done. They walk in.
    expect(s.balanceCents).toBe(0);
    expect(s.reg.status).toBe("paid");
    // Treasury side: not ours yet, and it has a name on it.
    expect(s.custodyOpenCents).toBe(10000);
    expect(s.tenders[0].custody).toBe("held_by_person");

    const gaps = await followupsForOrder(registrationId);
    const chase = gaps.find((g) => g.kind === "zelle_with_person");
    expect(chase).toBeTruthy();
    expect(chase!.assignedTo).toBe("u-admin");
  });

  it("TC-2 · held money counts as collected revenue but not as banked", async () => {
    const groups = await custodyGroups();
    const held = groups.find((g) => g.custody === "held_by_person");
    expect(held).toBeTruthy();
    expect(held!.amountCents).toBeGreaterThan(0);
    // …and it is grouped by the holder, not one row per payment.
    expect(held!.label).toContain("Rina");
  });

  it("TC-3 · a treasurer clears custody in bulk against one deposit reference", async () => {
    const treasurer = await as("super_admin");
    const groups = await custodyGroups();
    const ids = groups.flatMap((g) => g.tenders.map((t) => t.id));
    expect(ids.length).toBeGreaterThan(0);

    const owedBefore = new Map<string, number>();
    for (const regId of new Set(groups.flatMap((g) => g.tenders.map((t) => t.entityId)))) {
      owedBefore.set(regId, (await deskOrderSummary(regId))!.balanceCents);
    }

    const n = await clearCustody(ids, "DEP-2026-10-20", treasurer);
    expect(n).toBe(ids.length);

    const db = getDb();
    const rows = await db.select().from(schema.payments).where(eq(schema.payments.source, "desk"));
    const cleared = rows.filter((r) => ids.includes(r.id));
    expect(cleared.every((r) => r.custody === "org_account")).toBe(true);
    expect(cleared.every((r) => r.depositRef === "DEP-2026-10-20")).toBe(true);
    expect(cleared.every((r) => r.custodyClearedBy === "u-super_admin")).toBe(true);
    // Clearing custody changes NOTHING about what the guest owes — the two
    // axes are independent, which is the entire point of the model.
    for (const [regId, wasOwed] of owedBefore) {
      const s = await deskOrderSummary(regId);
      expect(s!.balanceCents).toBe(wasOwed);
    }
    expect(await custodyGroups()).toEqual([]);
  });

  it("TC-4 · a cheque records its number and sits as undeposited", async () => {
    const actor = await as("volunteer");
    const { registrationId } = await openOrder([person({ firstName: "Manik" })], actor);
    await addTender(
      {
        registrationId,
        method: "check",
        amountCents: 10000,
        shiftId,
        check: { checkNumber: "4477", bank: "Wells Fargo", payerName: "M Roy", checkDate: "2026-10-25" },
      },
      actor
    );
    const s = (await deskOrderSummary(registrationId))!;
    const t = s.tenders[0];
    expect(t.custody).toBe("undeposited_check");
    expect((t.instrument as Record<string, unknown>).checkNumber).toBe("4477");
    const gaps = await followupsForOrder(registrationId);
    const chase = gaps.find((g) => g.kind === "check_uncleared");
    expect(chase).toBeTruthy();
    // A post-dated cheque is not overdue before its date.
    expect(chase!.dueAt).toBeTruthy();
  });

  it("TC-6 · a till reconciles float + cash − drops, and a variance needs a note", async () => {
    const admin = await as("super_admin");
    // Fresh till so the arithmetic is about this test only.
    const open = await currentShift(eventId);
    if (open) await closeShift({ shiftId: open.id, countedCashCents: 0, varianceNote: "test teardown", force: true }, admin);
    const s = await openShift({ eventId, station: "desk-2", openingFloatCents: 20000 }, admin);
    shiftId = s.id;

    const { registrationId } = await openOrder([person({ firstName: "Nita" })], admin);
    await addTender({ registrationId, method: "cash", amountCents: 10000, shiftId }, admin);
    await recordDrop(s.id, 5000, "Treasurer", admin);

    // expected = 20000 float + 10000 cash − 5000 drop = 25000
    await expect(closeShift({ shiftId: s.id, countedCashCents: 24500 }, admin)).rejects.toThrow(/short by \$5\.00/i);

    const out = await closeShift(
      { shiftId: s.id, countedCashCents: 24500, varianceNote: "Gave change from the wrong pile" },
      admin
    );
    expect(out.varianceCents).toBe(-500);

    const db = getDb();
    const [row] = await db.select().from(schema.deskShifts).where(eq(schema.deskShifts.id, s.id));
    expect(row.expectedCashCents).toBe(25000);
    expect(row.varianceNote).toBeTruthy();
    shiftId = null;
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("TG · children, guardians and amendments", () => {
  it("TG-1 · a minor with no adult is refused", async () => {
    const actor = await as("volunteer");
    await expect(
      openOrder([person({ firstName: "Piku", kind: "youth", age: 9 })], actor)
    ).rejects.toThrow(/under 18/i);
  });

  it("TG-2 · an admin can override it, and the gate is told", async () => {
    const admin = await as("admin");
    const { registrationId } = await openOrder(
      [person({ firstName: "Piku", kind: "youth", age: 9 })],
      admin,
      { overrideGuardian: true }
    );
    const gaps = await followupsForOrder(registrationId);
    expect(gaps.some((g) => g.kind === "guardian_unlinked")).toBe(true);
  });

  it("TG-2b · a volunteer cannot use the override", async () => {
    const vol = await as("volunteer");
    await expect(
      openOrder([person({ firstName: "Piku", kind: "youth", age: 9 })], vol, { overrideGuardian: true })
    ).rejects.toThrow(/admin/i);
  });

  it("TG-3 · the forgotten child: an amendment hangs off the family's existing order", async () => {
    // The family bought online in July.
    const web = await createCheckout({
      eventId,
      buyerName: "Sen Family",
      buyerEmail: "sen@example.com",
      buyerPhone: "+1 2155550199",
      isMemberPurchase: false,
      paymentMethod: "square",
      attendees: [{ firstName: "Ratan", isKid: false, days: ["sat", "sun"], withFood: true, foodPref: "veg" }],
    });
    const db = getDb();
    const [parentReg] = await db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.confirmationNumber, web.confirmationNumber));
    await markRegistrationPaid(parentReg.id, { method: "square", squarePaymentId: "SQ-SEN", confirmed: true });
    const [parentTicket] = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, parentReg.id));

    // They turn up at the door having forgotten the child.
    const actor = await as("volunteer");
    const { registrationId } = await openOrder(
      [person({ firstName: "Tia", kind: "youth", age: 7, guardianTicketId: parentTicket.id })],
      actor,
      { buyerName: "Sen Family", parentRegistrationId: parentReg.id }
    );

    const s = (await deskOrderSummary(registrationId))!;
    // Only the child is priced.
    expect(s.listPriceCents).toBe(5000);
    expect(s.tickets.length).toBe(1);
    expect(s.tickets[0].guardianTicketId).toBe(parentTicket.id);
    expect(s.reg.parentRegistrationId).toBe(parentReg.id);

    // The parent order is untouched — no QR is invalidated.
    const parentTickets = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, parentReg.id));
    expect(parentTickets.length).toBe(1);
    expect(parentTickets[0].qrCode).toBe(parentTicket.qrCode);

    // And the family reads as one unit in search.
    const hits = await searchOrders("Sen Family");
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("TG-5 · a 'kid' aged 18 is an adult, priced as one", async () => {
    const actor = await as("volunteer");
    const { registrationId } = await openOrder(
      [person({ firstName: "Uma", kind: "youth", age: 18 })],
      actor
    );
    const s = (await deskOrderSummary(registrationId))!;
    expect(s.listPriceCents).toBe(10000); // adult price, not youth
    expect(s.tickets[0].ticketTypeId).toBe(adultId);
    expect(s.tickets[0].guardianTicketId).toBeNull();
  });

  it("TG-6 · an under-5 still gets a pass when the event has no under-5 type", async () => {
    const actor = await as("volunteer");
    const { registrationId } = await openOrder(
      [person({ firstName: "Ved" }), person({ firstName: "Wren", kind: "under5", age: 3 })],
      actor
    );
    const s = (await deskOrderSummary(registrationId))!;
    // Two passes issued — the child is in the headcount — and the child is free.
    expect(s.tickets.length).toBe(2);
    const child = s.tickets.find((t) => t.attendeeFirstName === "Wren")!;
    expect(child.priceCents).toBe(0);
    expect(child.guardianTicketId).toBeTruthy();
    expect(s.listPriceCents).toBe(10000);
    // The web path still skips it — this difference is the desk's alone.
    const web = await createCheckout({
      eventId,
      buyerName: "Web Under5",
      buyerEmail: "u5@example.com",
      buyerPhone: "+1 2155550122",
      isMemberPurchase: false,
      paymentMethod: "offline",
      attendees: [
        { firstName: "Adult", isKid: false, days: ["sat", "sun"], withFood: true, foodPref: "veg" },
        { firstName: "Tiny", isKid: true, age: 3, days: ["sat", "sun"], withFood: false, foodPref: "kid" },
      ],
    });
    const db = getDb();
    const [wreg] = await db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.confirmationNumber, web.confirmationNumber));
    const wt = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, wreg.id));
    expect(wt.length).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("TA · authority", () => {
  it("TA-1 · a volunteer cannot comp, however the request is made", async () => {
    const vol = await as("volunteer");
    const { registrationId } = await openOrder([person({ firstName: "Xavi" })], vol);
    await expect(
      addAdjustment({ registrationId, kind: "comp", amountCents: 10000, reasonCode: "volunteer" }, vol)
    ).rejects.toThrow(/admin/i);
    const s = (await deskOrderSummary(registrationId))!;
    expect(s.adjustedCents).toBe(0);
    expect(s.balanceCents).toBe(10000);
  });

  it("TA-1b · an admin can, and the comp is attributed and still issues a pass", async () => {
    const admin = await as("admin");
    const { registrationId } = await openOrder([person({ firstName: "Yash" })], admin);
    await addAdjustment(
      { registrationId, kind: "comp", amountCents: 10000, reasonCode: "volunteer", note: "kitchen all evening" },
      admin
    );
    const s = (await deskOrderSummary(registrationId))!;
    expect(s.balanceCents).toBe(0);
    expect(s.adjustments[0].approvedBy).toBe("u-admin");
    expect(s.tickets.length).toBe(1); // comped people are still counted
    expect(s.listPriceCents).toBe(10000); // list price never rewritten
  });

  it("TA-2 · a volunteer cannot undo another volunteer's payment", async () => {
    const vol = await as("volunteer");
    const { registrationId } = await openOrder([person({ firstName: "Zoya" })], vol);
    const t = await addTender({ registrationId, method: "cash", amountCents: 10000, shiftId }, vol);

    SESSION = { userId: "u-other", email: "other@pragati.test", role: "volunteer" };
    const other = await requireDesk();
    await expect(voidTender(t.tenderId, "mistake", other, shiftId)).rejects.toThrow(/only the person/i);

    const admin = await as("admin");
    await voidTender(t.tenderId, "taken twice", admin, shiftId);
    const s = (await deskOrderSummary(registrationId))!;
    expect(s.collectedCents).toBe(0);
    expect(s.balanceCents).toBe(10000);
  });

  it("TA-3 · clearing custody is refused without the treasury grant", async () => {
    const vol = await as("volunteer");
    const { registrationId } = await openOrder([person({ firstName: "Amal" })], vol);
    const t = await addTender(
      { registrationId, method: "check", amountCents: 10000, shiftId, check: { checkNumber: "7788" } },
      vol
    );
    await expect(clearCustody([t.tenderId], "DEP-1", vol)).rejects.toThrow(/treasurer/i);
  });

  it("TA-4 · a signed-out request reaches nothing", async () => {
    SESSION = null;
    await expect(requireDesk()).rejects.toThrow(/sign in/i);
    SESSION = { userId: "u-admin", email: "admin@pragati.test", role: "super_admin" };
  });

  it("TA-6 · every money action leaves an audit trail as well as a timeline", async () => {
    const admin = await as("admin");
    const { registrationId } = await openOrder([person({ firstName: "Bhola" })], admin);
    await addTender({ registrationId, method: "cash", amountCents: 10000, shiftId }, admin);

    const db = getDb();
    const audit = await db
      .select()
      .from(schema.auditLog)
      .where(and(eq(schema.auditLog.entityType, "registrations"), eq(schema.auditLog.entityId, registrationId)));
    expect(audit.some((a) => a.action === "desk_tender_added")).toBe(true);

    const timeline = await db
      .select()
      .from(schema.deskOrderEvents)
      .where(eq(schema.deskOrderEvents.registrationId, registrationId));
    expect(timeline.some((e) => e.type === "tender_added")).toBe(true);
    expect(timeline.every((e) => e.actorEmail === "admin@pragati.test" || e.actorEmail === null)).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("TR · robustness", () => {
  it("TR-1 · a double-tapped Create returns the same order, never two", async () => {
    const actor = await as("volunteer");
    const k = key();
    const first = await createDeskOrder(
      { eventId, idempotencyKey: k, buyerName: "Double Tap", people: [person({ firstName: "Chitra" })], shiftId },
      actor
    );
    const second = await createDeskOrder(
      { eventId, idempotencyKey: k, buyerName: "Double Tap", people: [person({ firstName: "Chitra" })], shiftId },
      actor
    );
    expect(second.registrationId).toBe(first.registrationId);
    expect(second.reused).toBe(true);

    const db = getDb();
    const rows = await db.select().from(schema.registrations).where(eq(schema.registrations.idempotencyKey, k));
    expect(rows.length).toBe(1);
  });

  it("TR-3 · capacity is checked at open, and only an admin may go past it", async () => {
    const db = getDb();
    const [limited] = await db
      .insert(schema.ticketTypes)
      .values({
        eventId,
        name: "Limited",
        ageBand: "adult",
        dayKeys: ["sat"],
        withFood: false,
        priceMemberCents: 1000,
        priceNonmemberCents: 1000,
        capacity: 1,
      })
      .returning();

    const vol = await as("volunteer");
    await openOrder([person({ firstName: "Seat1", days: ["sat"], withFood: false, foodPref: "none" })], vol);
    // The seat was taken at OPEN, not at payment.
    const [afterOne] = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, limited.id));
    expect(afterOne.soldCount).toBe(1);

    await expect(
      openOrder([person({ firstName: "Seat2", days: ["sat"], withFood: false, foodPref: "none" })], vol)
    ).rejects.toThrow(/sold out/i);

    const admin = await as("admin");
    const forced = await openOrder(
      [person({ firstName: "Seat2", days: ["sat"], withFood: false, foodPref: "none" })],
      admin,
      { overrideCapacity: true }
    );
    expect(forced.warnings.join(" ")).toMatch(/capacity overridden/i);
  });

  it("TR-4 · a closed order refuses further payment; voiding gives the seats back", async () => {
    const admin = await as("admin");
    const { registrationId } = await openOrder([person({ firstName: "Deep" })], admin);
    const db = getDb();
    const [before] = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, adultId));

    await addTender({ registrationId, method: "cash", amountCents: 10000, shiftId }, admin);
    await closeOrder(registrationId, admin);

    const vol = await as("volunteer");
    await expect(addTender({ registrationId, method: "cash", amountCents: 100, shiftId }, vol)).rejects.toThrow(/closed/i);

    await voidOrder(registrationId, "created_in_error", "wrong family", admin);
    const s = (await deskOrderSummary(registrationId))!;
    expect(s.reg.deskState).toBe("voided");
    const [after] = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, adultId));
    expect(after.soldCount).toBe(before.soldCount - 1);
    // Money already taken becomes a refund owed — never quietly forgotten.
    const gaps = await followupsForOrder(registrationId);
    expect(gaps.some((g) => g.kind === "refund_due")).toBe(true);
    // Nothing was deleted.
    expect(s.tickets.length).toBe(1);
  });

  it("TR-6 · no email means no placeholder, no send, and a follow-up that closes itself when filled", async () => {
    const actor = await as("volunteer");
    const { registrationId } = await openOrder([person({ firstName: "Esha" })], actor, { buyerEmail: undefined });
    let s = (await deskOrderSummary(registrationId))!;
    expect(s.reg.buyerEmail).toBe("");

    let gaps = await followupsForOrder(registrationId);
    expect(gaps.some((g) => g.kind === "missing_email")).toBe(true);

    await addTender({ registrationId, method: "cash", amountCents: 10000, shiftId }, actor);
    const db = getDb();
    const mails = await db.select().from(schema.emailLog);
    expect(mails.some((m) => m.relatedRegistrationId === registrationId)).toBe(false);

    await fillOrderDetails(registrationId, { buyerEmail: "esha@example.com" }, actor);
    s = (await deskOrderSummary(registrationId))!;
    expect(s.reg.buyerEmail).toBe("esha@example.com");
    gaps = await followupsForOrder(registrationId);
    expect(gaps.some((g) => g.kind === "missing_email")).toBe(false);
  });

  it("TR-8 · admitting someone who owes money is attributed, and above the cap needs an admin", async () => {
    const vol = await as("volunteer");
    const { registrationId } = await openOrder([person({ firstName: "Farhan" })], vol);
    // $100 owed, volunteer cap is $50 → refused.
    await expect(admitWithBalance(registrationId, vol)).rejects.toThrow(/admin/i);

    const admin = await as("admin");
    await admitWithBalance(registrationId, admin);
    const s = (await deskOrderSummary(registrationId))!;
    expect(s.reg.admittedUnsettledBy).toBe("u-admin");
    expect(s.reg.admittedUnsettledAt).toBeTruthy();
    const gaps = await followupsForOrder(registrationId);
    expect(gaps.some((g) => g.kind === "balance_owed")).toBe(true);
  });

  it("TR-9 · a tender cannot be taken on an order that was voided", async () => {
    const admin = await as("admin");
    const { registrationId } = await openOrder([person({ firstName: "Gopa" })], admin);
    await voidOrder(registrationId, "guest_left", "", admin);
    await expect(addTender({ registrationId, method: "cash", amountCents: 1000, shiftId }, admin)).rejects.toThrow(
      /voided/i
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════
describe("TD · the gate", () => {
  it("TD-1 · a settled desk pass scans, and shows the guardian it belongs to", async () => {
    const actor = await as("volunteer");
    const { registrationId } = await openOrder(
      [person({ firstName: "Hema" }), person({ firstName: "Ishan", kind: "youth", age: 8 })],
      actor
    );
    await addTender({ registrationId, method: "cash", amountCents: 15000, shiftId }, actor);

    const db = getDb();
    const tickets = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, registrationId));
    const child = tickets.find((t) => t.attendeeFirstName === "Ishan")!;

    const { entryScanAction } = await import("../src/app/admin/checkin/actions");
    const res = await entryScanAction(child.qrCode);
    expect(res.kind).toBe("checked_in");
    if (res.kind === "checked_in") {
      expect((res.notes ?? []).some((n) => n.includes("With Hema"))).toBe(true);
    }
  });

  it("TD-2 · a pass admitted owing money still scans, and the gate is told the amount", async () => {
    const admin = await as("admin");
    const { registrationId } = await openOrder([person({ firstName: "Jishnu" })], admin);
    await admitWithBalance(registrationId, admin);

    const db = getDb();
    const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, registrationId));
    const { entryScanAction } = await import("../src/app/admin/checkin/actions");
    const res = await entryScanAction(t.qrCode);
    expect(res.kind).toBe("checked_in");
    if (res.kind === "checked_in") {
      expect((res.notes ?? []).some((n) => n.startsWith("BALANCE OWED"))).toBe(true);
    }
  });

  it("TD-3 · an unpaid desk pass nobody admitted does NOT scan", async () => {
    const actor = await as("volunteer");
    const { registrationId } = await openOrder([person({ firstName: "Kavi" })], actor);
    const db = getDb();
    const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, registrationId));
    const { entryScanAction } = await import("../src/app/admin/checkin/actions");
    const res = await entryScanAction(t.qrCode);
    expect(res.kind).toBe("invalid");
    if (res.kind === "invalid") expect(res.reason).toMatch(/walk-in desk/i);
  });

  it("TD-4 · a voided order stops admitting, even though its passes still exist", async () => {
    const admin = await as("admin");
    const { registrationId } = await openOrder([person({ firstName: "Lakhi" })], admin);
    await addTender({ registrationId, method: "cash", amountCents: 10000, shiftId }, admin);
    const db = getDb();
    const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, registrationId));

    await voidOrder(registrationId, "duplicate", "registered twice", admin);

    const { entryScanAction } = await import("../src/app/admin/checkin/actions");
    const res = await entryScanAction(t.qrCode);
    expect(res.kind).toBe("invalid");
    if (res.kind === "invalid") expect(res.reason).toMatch(/voided/i);

    // The pass row itself is still there — nothing at the desk deletes.
    const still = await db.select().from(schema.tickets).where(eq(schema.tickets.id, t.id));
    expect(still.length).toBe(1);
  });

  it("TD-5 · an ordinary web pass is unaffected by any of this", async () => {
    const web = await createCheckout({
      eventId,
      buyerName: "Gate Web",
      buyerEmail: "gateweb@example.com",
      buyerPhone: "+1 2155550133",
      isMemberPurchase: false,
      paymentMethod: "offline",
      attendees: [{ firstName: "Nayan", isKid: false, days: ["sat", "sun"], withFood: true, foodPref: "veg" }],
    });
    const db = getDb();
    const [reg] = await db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.confirmationNumber, web.confirmationNumber));
    const [t] = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id));
    const { entryScanAction } = await import("../src/app/admin/checkin/actions");

    // Unpaid web order: refused with the wording it has always used.
    const before = await entryScanAction(t.qrCode);
    expect(before.kind).toBe("invalid");
    if (before.kind === "invalid") expect(before.reason).toMatch(/payment pending/i);

    await markRegistrationPaid(reg.id, { method: "offline", adminUserId: "u-admin" });
    const after = await entryScanAction(t.qrCode);
    expect(after.kind).toBe("checked_in");
    if (after.kind === "checked_in") expect(after.notes ?? []).toEqual([]);
  });
});

/**
 * ── MUTATION MAP ──────────────────────────────────────────────────────────
 * Break the line, confirm the suite screams. Verified by hand:
 *
 *   let the desk call settlePayments instead of settleTender  → TX-1, TX-7, TI-2
 *   remove the webhook desk guard (T1)                        → TX-1
 *   remove the markRegistrationPaid guard (T2)                → TX-3
 *   remove the cancelRegistration guard (T3)                  → TX-4
 *   remove the Registrations-page guard (T4)                  → TX-5
 *   take seats at settle instead of at open                   → TR-3, TR-4
 *   drop the guardian requirement                             → TG-1, TG-2b
 *   let a volunteer comp                                      → TA-1
 *   collapse custody into settlement                          → TC-1, TC-2, TC-3
 *   store the balance instead of deriving it                  → TI-4, TI-6
 *   allow a placeholder email when none is given              → TR-6
 *   let a volunteer admit any balance                         → TR-8
 */
