/**
 * Housekeeping. Note what is NOT here any more.
 *
 * ── WHY THERE IS NO RESERVATION SWEEP ────────────────────────────────────
 * This file used to cancel card checkouts whose 15-minute hold had lapsed.
 * That is a timer making a claim about money — "nobody paid this" — on the
 * strength of nothing but the clock. It cannot see Square, and Square payment
 * links never expire, so a buyer could (and on 2026-08-17, did) pay a link
 * eight hours after we had already written the order off. The result was a real
 * $494.40 payment sitting in our books as "reservation expired without
 * payment".
 *
 * The fix is not a better timer. It is not having one:
 *   • a checkout has no expiry — the buyer finishes whenever they like
 *   • seats are taken when the money lands, not when the cart is opened, so
 *     nothing needs releasing and there is nothing to leak
 *   • an unpaid checkout simply reads "awaiting payment" until a human decides
 *     otherwise (admin → Payments → cancel)
 *
 * Nothing in this application now moves a payment towards "not paid" on its
 * own. Only a person, or Square itself, can do that.
 *
 * What remains here is genuine calendar expiry: a membership term that has run
 * out. That is a real date arriving, not a guess about money.
 */
import { and, eq, lt, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

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
