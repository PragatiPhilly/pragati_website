"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { createResetToken } from "@/lib/auth/reset";
import { getConfig, setConfig } from "@/lib/system-config";
import { sendMail } from "@/lib/email";
import { inviteEmail } from "@/lib/email/templates";
import { randomBytes } from "crypto";
import { CONFIGURABLE_SECTIONS, type RoleAccess, type SectionKey } from "@/lib/auth/access";

const ROLES = ["member", "volunteer", "admin", "super_admin"] as const;
export type Role = (typeof ROLES)[number];

async function requireSuper() {
  const s = await getSession();
  if (!s || s.role !== "super_admin") throw new Error("Super-admin required");
  return s;
}

/** Save the section-access matrix (super admin only, audit-logged). */
export async function saveRoleAccessAction(access: RoleAccess): Promise<void> {
  const me = await requireSuper();
  const valid = CONFIGURABLE_SECTIONS.map((s) => s.key);
  const clean = (list: SectionKey[]) =>
    [...new Set(Array.isArray(list) ? list : [])].filter((k) => valid.includes(k));
  const value: RoleAccess = { admin: clean(access.admin), volunteer: clean(access.volunteer) };

  await setConfig("role_access", value, me.userId);
  const db = getDb();
  await db.insert(schema.auditLog).values({
    userId: me.userId,
    action: "role_access_updated",
    entityType: "system_config",
    entityId: "role_access",
    changes: value,
  });
  revalidatePath("/admin", "layout"); // refresh nav across all admin pages
}

export async function setRoleAction(userId: string, role: Role): Promise<{ ok: boolean; message: string }> {
  const me = await requireSuper();
  if (!ROLES.includes(role)) return { ok: false, message: "Unknown role." };
  if (userId === me.userId) return { ok: false, message: "You can't change your own role — ask another super admin." };

  const db = getDb();
  const [target] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!target) return { ok: false, message: "User not found." };

  // never orphan the org: at least one super admin must remain
  if (target.role === "super_admin" && role !== "super_admin") {
    const supers = await db.select().from(schema.users).where(eq(schema.users.role, "super_admin"));
    if (supers.filter((u) => !u.deletedAt).length <= 1) {
      return { ok: false, message: "That's the last super admin — promote someone else first." };
    }
  }

  await db.update(schema.users).set({ role, updatedAt: new Date() }).where(eq(schema.users.id, userId));
  await db.insert(schema.auditLog).values({
    userId: me.userId,
    action: "set_role",
    entityType: "users",
    entityId: userId,
    changes: { email: target.email, from: target.role, to: role },
  });

  // alert on super-admin grants & revocations — the keys to the kingdom
  if (role === "super_admin" || target.role === "super_admin") {
    const alertTo = await getConfig<string>("admin_alert_email");
    await sendMail({
      to: alertTo,
      subject: `🔑 Role change: ${target.email} → ${role}`,
      text: `${me.email} changed ${target.email} from "${target.role}" to "${role}".\n\nIf this wasn't expected, review the audit log immediately.`,
      template: "role_change_alert",
    });
  }

  revalidatePath("/admin/roles");
  return { ok: true, message: `${target.email} is now ${role.replace("_", " ")} ✓` };
}

export async function inviteUserAction(rawEmail: string, role: Role): Promise<{ ok: boolean; message: string }> {
  const me = await requireSuper();
  const email = rawEmail.trim().toLowerCase();
  if (!email.includes("@") || email.length < 5) return { ok: false, message: "That doesn't look like an email." };
  if (!ROLES.includes(role)) return { ok: false, message: "Unknown role." };

  const db = getDb();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) return { ok: false, message: "That account already exists — change its role in the list below." };

  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash: hashPassword(randomBytes(24).toString("hex")), role, emailVerifiedAt: new Date() })
    .returning();

  const raw = await createResetToken(user.id, "invite");
  const orgName = await getConfig<string>("org_name");
  const mail = inviteEmail({
    email,
    role,
    invitedBy: me.email,
    setupUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password?token=${raw}`,
    orgName,
  });
  await sendMail({ to: email, ...mail, template: "invite", relatedUserId: user.id });

  await db.insert(schema.auditLog).values({
    userId: me.userId,
    action: "invite_user",
    entityType: "users",
    entityId: user.id,
    changes: { email, role },
  });

  revalidatePath("/admin/roles");
  return { ok: true, message: `Invite sent to ${email} — they set their own password via the emailed link ✓` };
}

export async function sendResetLinkAction(userId: string): Promise<{ ok: boolean; message: string }> {
  const me = await requireSuper();
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) return { ok: false, message: "User not found." };

  const raw = await createResetToken(user.id, "reset");
  const orgName = await getConfig<string>("org_name");
  const [member] = await db.select().from(schema.members).where(eq(schema.members.userId, user.id));
  const { resetPasswordEmail } = await import("@/lib/email/templates");
  const mail = resetPasswordEmail({
    name: member?.primaryFirstName ?? "friend",
    resetUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password?token=${raw}`,
    orgName,
  });
  await sendMail({ to: user.email, ...mail, template: "password_reset", relatedUserId: user.id });
  await db.insert(schema.auditLog).values({ userId: me.userId, action: "send_reset_link", entityType: "users", entityId: userId });
  return { ok: true, message: `Reset link emailed to ${user.email} ✓` };
}
