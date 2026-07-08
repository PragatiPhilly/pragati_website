"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession } from "./session";

export type AuthState = { error?: string } | undefined;

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!email || !password) return { error: "Please enter your email and password." };

  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user || user.deletedAt || !verifyPassword(password, user.passwordHash)) {
    return { error: "That email/password combination didn't match." };
  }

  const [member] = await db.select().from(schema.members).where(eq(schema.members.userId, user.id));
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, user.id));
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

  if (!email || !email.includes("@")) return { error: "Please enter a valid email." };
  if (password.length < 8) return { error: "Password needs at least 8 characters." };
  if (!firstName || !lastName) return { error: "Please tell us your name." };

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
