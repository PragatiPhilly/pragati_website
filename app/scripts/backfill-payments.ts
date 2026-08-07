/**
 * MANUAL ESCAPE HATCH — you should not normally need this.
 *
 * The payments-ledger backfill applies itself automatically on deploy (see
 * src/lib/data-migrations.ts, triggered from the startup hook and the 5-hourly
 * cron), guarded so it runs exactly once per database. This script calls the
 * exact same function, for when you want to run it on demand or inspect the
 * result — e.g. against a staging copy, or if you've deliberately cleared the
 * `data_migrations` row to re-run it.
 *
 * It is idempotent: entries that already exist are skipped.
 *
 * Usage (stop the dev server first if using local PGlite — single-connection):
 *   npx tsx scripts/backfill-payments.ts --yes
 *   DATABASE_URL=postgres://… npx tsx scripts/backfill-payments.ts --yes
 */
import { getDb, schema } from "../src/db/client";
import { backfillPaymentsLedger } from "../src/lib/data-migrations";

const confirmed = process.argv.includes("--yes");

async function main() {
  if (!confirmed) {
    console.log("This normally runs itself on deploy — see src/lib/data-migrations.ts.");
    console.log("To run it by hand anyway:  npx tsx scripts/backfill-payments.ts --yes");
    process.exit(1);
  }
  const target = process.env.DATABASE_URL ? "remote Postgres (DATABASE_URL)" : `local PGlite (${process.env.PGLITE_DIR ?? "./.data/pglite"})`;
  console.log(`Backfilling the payments ledger on ${target}…\n`);

  const result = await backfillPaymentsLedger();
  console.log(`  ${result}\n`);

  const db = getDb();
  const all = await db.select().from(schema.payments);
  const sum = (kind: string) =>
    all.filter((p) => p.kind === kind && p.status === "paid").reduce((s, p) => s + p.amountCents, 0);
  console.log("Ledger now reports:");
  console.log(`  tickets      $${(sum("registration") / 100).toFixed(2)}`);
  console.log(`  donations    $${(sum("donation") / 100).toFixed(2)}`);
  console.log(`  memberships  $${(sum("membership") / 100).toFixed(2)}`);
  console.log("  ─────────────────────────");
  console.log(`  collected    $${((sum("registration") + sum("donation") + sum("membership")) / 100).toFixed(2)}`);
  console.log('\nEntries shown as "estimated" in the Payments log are memberships whose amount was never recorded — correct them there if any differed from the standard price.');
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
