"use server";

import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { consumeResetToken } from "@/lib/auth/reset";
import { hashPassword } from "@/lib/auth/password";

export type ResetState = { error?: string; done?: boolean } | undefined;

export async function resetPasswordAction(_p: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "Password needs at least 8 characters." };
  if (password !== confirm) return { error: "The two passwords don't match." };

  const userId = await consumeResetToken(token);
  if (!userId) return { error: "This link is invalid, already used, or expired — request a fresh one." };

  const db = getDb();
  await db.update(schema.users).set({ passwordHash: hashPassword(password), updatedAt: new Date() }).where(eq(schema.users.id, userId));
  await db.insert(schema.auditLog).values({
    userId,
    action: "password_reset",
    entityType: "users",
    entityId: userId,
  });
  return { done: true };
}
