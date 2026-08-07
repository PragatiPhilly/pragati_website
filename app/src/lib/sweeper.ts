/**
 * Releases expired reservations and lapsed memberships:
 *  - Square checkouts abandoned past their 15-minute hold
 *  - Zelle orders unverified past the 48-hour hold
 *  - abandoned card donations (these used to sit "pending" forever, quietly
 *    inflating the outstanding figure)
 *  - memberships past their expiry date (nothing used to demote these, so
 *    "active member" was effectively permanent)
 * Runs opportunistically on admin page loads and via /api/cron/sweep.
 */
import { and, eq, inArray, lt, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { cancelRegistration } from "@/lib/checkout";
import { voidPayments } from "@/lib/ledger";

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

/** Retire abandoned card donations whose hold has lapsed. Zelle donations are left for a human. */
export async function sweepExpiredDonations(): Promise<number> {
  const db = getDb();
  const now = new Date();
  const stale = await db
    .select()
    .from(schema.donations)
    .where(
      and(
        eq(schema.donations.status, "pending_payment"),
        isNotNull(schema.donations.reservationExpiresAt),
        lt(schema.donations.reservationExpiresAt, now)
      )
    );
  for (const don of stale) {
    await db
      .update(schema.donations)
      .set({ status: "cancelled_no_payment", cancelledAt: now, updatedAt: now })
      .where(eq(schema.donations.id, don.id));
    await voidPayments(don.id, "Checkout abandoned");
  }
  return stale.length;
}

/**
 * Demote memberships whose term has run out. Only touches rows that actually
 * carry an expiry date, so honour-system and legacy rows without one are left
 * alone rather than being silently switched off.
 */
export async function sweepExpiredMemberships(): Promise<number> {
  const db = getDb();
  const now = new Date();
  const lapsed = await db
    .select()
    .from(schema.members)
    .where(
      and(
        eq(schema.members.membershipStatus, "active"),
        isNotNull(schema.members.membershipExpiresAt),
        lt(schema.members.membershipExpiresAt, now)
      )
    );
  for (const m of lapsed) {
    await db
      .update(schema.members)
      .set({ membershipStatus: "inactive", updatedAt: now })
      .where(eq(schema.members.id, m.id));
    await db.insert(schema.auditLog).values({
      userId: m.userId,
      action: "update",
      entityType: "members",
      entityId: m.id,
      changes: { membershipStatus: { from: "active", to: "inactive" }, via: "membership_expiry_sweep" },
    });
  }
  return lapsed.length;
}
