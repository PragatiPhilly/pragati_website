"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

async function requireMember() {
  const s = await getSession();
  if (!s?.memberId) throw new Error("Not signed in");
  return s;
}

export type FormState = { error?: string; ok?: boolean } | undefined;

export async function addFamilyMemberAction(_p: FormState, formData: FormData): Promise<FormState> {
  const s = await requireMember();
  const firstName = String(formData.get("firstName") ?? "").trim();
  if (!firstName) return { error: "Name is required." };
  const relationship = String(formData.get("relationship") ?? "spouse");
  const dob = String(formData.get("dateOfBirth") ?? "") || null;
  const db = getDb();
  await db.insert(schema.familyMembers).values({
    memberId: s.memberId!,
    firstName,
    lastName: String(formData.get("lastName") ?? "").trim() || null,
    relationship,
    dateOfBirth: dob,
    foodPref: String(formData.get("foodPref") ?? "non_veg"),
    dietaryNotes: String(formData.get("dietaryNotes") ?? "").trim() || null,
    isMember: relationship !== "child",
  });
  revalidatePath("/m/family");
  return { ok: true };
}

export async function removeFamilyMemberAction(id: string) {
  const s = await requireMember();
  const db = getDb();
  const [fm] = await db.select().from(schema.familyMembers).where(eq(schema.familyMembers.id, id));
  if (fm && fm.memberId === s.memberId) {
    await db.delete(schema.familyMembers).where(eq(schema.familyMembers.id, id));
  }
  revalidatePath("/m/family");
}

export async function updateProfileAction(_p: FormState, formData: FormData): Promise<FormState> {
  const s = await requireMember();
  const db = getDb();
  await db
    .update(schema.members)
    .set({
      familyName: String(formData.get("familyName") ?? "").trim() || undefined,
      phone: String(formData.get("phone") ?? "").trim() || null,
      addressLine1: String(formData.get("addressLine1") ?? "").trim() || null,
      city: String(formData.get("city") ?? "").trim() || null,
      state: String(formData.get("state") ?? "").trim() || null,
      zip: String(formData.get("zip") ?? "").trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(schema.members.id, s.memberId!));
  revalidatePath("/m/profile");
  return { ok: true };
}

export async function changePasswordAction(_p: FormState, formData: FormData): Promise<FormState> {
  const s = await requireMember();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 8) return { error: "New password needs at least 8 characters." };
  const db = getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, s.userId));
  if (!user || !verifyPassword(current, user.passwordHash)) return { error: "Current password didn't match." };
  await db.update(schema.users).set({ passwordHash: hashPassword(next), updatedAt: new Date() }).where(eq(schema.users.id, s.userId));
  return { ok: true };
}
