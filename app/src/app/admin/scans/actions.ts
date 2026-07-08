"use server";

/**
 * Scan-window management (admin) + serving-line scan actions (staff).
 *
 * Model: an event has scan "sessions" — entry check-in plus optional meal
 * windows (breakfast / lunch / dinner, per event day). Each ticket can be
 * scanned at most once per session (unique index), so a QR that already went
 * through the lunch line is flagged loudly if it comes back during lunch,
 * but works again at dinner.
 */
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { ensureScanTables } from "@/lib/scans/ensure";
import { getActiveEvent, type EventDay } from "@/lib/queries/events";
import { getConfig, setConfig } from "@/lib/system-config";

const MEAL_KINDS = ["breakfast", "lunch", "dinner"] as const;
export type MealKind = (typeof MEAL_KINDS)[number];

async function requireAdmin() {
  const s = await getSession();
  if (!s || !["admin", "super_admin"].includes(s.role)) throw new Error("UNAUTHORIZED");
  return s;
}

/** Check-in staff = admins + volunteers (volunteers can ONLY scan). */
async function requireStaff() {
  const s = await getSession();
  if (!s || !["admin", "super_admin", "volunteer"].includes(s.role)) throw new Error("UNAUTHORIZED");
  return s;
}

const KIND_LABEL: Record<string, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
};

function sessionLabel(kind: string, dayKey: string, days: EventDay[]) {
  const day = days.find((d) => d.key === dayKey);
  const dayPart = dayKey === "all" ? "" : `${day?.label ?? dayKey} · `;
  return `${dayPart}${KIND_LABEL[kind] ?? kind}`;
}

// ── setup (admin only) ──────────────────────────────────────────

export type ScanSessionInfo = {
  id: string;
  kind: string;
  dayKey: string;
  label: string;
  status: "open" | "closed";
  total: number;
  byFood: Record<string, number>; // veg / non_veg / kid / none
};

export async function toggleMealWindowAction(kind: MealKind, dayKey: string, enable: boolean) {
  const s = await requireAdmin();
  await ensureScanTables();
  const db = getDb();
  const event = await getActiveEvent();
  if (!event) throw new Error("No active event");
  const days = ((event.days as EventDay[] | null) ?? []) as EventDay[];

  if (enable) {
    await db
      .insert(schema.scanSessions)
      .values({
        eventId: event.id,
        kind,
        dayKey,
        label: sessionLabel(kind, dayKey, days),
        createdBy: s.userId,
      })
      .onConflictDoNothing();
  } else {
    await db
      .delete(schema.scanSessions)
      .where(
        and(
          eq(schema.scanSessions.eventId, event.id),
          eq(schema.scanSessions.kind, kind),
          eq(schema.scanSessions.dayKey, dayKey)
        )
      );
  }
  await db.insert(schema.auditLog).values({
    userId: s.userId,
    action: enable ? "scan_window_enabled" : "scan_window_removed",
    entityType: "scan_sessions",
    entityId: `${event.id}:${kind}:${dayKey}`,
  });
  revalidatePath("/admin/scans");
  revalidatePath("/admin/checkin");
}

export async function setSessionStatusAction(sessionId: string, status: "open" | "closed") {
  const s = await requireAdmin();
  await ensureScanTables();
  const db = getDb();
  await db
    .update(schema.scanSessions)
    .set(
      status === "open"
        ? { status, openedAt: new Date(), closedAt: null }
        : { status, closedAt: new Date() }
    )
    .where(eq(schema.scanSessions.id, sessionId));
  await db.insert(schema.auditLog).values({
    userId: s.userId,
    action: status === "open" ? "scan_window_opened" : "scan_window_closed",
    entityType: "scan_sessions",
    entityId: sessionId,
  });
  revalidatePath("/admin/scans");
  revalidatePath("/admin/checkin");
}

export async function saveFoodColorsAction(colors: { veg: string; non_veg: string; kid: string }) {
  const s = await requireAdmin();
  const ok = /^#[0-9a-fA-F]{6}$/;
  for (const v of Object.values(colors)) if (!ok.test(v)) throw new Error("Invalid color");
  await setConfig("food_color_veg", colors.veg, s.userId);
  await setConfig("food_color_non_veg", colors.non_veg, s.userId);
  await setConfig("food_color_kid", colors.kid, s.userId);
  revalidatePath("/admin/scans");
  revalidatePath("/admin/checkin");
}

// ── serving-line scans (staff) ──────────────────────────────────

export type ServeResult =
  | {
      kind: "served";
      attendee: string;
      food: string; // veg | non_veg | kid | none
      conf: string;
      sessionLabel: string;
      count: number; // served so far in this session
    }
  | {
      kind: "duplicate";
      attendee: string;
      food: string;
      conf: string;
      sessionLabel: string;
      scannedAt: string;
    }
  | { kind: "invalid"; reason: string };

/** Serve one ticket in a meal session. Race-safe: the unique index decides. */
export async function serveTicketAction(sessionId: string, ticketId: string): Promise<ServeResult> {
  const staff = await requireStaff();
  await ensureScanTables();
  const db = getDb();

  const [sess] = await db.select().from(schema.scanSessions).where(eq(schema.scanSessions.id, sessionId));
  if (!sess) return { kind: "invalid", reason: "Scan window not found." };
  if (sess.status !== "open") return { kind: "invalid", reason: `${sess.label} is not open right now.` };

  const [ticket] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId));
  if (!ticket) return { kind: "invalid", reason: "Ticket not found." };
  const [reg] = await db
    .select()
    .from(schema.registrations)
    .where(eq(schema.registrations.id, ticket.registrationId));
  if (!reg || reg.status !== "paid") return { kind: "invalid", reason: "Ticket is not paid — not valid." };
  if (reg.eventId !== sess.eventId) return { kind: "invalid", reason: "Ticket is for a different event." };

  // day coverage: an 'all'-days pass works every day; a single-day pass only on its day
  const covered = sess.dayKey === "all" || ticket.dayKey === "all" || ticket.dayKey === sess.dayKey;
  if (!covered)
    return { kind: "invalid", reason: `This pass is for ${ticket.dayKey?.toUpperCase()} — not valid for ${sess.label}.` };

  const attendee = `${ticket.attendeeFirstName} ${ticket.attendeeLastName ?? ""}`.trim();
  const food = ticket.foodPref ?? "none";

  const inserted = await db
    .insert(schema.ticketScans)
    .values({ sessionId, ticketId, scannedBy: staff.userId })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    const [prev] = await db
      .select()
      .from(schema.ticketScans)
      .where(and(eq(schema.ticketScans.sessionId, sessionId), eq(schema.ticketScans.ticketId, ticketId)));
    return {
      kind: "duplicate",
      attendee,
      food,
      conf: reg.confirmationNumber,
      sessionLabel: sess.label,
      scannedAt:
        prev?.scannedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) ?? "earlier",
    };
  }

  await db.insert(schema.auditLog).values({
    userId: staff.userId,
    action: "meal_scan",
    entityType: "ticket_scans",
    entityId: inserted[0].id,
    changes: { session: sess.label, ticketId },
  });

  const count = (
    await db.select().from(schema.ticketScans).where(eq(schema.ticketScans.sessionId, sessionId))
  ).length;

  return { kind: "served", attendee, food, conf: reg.confirmationNumber, sessionLabel: sess.label, count };
}

export type MealLookupTicket = {
  id: string;
  attendee: string;
  isKid: boolean;
  conf: string;
  day: string;
  food: string;
  servedAt: string | null;
  eligible: boolean;
  reason?: string;
};

/** Name/QR/conf lookup scoped to a meal session, with per-ticket served status. */
export async function mealLookupAction(sessionId: string, rawQuery: string): Promise<MealLookupTicket[]> {
  await requireStaff();
  await ensureScanTables();
  const db = getDb();
  const [sess] = await db.select().from(schema.scanSessions).where(eq(schema.scanSessions.id, sessionId));
  if (!sess) return [];

  // Reuse the check-in lookup (same normalization + paid-only filter)…
  const { lookupTicketsAction } = await import("../checkin/actions");
  const base = await lookupTicketsAction(rawQuery);
  if (base.length === 0) return [];

  const scans = await db
    .select()
    .from(schema.ticketScans)
    .where(
      and(
        eq(schema.ticketScans.sessionId, sessionId),
        inArray(
          schema.ticketScans.ticketId,
          base.map((t) => t.id)
        )
      )
    );
  const scanByTicket = new Map(scans.map((sc) => [sc.ticketId, sc]));

  return base.map((t) => {
    const covered = sess.dayKey === "all" || t.day === "all" || t.day === sess.dayKey;
    const scan = scanByTicket.get(t.id);
    return {
      id: t.id,
      attendee: t.attendee,
      isKid: t.isKid,
      conf: t.conf,
      day: t.day,
      food: t.food ?? "none",
      servedAt: scan
        ? scan.scannedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
        : null,
      eligible: covered,
      reason: covered ? undefined : `Pass is for ${t.day.toUpperCase()} only`,
    };
  });
}

// ── shared loader (setup page + scan station) ───────────────────

export async function getScanState() {
  await requireStaff();
  await ensureScanTables();
  const db = getDb();
  const event = await getActiveEvent();
  if (!event) return null;

  const sessions = await db
    .select()
    .from(schema.scanSessions)
    .where(eq(schema.scanSessions.eventId, event.id));

  const sessionInfos: ScanSessionInfo[] = [];
  for (const sess of sessions) {
    const scans = await db
      .select()
      .from(schema.ticketScans)
      .where(eq(schema.ticketScans.sessionId, sess.id));
    const byFood: Record<string, number> = {};
    if (scans.length > 0) {
      const ids = scans.map((sc) => sc.ticketId);
      const tix = await db.select().from(schema.tickets).where(inArray(schema.tickets.id, ids));
      for (const t of tix) byFood[t.foodPref ?? "none"] = (byFood[t.foodPref ?? "none"] ?? 0) + 1;
    }
    sessionInfos.push({
      id: sess.id,
      kind: sess.kind,
      dayKey: sess.dayKey,
      label: sess.label,
      status: sess.status as "open" | "closed",
      total: scans.length,
      byFood,
    });
  }

  const colors = {
    veg: await getConfig<string>("food_color_veg"),
    non_veg: await getConfig<string>("food_color_non_veg"),
    kid: await getConfig<string>("food_color_kid"),
  };

  return {
    event: { id: event.id, name: event.name, days: ((event.days as EventDay[] | null) ?? []) as EventDay[] },
    sessions: sessionInfos,
    colors,
  };
}
