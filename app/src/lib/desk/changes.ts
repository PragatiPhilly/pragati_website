/**
 * Change a booking at the door — the three things families actually ask for,
 * all at the SAME price:
 *   - fix a name,
 *   - switch veg ↔ non-veg,
 *   - move a single-day pass to another day ("we can't make Saturday, can we
 *     come Sunday?") — only onto a pass of the same kind and the same price.
 * Anything that changes the price is a new sale: "+ Add more people" at the
 * walk-in desk. The pass keeps its QR code, so the family's existing email /
 * phone pass keeps working for the new day.
 *
 * Works for walk-in AND online bookings. Never touches money.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { DeskError, isDeskOrder, type DeskActor } from "./guards";
import { recordOrderEvent } from "./events";

type Ticket = typeof schema.tickets.$inferSelect;
type TicketType = typeof schema.ticketTypes.$inferSelect;
type Day = { key: string; label?: string };

const FOOD_BANDS = new Set(["adult", "student", "all"]);

/** Can this person switch veg ↔ non-veg? (Kids get the kid meal; concert / no-food passes have no meal.) */
export function canChangeFood(type: TicketType, ticket: Ticket): boolean {
  return type.withFood && FOOD_BANDS.has(type.ageBand) && (ticket.foodPref === "veg" || ticket.foodPref === "non_veg");
}

/** Other days this ticket could move to — same kind of pass, same food, same price. */
export function dayOptions(ticket: Ticket, type: TicketType, all: TicketType[], days: Day[]): { ticketTypeId: string; dayKey: string; label: string }[] {
  const own = Array.isArray(type.dayKeys) ? (type.dayKeys as string[]) : [];
  if (own.length !== 1 || ticket.dayKey !== own[0]) return []; // single-day passes only
  return all
    .filter(
      (t) =>
        t.id !== type.id &&
        !t.archivedAt &&
        t.eventId === type.eventId &&
        t.ageBand === type.ageBand &&
        t.withFood === type.withFood &&
        t.priceMemberCents === type.priceMemberCents &&
        t.priceNonmemberCents === type.priceNonmemberCents &&
        Array.isArray(t.dayKeys) &&
        (t.dayKeys as string[]).length === 1 &&
        (t.dayKeys as string[])[0] !== own[0]
    )
    .map((t) => {
      const dk = (t.dayKeys as string[])[0];
      return { ticketTypeId: t.id, dayKey: dk, label: (days.find((d) => d.key === dk)?.label ?? dk).split(",")[0] };
    });
}

export async function changeTicket(
  ticketId: string,
  patch: { firstName?: string; lastName?: string; foodPref?: "veg" | "non_veg"; toTicketTypeId?: string },
  actor: DeskActor
): Promise<string> {
  const db = getDb();
  const [ticket] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, ticketId));
  if (!ticket) throw new DeskError("That pass no longer exists.");
  const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, ticket.registrationId));
  if (!reg) throw new DeskError("That booking no longer exists.");
  if (reg.deskState === "voided" || reg.status.startsWith("cancelled")) throw new DeskError("This booking was cancelled — it can't be changed.");
  const [type] = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.id, ticket.ticketTypeId));
  if (!type) throw new DeskError("That pass type no longer exists.");

  const set: Partial<Ticket> = {};
  const said: string[] = [];

  if (patch.firstName !== undefined || patch.lastName !== undefined) {
    const first = (patch.firstName ?? ticket.attendeeFirstName).trim();
    const last = (patch.lastName ?? ticket.attendeeLastName ?? "").trim();
    if (!first) throw new DeskError("A first name is needed.");
    if (first !== ticket.attendeeFirstName || last !== (ticket.attendeeLastName ?? "")) {
      set.attendeeFirstName = first;
      set.attendeeLastName = last || null;
      said.push(`name ${ticket.attendeeFirstName} ${ticket.attendeeLastName ?? ""} → ${first} ${last}`.replace(/\s+/g, " ").trim());
    }
  }

  if (patch.foodPref && patch.foodPref !== ticket.foodPref) {
    if (!canChangeFood(type, ticket)) throw new DeskError("This pass has no veg / non-veg choice.");
    set.foodPref = patch.foodPref;
    said.push(`food → ${patch.foodPref === "veg" ? "veg" : "non-veg"}`);
  }

  let moved: { from: string; to: TicketType; day: string } | null = null;
  if (patch.toTicketTypeId && patch.toTicketTypeId !== type.id) {
    if (ticket.checkedInAt) throw new DeskError("This pass has already been used at the gate, so its day can't be moved.");
    const [event] = await db.select().from(schema.events).where(eq(schema.events.id, reg.eventId));
    const all = await db.select().from(schema.ticketTypes).where(and(eq(schema.ticketTypes.eventId, reg.eventId), isNull(schema.ticketTypes.archivedAt)));
    const opt = dayOptions(ticket, type, all, (event?.days as Day[] | null) ?? []).find((o) => o.ticketTypeId === patch.toTicketTypeId);
    if (!opt) throw new DeskError("That day isn't a same-price swap. Sell a new pass at the desk (+ Add more people) instead.");
    const to = all.find((t) => t.id === opt.ticketTypeId)!;
    set.ticketTypeId = to.id;
    set.dayKey = opt.dayKey;
    moved = { from: type.id, to, day: opt.label };
    said.push(`day → ${opt.label} (${to.name})`);
  }

  if (said.length === 0) return "Nothing changed.";
  await db.update(schema.tickets).set(set).where(eq(schema.tickets.id, ticketId));

  // Sold counters follow the seat — but only where a seat was actually taken
  // (paid web bookings; desk orders take seats when they open).
  if (moved && (reg.status === "paid" || isDeskOrder(reg))) {
    await db.update(schema.ticketTypes).set({ soldCount: sql`GREATEST(${schema.ticketTypes.soldCount} - 1, 0)` }).where(eq(schema.ticketTypes.id, moved.from));
    await db.update(schema.ticketTypes).set({ soldCount: sql`${schema.ticketTypes.soldCount} + 1` }).where(eq(schema.ticketTypes.id, moved.to.id));
  }

  const summary = `${ticket.attendeeFirstName}: ${said.join(" · ")}`;
  await recordOrderEvent({ registrationId: reg.id, type: "details_edited", summary, actor, payload: { ticketId, ...patch } });
  await db.insert(schema.auditLog).values({
    userId: actor.userId,
    action: "ticket_changed",
    entityType: "tickets",
    entityId: ticketId,
    changes: { summary, ...patch } as unknown as Record<string, unknown>,
  });
  return summary;
}
