"use server";

import { eq, ilike, or } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";

/** Check-in staff = admins + volunteers (volunteers can ONLY do check-in). */
async function requireCheckinStaff() {
  const s = await getSession();
  if (!s || !["admin", "super_admin", "volunteer"].includes(s.role)) throw new Error("UNAUTHORIZED");
  return s;
}

export type CheckinTicket = {
  id: string;
  attendee: string;
  isKid: boolean;
  conf: string;
  buyer: string;
  day: string;
  food: string | null;
  checkedInAt: string | null;
};

/** Accepts a confirmation number, a raw QR code, a scanned /t/<code> URL —
 *  or, for the "nothing on me" case, a NAME / PHONE / EMAIL search. */
function normalize(query: string): string {
  let q = query.trim();
  const m = q.match(/\/t\/([A-Za-z0-9-]+)/);
  if (m) q = m[1];
  return q;
}

export async function lookupTicketsAction(rawQuery: string): Promise<CheckinTicket[]> {
  await requireCheckinStaff();
  const db = getDb();
  const query = normalize(rawQuery);
  const q = query.toUpperCase();

  const regs = await db.select().from(schema.registrations);
  const regById = new Map(regs.map((r) => [r.id, r]));

  let tickets: (typeof schema.tickets.$inferSelect)[] = [];

  if (q.startsWith("PRG-")) {
    const reg = regs.find((r) => r.confirmationNumber === q);
    tickets = reg ? await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id)) : [];
  } else if (query.startsWith("PRAGATI-TKT-")) {
    tickets = await db.select().from(schema.tickets).where(eq(schema.tickets.qrCode, query));
  } else {
    // name / phone / email search across buyers AND attendees (paid only)
    const like = `%${query}%`;
    const byAttendee = await db
      .select()
      .from(schema.tickets)
      .where(or(ilike(schema.tickets.attendeeFirstName, like), ilike(schema.tickets.attendeeLastName, like)));
    const digits = query.replace(/\D/g, "");
    const matchingRegIds = regs
      .filter(
        (r) =>
          r.buyerName.toLowerCase().includes(query.toLowerCase()) ||
          r.buyerEmail.toLowerCase().includes(query.toLowerCase()) ||
          (digits.length >= 4 && (r.buyerPhone ?? "").replace(/\D/g, "").includes(digits))
      )
      .map((r) => r.id);
    const byBuyer =
      matchingRegIds.length > 0
        ? (await db.select().from(schema.tickets)).filter((t) => matchingRegIds.includes(t.registrationId))
        : [];
    const seen = new Set<string>();
    tickets = [...byAttendee, ...byBuyer].filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  }

  return tickets
    .filter((t) => regById.get(t.registrationId)?.status === "paid")
    .slice(0, 30)
    .map((t) => {
      const reg = regById.get(t.registrationId)!;
      return {
        id: t.id,
        attendee: `${t.attendeeFirstName} ${t.attendeeLastName ?? ""}`.trim(),
        isKid: (t.attendeeAge ?? 99) < 13,
        conf: reg.confirmationNumber,
        buyer: reg.buyerName,
        day: t.dayKey ?? "all",
        food: t.foodPref,
        checkedInAt: t.checkedInAt
          ? t.checkedInAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
          : null,
      };
    });
}

export type EntryScanResult =
  | { kind: "checked_in"; attendee: string; conf: string; food: string; count: number; total: number }
  | { kind: "duplicate"; attendee: string; conf: string; checkedInAt: string }
  | { kind: "list" } // several matches (or none) — client falls back to the list UI
  | { kind: "invalid"; reason: string };

/**
 * One-step gate scan: a QR that resolves to exactly one paid ticket is
 * checked in immediately; scanning the same QR again is flagged loudly.
 */
export async function entryScanAction(rawQuery: string): Promise<EntryScanResult> {
  const staff = await requireCheckinStaff();
  const db = getDb();
  const query = normalize(rawQuery);
  if (!query.startsWith("PRAGATI-TKT-")) return { kind: "list" }; // not a ticket QR

  const [ticket] = await db.select().from(schema.tickets).where(eq(schema.tickets.qrCode, query));
  if (!ticket) return { kind: "invalid", reason: "Unknown QR — not one of our tickets." };
  const [reg] = await db
    .select()
    .from(schema.registrations)
    .where(eq(schema.registrations.id, ticket.registrationId));
  if (!reg || reg.status !== "paid")
    return { kind: "invalid", reason: "NOT VALID — payment pending on this ticket." };

  const attendee = `${ticket.attendeeFirstName} ${ticket.attendeeLastName ?? ""}`.trim();

  if (ticket.checkedInAt) {
    return {
      kind: "duplicate",
      attendee,
      conf: reg.confirmationNumber,
      checkedInAt: ticket.checkedInAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    };
  }

  await db
    .update(schema.tickets)
    .set({ checkedInAt: new Date(), checkedInBy: staff.userId })
    .where(eq(schema.tickets.id, ticket.id));
  await db.insert(schema.auditLog).values({
    userId: staff.userId,
    action: "check_in",
    entityType: "tickets",
    entityId: ticket.id,
  });

  const all = await db.select().from(schema.tickets);
  const count = all.filter((t) => t.checkedInAt).length;

  return {
    kind: "checked_in",
    attendee,
    conf: reg.confirmationNumber,
    food: ticket.foodPref ?? "none",
    count,
    total: all.length,
  };
}

export async function checkInTicketAction(ticketId: string) {
  const staff = await requireCheckinStaff();
  const db = getDb();
  await db
    .update(schema.tickets)
    .set({ checkedInAt: new Date(), checkedInBy: staff.userId })
    .where(eq(schema.tickets.id, ticketId));
  await db.insert(schema.auditLog).values({
    userId: staff.userId,
    action: "check_in",
    entityType: "tickets",
    entityId: ticketId,
  });
}

/** Whole party at once — one tap for a six-person family. */
export async function checkInAllAction(ticketIds: string[]) {
  const staff = await requireCheckinStaff();
  const db = getDb();
  for (const id of ticketIds) {
    await db
      .update(schema.tickets)
      .set({ checkedInAt: new Date(), checkedInBy: staff.userId })
      .where(eq(schema.tickets.id, id));
    await db.insert(schema.auditLog).values({ userId: staff.userId, action: "check_in", entityType: "tickets", entityId: id });
  }
}

/** Scanned the wrong person? Undo restores the pass. */
export async function undoCheckInAction(ticketId: string) {
  const staff = await requireCheckinStaff();
  const db = getDb();
  await db
    .update(schema.tickets)
    .set({ checkedInAt: null, checkedInBy: null })
    .where(eq(schema.tickets.id, ticketId));
  await db.insert(schema.auditLog).values({
    userId: staff.userId,
    action: "undo_check_in",
    entityType: "tickets",
    entityId: ticketId,
  });
}
