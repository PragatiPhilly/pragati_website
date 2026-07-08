/**
 * Creates one Zelle and one Square test registration against the seeded DB.
 * Used by the smoke test; also handy for demoing the admin queue.
 * Run with server STOPPED (PGlite is single-connection): npx tsx scripts/smoke-seed.ts
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db/client";
import { createCheckout, zelleSentClicked } from "../src/lib/checkout";

async function main() {
  const db = getDb();
  const [event] = await db.select().from(schema.events).where(eq(schema.events.slug, "durga-pujo-2026"));
  if (!event) throw new Error("Run npm run seed first");

  const zelle = await createCheckout({
    eventId: event.id,
    buyerName: "Sayantan Kundu",
    buyerEmail: "sayantankundu93@gmail.com",
    buyerPhone: "+12675550100",
    isMemberPurchase: false,
    paymentMethod: "zelle",
    attendees: [
      { firstName: "Sayantan", lastName: "Kundu", isKid: false, days: ["fri", "sat", "sun"], withFood: true, foodPref: "non_veg" },
      { firstName: "Rohan", isKid: true, age: 8, days: ["fri", "sat", "sun"], withFood: true, foodPref: "kid" },
    ],
  });
  if (zelle.kind === "zelle_instructions") {
    await zelleSentClicked(zelle.confirmationNumber);
    console.log(`ZELLE_CONF=${zelle.confirmationNumber} total=${zelle.totalCents}`);
  }

  const square = await createCheckout({
    eventId: event.id,
    buyerName: "Anita Roy",
    buyerEmail: "anita.demo@example.com",
    isMemberPurchase: false,
    paymentMethod: "square",
    attendees: [{ firstName: "Anita", lastName: "Roy", isKid: false, days: ["sat"], withFood: true, foodPref: "veg" }],
  });
  if (square.kind === "square_redirect") {
    const [reg] = await db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.confirmationNumber, square.confirmationNumber));
    console.log(`SQUARE_CONF=${square.confirmationNumber} SQUARE_REF=${reg.id}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
