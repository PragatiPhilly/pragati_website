/**
 * MANUAL ESCAPE HATCH — you should not normally need this.
 *
 * Phone is now mandatory on every public form, and blank phone fields on older
 * rows are filled automatically on deploy (see src/lib/data-migrations.ts,
 * triggered from the startup hook and the 5-hourly cron), guarded so it runs
 * exactly once per database. This script runs the same backfill on demand.
 *
 * It is idempotent: only null/blank values are touched.
 *
 * Usage (stop the dev server first if using local PGlite — single-connection):
 *   npx tsx scripts/backfill-phone.ts --yes
 *   DATABASE_URL=postgres://… npx tsx scripts/backfill-phone.ts --yes
 */
import { runPendingDataMigrations } from "../src/lib/data-migrations";
import { getDb, schema } from "../src/db/client";
import { eq } from "drizzle-orm";

const confirmed = process.argv.includes("--yes");
const KEY = "2026-08-backfill-phone-placeholders";

async function main() {
  if (!confirmed) {
    console.log("This normally runs itself on deploy — see src/lib/data-migrations.ts.");
    console.log("To run it by hand anyway:  npx tsx scripts/backfill-phone.ts --yes");
    process.exit(1);
  }
  const target = process.env.DATABASE_URL ? "remote Postgres (DATABASE_URL)" : `local PGlite (${process.env.PGLITE_DIR ?? "./.data/pglite"})`;
  console.log(`Backfilling blank phone numbers on ${target}…\n`);

  // Clear the bookkeeping row so the guarded runner will execute this job again.
  const db = getDb();
  try {
    await db.delete(schema.dataMigrations).where(eq(schema.dataMigrations.key, KEY));
  } catch {
    /* table may not exist yet — the runner creates it */
  }

  const ran = await runPendingDataMigrations();
  const mine = ran.find((r) => r.key === KEY);
  console.log(`  ${mine?.result ?? "nothing to do"}`);
  for (const other of ran.filter((r) => r.key !== KEY)) {
    console.log(`  (also applied pending migration ${other.key}: ${other.result})`);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
