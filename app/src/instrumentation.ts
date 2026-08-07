/**
 * Runs once when a server instance boots (Next.js instrumentation hook).
 *
 * On production Postgres (Neon), it applies the lazy schema "ensures" up front
 * so newer columns/tables exist BEFORE any page reads them — the database
 * self-upgrades on deploy, no manual migration step required. Wrapped so a
 * transient DB hiccup at boot never breaks startup (the per-request ensures
 * and `drizzle-kit push` remain as fallbacks).
 *
 * It then runs any pending one-time DATA backfills (see lib/data-migrations),
 * which are guarded by a database lock so they apply exactly once per database
 * no matter how many instances boot. Both phases are best-effort: the app runs
 * correctly either way, and anything that doesn't finish is retried on the next
 * boot or by the 5-hourly cron.
 *
 * Dev/test (embedded PGlite, no DATABASE_URL) is skipped — it relies on the
 * per-request ensures already.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return; // edge can't open a DB connection
  try {
    const [{ ensureExtraColumns }, { ensureMembershipColumn }, { ensureMediaTables }, { ensureScanTables }, { ensurePaymentsTable }] =
      await Promise.all([
        import("@/lib/schema-ensure"),
        import("@/lib/membership-ensure"),
        import("@/lib/media/ensure"),
        import("@/lib/scans/ensure"),
        import("@/lib/ledger-ensure"),
      ]);
    await Promise.all([
      ensureExtraColumns(),
      ensureMembershipColumn(),
      ensureMediaTables(),
      ensureScanTables(),
      ensurePaymentsTable(),
    ]);
    console.log("[instrumentation] schema ensures applied at startup");
  } catch (e) {
    console.error("[instrumentation] startup schema ensure failed (will retry lazily / via drizzle-kit push):", e);
  }

  // One-time data backfills. Separate try/catch: a backfill problem must never
  // stop the server from coming up, and runPendingDataMigrations already
  // swallows and records its own failures for retry.
  try {
    const { runPendingDataMigrations } = await import("@/lib/data-migrations");
    const ran = await runPendingDataMigrations();
    if (ran.length > 0) console.log(`[instrumentation] applied ${ran.length} data migration(s) at startup`);
  } catch (e) {
    console.error("[instrumentation] data migrations failed (will retry on the next boot / cron):", e);
  }
}

/**
 * Every server-side error, with enough context to actually act on it.
 *
 * Without this, a 500 shows up in Vercel's dashboard as a bare error-rate
 * percentage with no cause — you can see that something failed but not what.
 * This prints a single tagged, greppable line per failure: the route, the error
 * name/message, and a classification of the usual suspects (database reachability
 * being by far the most common in a low-traffic serverless app, where most
 * requests land on a cold instance and a sleeping database).
 *
 * Find these in Vercel → Logs by searching for "[error]".
 */
export function onRequestError(
  err: unknown,
  request: { path?: string; method?: string; headers?: Record<string, string | undefined> },
  context: { routerKind?: string; routePath?: string; routeType?: string }
) {
  const e = err as { name?: string; message?: string; code?: string; stack?: string; cause?: unknown };
  const msg = `${e?.name ?? ""} ${e?.message ?? String(err)}`;
  const causeMsg = e?.cause instanceof Error ? e.cause.message : "";
  const blob = `${msg} ${causeMsg} ${e?.code ?? ""}`.toLowerCase();

  // Classify the failure so the log line is self-explanatory at 2am.
  let kind = "unknown";
  if (/quota|exceeded the compute time/.test(blob)) kind = "DB_QUOTA_EXCEEDED";
  else if (/econnrefused|enotfound|etimedout|connection terminated|connect timeout|socket/.test(blob))
    kind = "DB_UNREACHABLE";
  else if (/timeout|timed out/.test(blob)) kind = "TIMEOUT";
  else if (/relation .* does not exist|column .* does not exist/.test(blob)) kind = "SCHEMA_MISSING";
  else if (/blob|BLOB_READ_WRITE_TOKEN/.test(blob)) kind = "BLOB_STORAGE";
  else if (/square/.test(blob)) kind = "SQUARE_PAYMENTS";
  else if (/brevo|resend|email/.test(blob)) kind = "EMAIL";

  console.error(
    `[error] kind=${kind} route=${context?.routePath ?? request?.path ?? "?"} ` +
      `method=${request?.method ?? "?"} type=${context?.routeType ?? "?"} :: ${msg}` +
      (causeMsg ? ` :: cause: ${causeMsg}` : "")
  );
  if (e?.stack) console.error(e.stack);
}
