/**
 * Membership activation on paid dues. Called by the Square webhook (card) and
 * available to admin actions. Idempotent — the webhook may retry, and a member
 * who is already active is left untouched (no duplicate welcome email).
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getConfig } from "@/lib/system-config";
import { sendMail } from "@/lib/email";
import { welcomeEmail } from "@/lib/email/templates";

export async function activateMembershipPaid(
  memberId: string,
  opts: { squarePaymentId?: string } = {}
): Promise<boolean> {
  const db = getDb();
  const [member] = await db.select().from(schema.members).where(eq(schema.members.id, memberId));
  if (!member) return false;
  if (member.membershipStatus === "active") return true; // idempotent

  await db
    .update(schema.members)
    .set({
      membershipStatus: "active",
      membershipStartedAt: member.membershipStartedAt ?? new Date().toISOString().slice(0, 10),
      updatedAt: new Date(),
    })
    .where(eq(schema.members.id, memberId));

  await db.insert(schema.auditLog).values({
    userId: member.userId,
    action: "update",
    entityType: "members",
    entityId: memberId,
    changes: {
      membershipStatus: { from: member.membershipStatus, to: "active" },
      via: "square_card",
      squarePaymentId: opts.squarePaymentId,
    },
  });

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, member.userId));
  if (user?.email) {
    const orgName = await getConfig<string>("org_name");
    const mail = welcomeEmail({ firstName: member.primaryFirstName, familyName: member.familyName, orgName });
    await sendMail({ to: user.email, ...mail, template: "welcome", relatedUserId: user.id, priority: 1 });
  }
  return true;
}
