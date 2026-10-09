"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { setConfig } from "@/lib/system-config";
import { ensureExtraColumns } from "@/lib/schema-ensure";

export async function setActiveEventAction(slug: string) {
  const admin = await requireAdmin();
  await setConfig("active_event_slug", slug, admin.userId);
  const db = getDb();
  await db.insert(schema.auditLog).values({
    userId: admin.userId,
    action: "update",
    entityType: "system_config",
    changes: { active_event_slug: slug },
  });
  revalidatePath("/");
  revalidatePath("/admin/events");
}

/** Every page that shows a pass or sells one online. */
function revalidatePassPages() {
  revalidatePath("/");
  revalidatePath("/events", "layout");
  revalidatePath("/register");
  revalidatePath("/admin/events");
}

/**
 * Open or close ONE pass for online registration. Closing only affects the
 * public website — the walk-in desk keeps selling the pass, and tickets
 * already sold are untouched. Reversible at any time.
 */
export async function setPassOnlineOpenAction(ticketTypeId: string, open: boolean): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  await ensureExtraColumns();
  const db = getDb();
  const [t] = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, ticketTypeId));
  if (!t) return { ok: false, error: "That pass no longer exists." };
  await db
    .update(schema.ticketTypes)
    .set({ onlineClosedAt: open ? null : new Date(), updatedAt: new Date() })
    .where(eq(schema.ticketTypes.id, ticketTypeId));
  await db.insert(schema.auditLog).values({
    userId: admin.userId,
    action: "update",
    entityType: "ticket_type",
    entityId: ticketTypeId,
    changes: { online: open ? "opened" : "closed", name: t.name },
  });
  revalidatePassPages();
  return { ok: true };
}

/**
 * Shortcuts for one event:
 *  - "close_all_but_concert": close every non-concert pass online (day passes,
 *    student passes, extras), leave concert passes as they are.
 *  - "close_all": close every pass online.
 *  - "open_all": reopen every pass online.
 * Archived (removed) passes are never touched.
 */
export async function setEventPassesOnlineAction(
  eventId: string,
  mode: "close_all_but_concert" | "close_all" | "open_all"
): Promise<{ ok: boolean; changed: number }> {
  const admin = await requireAdmin();
  await ensureExtraColumns();
  const db = getDb();
  const live = and(eq(schema.ticketTypes.eventId, eventId), isNull(schema.ticketTypes.archivedAt));
  const where =
    mode === "close_all_but_concert"
      ? and(live, ne(schema.ticketTypes.ageBand, "concert"), isNull(schema.ticketTypes.onlineClosedAt))
      : mode === "close_all"
        ? and(live, isNull(schema.ticketTypes.onlineClosedAt))
        : live;
  const rows = await db
    .update(schema.ticketTypes)
    .set({ onlineClosedAt: mode === "open_all" ? null : new Date(), updatedAt: new Date() })
    .where(where)
    .returning({ id: schema.ticketTypes.id });
  await db.insert(schema.auditLog).values({
    userId: admin.userId,
    action: "update",
    entityType: "event",
    entityId: eventId,
    changes: { online_passes: mode, passes: rows.length },
  });
  revalidatePassPages();
  return { ok: true, changed: rows.length };
}
