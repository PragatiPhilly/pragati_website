/**
 * Health check for uptime monitoring (UptimeRobot / Better Stack / cron-job.org
 * — all have free tiers; point one at /api/health every 5 minutes and get an
 * email/SMS the moment the site or database goes down).
 *
 * 200 = app + database OK · 503 = database unreachable.
 * Public and unauthenticated by design; exposes no data beyond up/down.
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ ok: true, db: "up", at: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, db: "down", error: e instanceof Error ? e.message.slice(0, 200) : "unknown", at: new Date().toISOString() },
      { status: 503 }
    );
  }
}
