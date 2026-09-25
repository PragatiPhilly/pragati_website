/**
 * Dev-only: plant realistic PAID registrations so the Projections live-pull can
 * be verified against numbers we know by hand.
 *
 * Mirrors exactly what lib/checkout.ts writes: one registration, one ticket per
 * attendee PER DAY (carrying that day's share of a bundle price), and one
 * `payments` row per revenue stream. Never run this against production.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db/client";

type Buy = {
  buyer: string;
  typeName: string;
  qty: number;
  days: string[] | null; // null = the type's own dayKeys
  foodPref: "veg" | "non_veg" | "kid" | "none";
  member: boolean;
};

const BUYS: Buy[] = [
  // 3-day adult passes, with food — the backbone
  { buyer: "Bose family", typeName: "Adult · All 3 days · with food", qty: 4, days: null, foodPref: "non_veg", member: true },
  { buyer: "Ghosh family", typeName: "Adult · All 3 days · with food", qty: 2, days: null, foodPref: "veg", member: false },
  // 3-day adults, no food
  { buyer: "Dutta family", typeName: "Adult · All 3 days · no food", qty: 3, days: null, foodPref: "none", member: false },
  // youths on a 3-day kid meal — the segment that must NOT read as adults
  { buyer: "Bose family", typeName: "Youth (5–18) · All 3 days · kid meal", qty: 3, days: null, foodPref: "kid", member: true },
  { buyer: "Sen family", typeName: "Youth (5–18) · All 3 days · kid meal", qty: 2, days: null, foodPref: "kid", member: false },
  // under-5, free — still a head, still eats
  { buyer: "Sen family", typeName: "Little one (under 5) · free", qty: 2, days: null, foodPref: "kid", member: false },
  // single-day Saturday buyers
  { buyer: "Roy family", typeName: "Adult · Single day · with food", qty: 5, days: ["sat"], foodPref: "non_veg", member: false },
  { buyer: "Mitra family", typeName: "Adult · Single day · with food", qty: 2, days: ["sat"], foodPref: "veg", member: true },
  { buyer: "Roy family", typeName: "Adult · Single day · no food", qty: 2, days: ["sat"], foodPref: "none", member: false },
  { buyer: "Roy family", typeName: "Youth (5–18) · Single day · kid meal", qty: 3, days: ["sat"], foodPref: "kid", member: false },
  // Sunday only
  { buyer: "Das family", typeName: "Adult · Single day · with food", qty: 3, days: ["sun"], foodPref: "non_veg", member: false },
  { buyer: "Das family", typeName: "Youth (5–18) · Single day · kid meal", qty: 2, days: ["sun"], foodPref: "kid", member: false },
  // Friday only
  { buyer: "Pal family", typeName: "Adult · Single day · with food", qty: 2, days: ["fri"], foodPref: "veg", member: false },
];

const splitEven = (total: number, n: number): number[] => {
  const q = Math.floor(total / n);
  const r = total - q * n;
  return Array.from({ length: n }, (_, i) => q + (i < r ? 1 : 0));
};

async function main() {
  // HARD GUARD. This script fabricates paid registrations and ledger rows. On a
  // real database that is indistinguishable from fraud in the accounts, so it
  // refuses to run anywhere but the local embedded PGlite database.
  if (process.env.DATABASE_URL) {
    console.error(
      "✗ Refusing to run: DATABASE_URL is set.\n" +
        "  This script writes fake paid registrations and payments. It is for the\n" +
        "  local PGlite dev database only. Unset DATABASE_URL to use it."
    );
    process.exit(1);
  }

  const db = getDb();
  const [event] = await db.select().from(schema.events).where(eq(schema.events.status, "published"));
  if (!event) throw new Error("No published event — run `npm run seed` first.");
  const days = (event.days as { key: string }[]).map((d) => d.key);
  const types = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.eventId, event.id));

  let seq = 900;
  let expectedTicketCents = 0;
  const perDay: Record<string, { withFood: number; withoutFood: number; kids: number }> = {};
  for (const k of days) perDay[k] = { withFood: 0, withoutFood: 0, kids: 0 };

  for (const b of BUYS) {
    const tt = types.find((t) => t.name === b.typeName);
    if (!tt) throw new Error(`Unknown ticket type: ${b.typeName}`);
    const coverage = b.days ?? (Array.isArray(tt.dayKeys) ? (tt.dayKeys as string[]) : days);
    const unit = b.member ? tt.priceMemberCents : tt.priceNonmemberCents >= 0 ? tt.priceNonmemberCents : tt.priceMemberCents;
    const total = unit * b.qty;
    const fee = Math.round(total * 0.03);

    const [reg] = await db
      .insert(schema.registrations)
      .values({
        confirmationNumber: `PRG-2026-${String(++seq).padStart(4, "0")}`,
        eventId: event.id,
        buyerEmail: `${b.buyer.split(" ")[0].toLowerCase()}@example.com`,
        buyerName: b.buyer,
        buyerPhone: "215-555-0100",
        isMemberPurchase: b.member,
        subtotalCents: total,
        totalCents: total,
        processingFeeCents: fee,
        paymentMethod: "square",
        status: "paid",
        paidAt: new Date(),
      })
      .returning({ id: schema.registrations.id });

    for (let i = 0; i < b.qty; i++) {
      const shares = splitEven(unit, coverage.length);
      for (let di = 0; di < coverage.length; di++) {
        const dayKey = coverage[di];
        expectedTicketCents += shares[di];
        const band = tt.ageBand ?? "adult";
        const seg: "withFood" | "withoutFood" | "kids" =
          band === "child_5_18" || band === "child_under_5"
            ? "kids"
            : tt.withFood === false || b.foodPref === "none"
              ? "withoutFood"
              : "withFood";
        if (perDay[dayKey]) perDay[dayKey][seg]++;
        await db.insert(schema.tickets).values({
          registrationId: reg.id,
          ticketTypeId: tt.id,
          attendeeFirstName: `${b.buyer.split(" ")[0]}${i + 1}`,
          attendeeIsMember: b.member,
          foodPref: b.foodPref,
          priceCents: shares[di],
          qrCode: `TEST-${reg.id.slice(0, 6)}-${i}-${dayKey}`,
          dayKey,
        });
      }
    }

    await db.insert(schema.payments).values({
      kind: "registration",
      entityId: reg.id,
      payerName: b.buyer,
      payerEmail: `${b.buyer.split(" ")[0].toLowerCase()}@example.com`,
      amountCents: total,
      feeCents: fee,
      method: "square",
      status: "paid",
      paidAt: new Date(),
    });
  }

  // two sponsorship gifts and one membership, through the site
  for (const [name, amount] of [
    ["Dragon Gym", 50000],
    ["Anonymous", 25000],
  ] as const) {
    const [don] = await db
      .insert(schema.donations)
      .values({
        confirmationNumber: `DON-2026-${String(++seq).padStart(4, "0")}`,
        donorName: name,
        donorEmail: `${name.replace(/\W/g, "").toLowerCase()}@example.com`,
        amountCents: amount,
        isAnonymous: name === "Anonymous",
        paymentMethod: "square",
        status: "paid",
        paidAt: new Date(),
      })
      .returning({ id: schema.donations.id });
    await db.insert(schema.payments).values({
      kind: "donation",
      entityId: don.id,
      payerName: name,
      payerEmail: "gift@example.com",
      amountCents: amount,
      method: "square",
      status: "paid",
      paidAt: new Date(),
    });
  }

  await db.insert(schema.payments).values({
    kind: "membership",
    entityId: "test-member",
    payerName: "Test member",
    payerEmail: "member@example.com",
    amountCents: 7500,
    method: "square",
    status: "paid",
    paidAt: new Date(),
  });

  console.log("✔ seeded paid registrations");
  console.log("  expected ticket face value:", (expectedTicketCents / 100).toFixed(2));
  console.log("  expected attendance per day:", JSON.stringify(perDay));
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  }
);
