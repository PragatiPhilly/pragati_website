/**
 * Runs once when a server instance boots (Next.js instrumentation hook).
 *
 * On production Postgres (Neon), it applies the lazy schema "ensures" up front
 * so newer columns/tables exist BEFORE any page reads them — the database
 * self-upgrades on deploy, no manual migration step required. Wrapped so a
 * transient DB hiccup at boot never breaks startup (the per-request ensures
 * and `drizzle-kit push` remain as fallbacks).
 *
 * Dev/test (embedded PGlite, no DATABASE_URL) is skipped — it relies on the
 * per-request ensures already.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return; // edge can't open a DB connection
  try {
    const [{ ensureExtraColumns }, { ensureMembershipColumn }, { ensureMediaTables }, { ensureScanTables }] =
      await Promise.all([
        import("@/lib/schema-ensure"),
        import("@/lib/membership-ensure"),
        import("@/lib/media/ensure"),
        import("@/lib/scans/ensure"),
      ]);
    await Promise.all([ensureExtraColumns(), ensureMembershipColumn(), ensureMediaTables(), ensureScanTables()]);
    console.log("[instrumentation] schema ensures applied at startup");
  } catch (e) {
    console.error("[instrumentation] startup schema ensure failed (will retry lazily / via drizzle-kit push):", e);
  }
}
