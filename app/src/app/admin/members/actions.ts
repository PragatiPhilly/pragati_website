"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { getConfig } from "@/lib/system-config";
import { sendMail } from "@/lib/email";
import { welcomeEmail } from "@/lib/email/templates";

export async function setMemberStatusAction(memberId: string, status: "active" | "inactive") {
  const admin = await requireAdmin();
  const db = getDb();
  const [member] = await db.select().from(schema.members).where(eq(schema.members.id, memberId));
  if (!member) return;

  const becameActive = status === "active" && member.membershipStatus !== "active";
  await db
    .update(schema.members)
    .set({
      membershipStatus: status,
      membershipStartedAt: becameActive ? new Date().toISOString().slice(0, 10) : member.membershipStartedAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.members.id, memberId));

  await db.insert(schema.auditLog).values({
    userId: admin.userId,
    action: "update",
    entityType: "members",
    entityId: memberId,
    changes: { membershipStatus: { from: member.membershipStatus, to: status } },
  });

  if (becameActive) {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, member.userId));
    if (user) {
      const orgName = await getConfig<string>("org_name");
      const mail = welcomeEmail({ firstName: member.primaryFirstName, familyName: member.familyName, orgName });
      await sendMail({ to: user.email, ...mail, template: "welcome", relatedUserId: user.id });
    }
  }
  revalidatePath("/admin/members");
}
