/**
 * Password reset / invite tokens.
 * The raw token travels only in the email; we store its sha256 hash.
 * Single-use, 60-minute expiry (invites get 7 days).
 */
import { createHash, randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

const hash = (raw: string) => createHash("sha256").update(raw).digest("hex");

export async function createResetToken(userId: string, purpose: "reset" | "invite" = "reset"): Promise<string> {
  const db = getDb();
  const raw = randomBytes(32).toString("hex");
  const hours = purpose === "invite" ? 24 * 7 : 1;
  await db.insert(schema.passwordResetTokens).values({
    userId,
    tokenHash: hash(raw),
    purpose,
    expiresAt: new Date(Date.now() + hours * 3600_000),
  });
  return raw;
}

/** Validates without consuming (for showing the reset form). */
export async function peekResetToken(raw: string): Promise<{ userId: string; purpose: string } | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(and(eq(schema.passwordResetTokens.tokenHash, hash(raw)), isNull(schema.passwordResetTokens.usedAt)));
  if (!row || row.expiresAt < new Date()) return null;
  return { userId: row.userId, purpose: row.purpose };
}

/** Consumes the token — call only when actually setting the password. */
export async function consumeResetToken(raw: string): Promise<string | null> {
  const db = getDb();
  const peeked = await peekResetToken(raw);
  if (!peeked) return null;
  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(schema.passwordResetTokens.tokenHash, hash(raw)));
  return peeked.userId;
}
