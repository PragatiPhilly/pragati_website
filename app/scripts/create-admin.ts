/**
 * Create (or reset) ONE super-admin account — the clean way to bootstrap a
 * production database. Unlike `npm run seed`, this creates NO demo accounts and
 * uses NO known password: you supply the email and a strong password yourself.
 *
 * Run against your production DB (Neon) by passing its connection string:
 *
 *   DATABASE_URL='postgres://…' \
 *   ADMIN_EMAIL='pragati.management@gmail.com' \
 *   ADMIN_PASSWORD='a-long-random-password' \
 *   npx tsx scripts/create-admin.ts
 *
 * Or pass them as arguments:
 *   DATABASE_URL='postgres://…' npx tsx scripts/create-admin.ts you@org.org 'strong-pass'
 *
 * If the email already exists it is promoted to super_admin and its password is
 * reset (and any soft-delete is undone) — so this doubles as "reset my password".
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../src/db/client";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? process.argv[2] ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? process.argv[3] ?? "";

  if (!email.includes("@") || email.length < 5) {
    console.error("✗ Provide a valid ADMIN_EMAIL (or pass it as the first argument).");
    process.exit(1);
  }
  if (password.length < 10) {
    console.error("✗ ADMIN_PASSWORD must be at least 10 characters (use something long & random).");
    process.exit(1);
  }

  const target = process.env.DATABASE_URL ? "remote Postgres (DATABASE_URL)" : `local PGlite (${process.env.PGLITE_DIR ?? "./.data/pglite"})`;
  const db = getDb();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));

  if (existing) {
    await db
      .update(schema.users)
      .set({ passwordHash: hashPassword(password), role: "super_admin", emailVerifiedAt: new Date(), deletedAt: null, updatedAt: new Date() })
      .where(eq(schema.users.id, existing.id));
    console.log(`✔ ${email} is now super_admin with a new password  ·  ${target}`);
  } else {
    await db.insert(schema.users).values({
      email,
      passwordHash: hashPassword(password),
      role: "super_admin",
      emailVerifiedAt: new Date(),
    });
    console.log(`✔ created super_admin ${email}  ·  ${target}`);
  }
  console.log("  Log in at /login, then set org emails in Admin → Settings.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
