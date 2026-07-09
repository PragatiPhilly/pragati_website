"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { createResetToken } from "@/lib/auth/reset";
import { getConfig } from "@/lib/system-config";
import { sendMail } from "@/lib/email";
import { resetPasswordEmail } from "@/lib/email/templates";

export type ForgotState = { done?: boolean } | undefined;

export async function forgotPasswordAction(_p: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  // Always report success — never reveal whether an account exists.
  if (!email.includes("@")) return { done: true };

  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (user && !user.deletedAt) {
    const raw = await createResetToken(user.id, "reset");
    const orgName = await getConfig<string>("org_name");
    const [member] = await db.select().from(schema.members).where(eq(schema.members.userId, user.id));
    const mail = resetPasswordEmail({
      name: member?.primaryFirstName ?? "friend",
      resetUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password?token=${raw}`,
      orgName,
    });
    await sendMail({ to: email, ...mail, template: "password_reset", relatedUserId: user.id, priority: 1 });
  }
  return { done: true };
}
