import { NextResponse } from "next/server";
import { sweepExpiredReservations } from "@/lib/sweeper";

export const dynamic = "force-dynamic";

/**
 * Hit this from a scheduler (Vercel Cron in production — see vercel.json).
 * If CRON_SECRET is set, only requests carrying it are accepted (Vercel
 * sends it automatically as `Authorization: Bearer <CRON_SECRET>`).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const released = await sweepExpiredReservations();
  return NextResponse.json({ ok: true, released });
}
