"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession } from "./session";
import { isEmail, isPhone } from "@/lib/validation";
import { ensureExtraColumns } from "@/lib/schema-ensure";

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // count failures within 15 min
const LOGIN_LOCK_AFTER = 5; // lock after this many
const LOGIN_LOCK_MS = 15 * 60 * 1000; // lock duration

export type AuthState = { error?: string } | undefined;

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!email || !password) return { error: "Please enter your email and password." };

  await ensureExtraColumns();
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  const now = new Date();

  // Brute-force lockout — protects admin passwords from guessing.
  if (user && user.lockedUntil && user.lockedUntil > now) {
    const mins = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000);
    return { error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or reset your password.` };
  }

  if (!user || user.deletedAt || !verifyPassword(password, user.passwordHash)) {
    // Record the failed attempt on a real account and lock after too many.
    if (user && !user.deletedAt) {
      const recent = user.lastFailedLoginAt && now.getTime() - user.lastFailedLoginAt.getTime() < LOGIN_WINDOW_MS;
      const count = (recent ? user.failedLoginCount : 0) + 1;
      await db
        .update(schema.users)
        .set({
          failedLoginCount: count,
          lastFailedLoginAt: now,
          lockedUntil: count >= LOGIN_LOCK_AFTER ? new Date(now.getTime() + LOGIN_LOCK_MS) : null,
        })
        .where(eq(schema.users.id, user.id));
    }
    return { error: "That email/password combination didn't match." };
  }

  const [member] = await db.select().from(schema.members).where(eq(schema.members.userId, user.id));
  // Success — clear the failure counters.
  await db.update(schema.users).set({ lastLoginAt: now, failedLoginCount: 0, lastFailedLoginAt: null, lockedUntil: null }).where(eq(schema.users.id, user.id));
  await createSession({
    userId: user.id,
    email: user.email,
    role: user.role as never,
    memberId: member?.id,
    name: member ? `${member.primaryFirstName} ${member.primaryLastName}` : undefined,
  });

  const isAdmin = user.role === "admin" || user.role === "super_admin";
  const home = isAdmin ? "/admin" : user.role === "volunteer" ? "/admin/checkin" : "/";
  redirect(next || home);
}

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const familyName = String(formData.get("familyName") ?? "").trim() || `${lastName} family`;
  const phone = String(formData.get("phone") ?? "").trim();

  if (!isEmail(email)) return { error: "Please enter a valid email (name@example.com)." };
  if (password.length < 8) return { error: "Password needs at least 8 characters." };
  if (!firstName || !lastName) return { error: "Please tell us your first and last name." };
  // Mandatory: a member record without a contact number isn't much use.
  if (!isPhone(phone, true)) return { error: "Please add a mobile number — it's required for membership." };

  const db = getDb();
  const existing = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing.length > 0) return { error: "An account with that email already exists — try signing in." };

  const [user] = await db
    .insert(schema.users)
    .values({ email, passwordHash: hashPassword(password), role: "member" })
    .returning();
  const [member] = await db
    .insert(schema.members)
    .values({
      userId: user.id,
      familyName,
      primaryFirstName: firstName,
      primaryLastName: lastName,
      phone,
      membershipStatus: "pending_payment",
    })
    .returning();

  await createSession({
    userId: user.id,
    email,
    role: "member",
    memberId: member.id,
    name: `${firstName} ${lastName}`,
  });
  redirect("/signup/membership");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
