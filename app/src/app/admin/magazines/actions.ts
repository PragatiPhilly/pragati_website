"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { deleteMagazinePdf } from "@/lib/magazines";
import { ensureScanTables } from "@/lib/scans/ensure";

async function requireAdmin() {
  const s = await getSession();
  if (!s || !["admin", "super_admin"].includes(s.role)) throw new Error("UNAUTHORIZED");
  return s;
}

export async function deleteMagazineAction(id: string) {
  const s = await requireAdmin();
  await ensureScanTables();
  const db = getDb();
  const [mag] = await db.select().from(schema.magazines).where(eq(schema.magazines.id, id));
  if (!mag) return;
  await deleteMagazinePdf(mag.fileUrl);
  await db.delete(schema.magazines).where(eq(schema.magazines.id, id));
  await db.insert(schema.auditLog).values({
    userId: s.userId,
    action: "magazine_deleted",
    entityType: "magazines",
    entityId: String(mag.year),
  });
  revalidatePath("/admin/magazines");
  revalidatePath("/");
}
