import { NextResponse } from "next/server";
import { sweepExpiredMemberships } from "@/lib/sweeper";

export const dynamic = "force-dynamic";

/**
 * Housekeeping only: pending schema/data migrations, membership expiry, the
 * email outbox drain, and log pruning. It CANNOT cancel a payment or a
 * registration — nothing scheduled can. See lib/sweeper.ts.
 *
 * Hit this from a scheduler (Vercel Cron in production — see vercel.json).
 * If CRON_SECRET is set, only requests carrying it are accepted (Vercel
 * sends it automatically as `Authorization: Bearer <CRON_SECRET>`).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Safety net for the one-time backfills: if the deploy's cold start was cut
  // short before they finished, this picks them up. A no-op once they're done.
  const { runPendingDataMigrations } = await import("@/lib/data-migrations");
  const migrations = await runPendingDataMigrations();

  // NOTE: this job no longer cancels anything to do with money. Unpaid
  // checkouts are left alone forever — see the header of lib/sweeper.ts.
  const membershipsLapsed = await sweepExpiredMemberships();
  // drain the email outbox: send queued/deferred mail, combine alert digests
  const { drainOutbox } = await import("@/lib/email");
  const outbox = await drainOutbox();
  // prune old logs ~hourly to keep the free-tier database lean (cheap no-op otherwise)
  let pruned: Record<string, number> | undefined;
  if (new Date().getUTCMinutes() < 5) {
    const { pruneOldLogs } = await import("@/lib/log-retention");
    pruned = await pruneOldLogs();
  }
  return NextResponse.json({ ok: true, migrations, membershipsLapsed, outbox, pruned });
}
