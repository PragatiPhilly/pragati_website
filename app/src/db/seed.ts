/**
 * Seed: system config defaults, admin + sample member accounts,
 * Durga Pujo 2026 event with ticket types + a promo code.
 * Run: npm run seed   (idempotent — safe to re-run)
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "./client";
import { systemConfigDefaults } from "../config/defaults";
import { hashPassword } from "../lib/auth/password";

async function main() {
  const db = getDb();

  // ── system config ──
  for (const [key, value] of Object.entries(systemConfigDefaults)) {
    await db
      .insert(schema.systemConfig)
      .values({ key, value })
      .onConflictDoNothing();
  }

  // ── super admin (TEST credentials — change in production!) ──
  const adminEmail = "sayantankundu93@gmail.com";
  const existingAdmin = await db.select().from(schema.users).where(eq(schema.users.email, adminEmail));
  if (existingAdmin.length === 0) {
    await db.insert(schema.users).values({
      email: adminEmail,
      passwordHash: hashPassword("pragati-admin-2026"),
      role: "super_admin",
      emailVerifiedAt: new Date(),
    });
    console.log(`✔ super admin: ${adminEmail} / pragati-admin-2026`);
  }

  // ── gate volunteer (check-in only — can't see money, members, settings) ──
  const volEmail = "volunteer.demo@example.com";
  const existingVol = await db.select().from(schema.users).where(eq(schema.users.email, volEmail));
  if (existingVol.length === 0) {
    await db.insert(schema.users).values({
      email: volEmail,
      passwordHash: hashPassword("volunteer-2026"),
      role: "volunteer",
      emailVerifiedAt: new Date(),
    });
    console.log(`✔ gate volunteer: ${volEmail} / volunteer-2026 (check-in only)`);
  }

  // ── sample member family ──
  const memberEmail = "member.demo@example.com";
  const existingMember = await db.select().from(schema.users).where(eq(schema.users.email, memberEmail));
  if (existingMember.length === 0) {
    const [u] = await db
      .insert(schema.users)
      .values({
        email: memberEmail,
        passwordHash: hashPassword("member-demo-2026"),
        role: "member",
        emailVerifiedAt: new Date(),
      })
      .returning();
    const [m] = await db
      .insert(schema.members)
      .values({
        userId: u.id,
        familyName: "Chatterjee family",
        primaryFirstName: "Arjun",
        primaryLastName: "Chatterjee",
        phone: "+12675550123",
        city: "Malvern",
        state: "PA",
        membershipStatus: "active",
        membershipStartedAt: "2026-01-15",
      })
      .returning();
    await db.insert(schema.familyMembers).values([
      { memberId: m.id, firstName: "Mira", lastName: "Chatterjee", relationship: "spouse", isMember: true, foodPref: "veg", dateOfBirth: "1988-04-02" },
      { memberId: m.id, firstName: "Rohan", lastName: "Chatterjee", relationship: "child", foodPref: "kid", dateOfBirth: "2018-09-12" },
    ]);
    console.log(`✔ demo member: ${memberEmail} / member-demo-2026 (Arjun + Mira + Rohan)`);
  }

  // ── Durga Pujo 2026 ──
  const slug = "durga-pujo-2026";
  const existing = await db.select().from(schema.events).where(eq(schema.events.slug, slug));
  if (existing.length === 0) {
    const [event] = await db
      .insert(schema.events)
      .values({
        slug,
        name: "Durga Pujo 2026",
        nameBengali: "দুর্গা পূজা ২০২৬",
        theme: "durga",
        description:
          "Three days of pujo, bhog, cultural programs and adda. Join the Greater Philadelphia Bengali community for our biggest celebration of the year — Sasthi to Dashami condensed into one glorious weekend.",
        startsAt: new Date("2026-10-16T16:00:00-04:00"),
        endsAt: new Date("2026-10-18T22:00:00-04:00"),
        venueName: "Greater Philadelphia Expo Center",
        venueAddress: "100 Station Ave, Oaks, PA 19456",
        venueMapUrl: "https://maps.google.com/?q=100+Station+Ave+Oaks+PA",
        days: [
          { key: "fri", label: "Friday · Oct 16", date: "2026-10-16" },
          { key: "sat", label: "Saturday · Oct 17", date: "2026-10-17" },
          { key: "sun", label: "Sunday · Oct 18", date: "2026-10-18" },
        ],
        status: "published",
      })
      .returning();

    const tt = (v: Partial<typeof schema.ticketTypes.$inferInsert>) => ({
      eventId: event.id,
      pricingModel: "per_person",
      requiresFoodSelection: true,
      ...v,
    });
    await db.insert(schema.ticketTypes).values([
      tt({ name: "Adult · All 3 days · with food", ageBand: "adult", dayKeys: ["fri", "sat", "sun"], withFood: true, priceMemberCents: 8000, priceNonmemberCents: 11500, displayOrder: 1, capacity: 800 }) as never,
      tt({ name: "Adult · All 3 days · no food", ageBand: "adult", dayKeys: ["fri", "sat", "sun"], withFood: false, priceMemberCents: 5600, priceNonmemberCents: 8000, displayOrder: 2, capacity: 400, requiresFoodSelection: false }) as never,
      tt({ name: "Adult · Single day · with food", ageBand: "adult", dayKeys: null, withFood: true, priceMemberCents: 3500, priceNonmemberCents: 5000, displayOrder: 3, capacity: 1200 }) as never,
      tt({ name: "Adult · Single day · no food", ageBand: "adult", dayKeys: null, withFood: false, priceMemberCents: 2500, priceNonmemberCents: 3500, displayOrder: 4, capacity: 600, requiresFoodSelection: false }) as never,
      tt({ name: "Kid (5–12) · All 3 days · kid meal", ageBand: "child_5_12", dayKeys: ["fri", "sat", "sun"], withFood: true, priceMemberCents: 2000, priceNonmemberCents: 3000, displayOrder: 5, capacity: 300 }) as never,
      tt({ name: "Kid (5–12) · Single day · kid meal", ageBand: "child_5_12", dayKeys: null, withFood: true, priceMemberCents: 800, priceNonmemberCents: 1200, displayOrder: 6, capacity: 400 }) as never,
      tt({ name: "Little one (under 5) · free", ageBand: "child_under_5", dayKeys: ["fri", "sat", "sun"], withFood: true, priceMemberCents: 0, priceNonmemberCents: 0, displayOrder: 7, requiresFoodSelection: false }) as never,
    ]);

    await db.insert(schema.promoCodes).values({
      eventId: event.id,
      code: "EARLYBIRD",
      discountType: "percent",
      discountValue: 10,
      maxUsesTotal: 100,
      validUntil: new Date("2026-09-15T23:59:59-04:00"),
    });

    console.log("✔ Durga Pujo 2026 seeded (7 ticket types, EARLYBIRD promo)");
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
