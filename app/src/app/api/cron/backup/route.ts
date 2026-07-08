import { NextResponse } from "next/server";
import { sendBackupEmail } from "@/lib/backup";
import { getConfig } from "@/lib/system-config";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // large CSVs + email upload can take a moment

/**
 * Daily registration backup — scheduled in vercel.json for 03:00 UTC
 * (11 PM Eastern during daylight time). Emails the full registration
 * dataset as a CSV to the configured backup address.
 * If CRON_SECRET is set, only requests carrying it are accepted.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((await getConfig<string>("backup_enabled")) === "no") {
    return NextResponse.json({ ok: true, skipped: "backups disabled in settings" });
  }
  const result = await sendBackupEmail("cron");
  return NextResponse.json(result);
}
