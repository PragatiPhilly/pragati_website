"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireAdmin } from "@/lib/auth/session";
import { ensureExtraColumns } from "@/lib/schema-ensure";

export async function setActiveEventAction(slug: string) {
  // Switching the current event always goes through the close-out (spec/19):
  // otherwise the outgoing event's stray donations and dues would silently show
  // up under the new event. Publishing is left as it is.
  const admin = await requireAdmin();
  const db = getDb();
  const [next] = await db.select().from(schema.events).where(eq(schema.events.slug, slug));
  if (!next) return;
  const { closeOutAndSwitch } = await import("@/lib/seasons");
  await closeOutAndSwitch(next.id, { publish: false, actor: { userId: admin.userId, name: admin.name ?? admin.email } });
  revalidatePath("/");
  revalidatePath("/admin", "layout");
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

/**
 * The one button (spec/19): close the current event — file its stray money
 * under it and freeze its final numbers — and make `nextEventId` current,
 * optionally publishing it so online registration opens.
 */
export async function closeOutAndSwitchAction(
  nextEventId: string,
  publish: boolean
): Promise<{ ok: true; result: import("@/lib/seasons").CloseOutResult } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  try {
    const { closeOutAndSwitch, LENS_COOKIE } = await import("@/lib/seasons");
    const result = await closeOutAndSwitch(nextEventId, { publish, actor: { userId: admin.userId, name: admin.name ?? admin.email } });
    // every admin tab starts on the new current event
    const { cookies } = await import("next/headers");
    (await cookies()).delete({ name: LENS_COOKIE, path: "/admin" });
    revalidatePath("/", "layout");
    revalidatePath("/admin", "layout");
    revalidatePassPages();
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Something went wrong." };
  }
}
