"use server";

import { getSession } from "@/lib/auth/session";
import { sendBackupEmail } from "@/lib/backup";
import { getDb, schema } from "@/db/client";

/** Manual "send the backup right now" — any admin. */
export async function sendBackupNowAction() {
  const s = await getSession();
  if (!s || !["admin", "super_admin"].includes(s.role)) throw new Error("UNAUTHORIZED");
  const result = await sendBackupEmail("manual");
  const db = getDb();
  await db.insert(schema.auditLog).values({
    userId: s.userId,
    action: "backup_email_sent",
    entityType: "registrations",
  });
  return result;
}
