/**
 * Releases expired reservations:
 *  - Square checkouts abandoned past their 15-minute hold
 *  - Zelle orders unverified past the 48-hour hold
 * Runs opportunistically on admin page loads and via /api/cron/sweep.
 */
import { and, inArray, lt, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { cancelRegistration } from "@/lib/checkout";

export async function sweepExpiredReservations(): Promise<number> {
  const db = getDb();
  const now = new Date();
  const stale = await db
    .select()
    .from(schema.registrations)
    .where(
      and(
        inArray(schema.registrations.status, ["pending_payment", "pending_zelle_verification"]),
        isNotNull(schema.registrations.reservationExpiresAt),
        lt(schema.registrations.reservationExpiresAt, now)
      )
    );
  for (const reg of stale) {
    await cancelRegistration(reg.id, "cancelled_no_payment");
  }
  return stale.length;
}
