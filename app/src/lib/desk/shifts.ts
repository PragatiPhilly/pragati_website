/**
 * Shifts — one station's till session.
 *
 * A drawer that nobody counted is a drawer nobody can be asked about. Opening a
 * shift records who is on and what the float was; closing it counts the cash
 * against what the ledger says should be there. A variance is allowed — money
 * gets miscounted at a busy door — but it is never silent: it needs a note, and
 * it lands on the report with a name and a station beside it.
 *
 * Every tender carries its shift id, so when two stations run at once each
 * drawer still reconciles on its own even though both stations can see and
 * serve the same order.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { DeskError, type DeskActor } from "@/lib/desk/guards";
import { cashTakenInShift } from "@/lib/desk/tenders";

export type Shift = typeof schema.deskShifts.$inferSelect;

export async function currentShift(eventId: string, station?: string): Promise<Shift | null> {
  await ensureDeskSchema();
  const db = getDb();
  try {
    const conds = [eq(schema.deskShifts.eventId, eventId), eq(schema.deskShifts.status, "open")];
    if (station) conds.push(eq(schema.deskShifts.station, station));
    const [row] = await db
      .select()
      .from(schema.deskShifts)
      .where(and(...conds))
      .orderBy(desc(schema.deskShifts.openedAt))
      .limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

export async function openShift(
  input: { eventId: string; station: string; dayKey?: string; openingFloatCents: number; note?: string },
  actor: DeskActor
): Promise<Shift> {
  await ensureDeskSchema();
  const db = getDb();
  const station = input.station.trim() || "desk-1";
  const existing = await currentShift(input.eventId, station);
  if (existing) throw new DeskError(`The ${station} cash box is already open (started by ${existing.openedByEmail ?? "someone"}). Use it, or count it first.`);
  if (input.openingFloatCents < 0) throw new DeskError("Starting change can't be a negative number.");

  const [row] = await db
    .insert(schema.deskShifts)
    .values({
      eventId: input.eventId,
      station,
      dayKey: input.dayKey ?? "all",
      openedBy: actor.userId,
      openedByEmail: actor.email,
      openingFloatCents: Math.round(input.openingFloatCents),
      note: input.note?.trim() || null,
    })
    .returning();
  return row;
}

/** Cash handed to the treasurer mid-shift. The drawer's expected total drops. */
export async function recordDrop(shiftId: string, amountCents: number, toWhom: string, actor: DeskActor): Promise<void> {
  if (amountCents <= 0) throw new DeskError("Type how much cash you handed over.");
  if (!toWhom.trim()) throw new DeskError("Say who you handed it to.");
  await ensureDeskSchema();
  const db = getDb();
  const [shift] = await db.select().from(schema.deskShifts).where(eq(schema.deskShifts.id, shiftId));
  if (!shift) throw new DeskError("That cash box is no longer there.");
  if (shift.status !== "open") throw new DeskError("That cash box has already been counted.");
  await db
    .update(schema.deskShifts)
    .set({
      dropsCents: sql`${schema.deskShifts.dropsCents} + ${Math.round(amountCents)}`,
      note: [shift.note, `Drop ${(amountCents / 100).toFixed(2)} → ${toWhom.trim()} (${actor.email})`]
        .filter(Boolean)
        .join(" · "),
    })
    .where(eq(schema.deskShifts.id, shiftId));
  try {
    await db.insert(schema.auditLog).values({
      userId: actor.userId,
      action: "desk_cash_drop",
      entityType: "desk_shifts",
      entityId: shiftId,
      changes: { amountCents, toWhom: toWhom.trim() } as unknown as Record<string, unknown>,
    });
  } catch {
    /* best effort */
  }
}

export type ShiftCloseView = {
  shift: Shift;
  cashTakenCents: number;
  expectedCashCents: number;
  openOrders: { id: string; conf: string; buyerName: string; balanceCents: number }[];
};

export async function shiftCloseView(shiftId: string): Promise<ShiftCloseView | null> {
  await ensureDeskSchema();
  const db = getDb();
  const [shift] = await db.select().from(schema.deskShifts).where(eq(schema.deskShifts.id, shiftId));
  if (!shift) return null;
  const cashTakenCents = await cashTakenInShift(shiftId);
  const expectedCashCents = shift.openingFloatCents + cashTakenCents - shift.dropsCents;

  // An order still open at close-out is either owed money or half-typed. Either
  // way it is somebody's problem tonight, not next week's.
  let openOrders: ShiftCloseView["openOrders"] = [];
  try {
    const rows = await db
      .select({
        id: schema.registrations.id,
        conf: schema.registrations.confirmationNumber,
        buyerName: schema.registrations.buyerName,
        totalCents: schema.registrations.totalCents,
        status: schema.registrations.status,
      })
      .from(schema.registrations)
      .where(and(eq(schema.registrations.deskShiftId, shiftId), eq(schema.registrations.deskState, "open")));
    openOrders = rows.map((r) => ({
      id: r.id,
      conf: r.conf,
      buyerName: r.buyerName,
      balanceCents: r.status === "paid" ? 0 : r.totalCents,
    }));
  } catch {
    /* skip */
  }
  return { shift, cashTakenCents, expectedCashCents, openOrders };
}

/**
 * Close the till.
 *
 * Refuses while an order on this shift is still open — that is the one thing a
 * close-out has to catch, because tomorrow nobody will remember. A variance is
 * never refused, only recorded, and never without a note.
 */
export async function closeShift(
  input: { shiftId: string; countedCashCents: number; varianceNote?: string; force?: boolean },
  actor: DeskActor
): Promise<{ varianceCents: number }> {
  if (!actor.isAdmin && !actor.isTreasurer)
    throw new DeskError("Counting the cash box at the end is done by an admin or the treasurer.");
  const view = await shiftCloseView(input.shiftId);
  if (!view) throw new DeskError("That cash box is no longer there.");
  if (view.shift.status === "closed") throw new DeskError("That cash box has already been counted.");
  if (view.openOrders.length > 0 && !input.force)
    throw new DeskError(
      `${view.openOrders.length} order${view.openOrders.length === 1 ? " is" : "s are"} still unfinished at this desk (${view.openOrders
        .map((o) => o.conf)
        .join(", ")}). Settle or void them first.`
    );

  const variance = Math.round(input.countedCashCents) - view.expectedCashCents;
  if (variance !== 0 && !input.varianceNote?.trim())
    throw new DeskError(
      `There's $${(Math.abs(variance) / 100).toFixed(2)} ${variance > 0 ? "more" : "less"} in the box than expected — say what you think happened before finishing.`
    );

  const db = getDb();
  await db
    .update(schema.deskShifts)
    .set({
      status: "closed",
      closedBy: actor.userId,
      closedAt: new Date(),
      countedCashCents: Math.round(input.countedCashCents),
      expectedCashCents: view.expectedCashCents,
      varianceCents: variance,
      varianceNote: input.varianceNote?.trim() || null,
    })
    .where(eq(schema.deskShifts.id, input.shiftId));

  try {
    await db.insert(schema.auditLog).values({
      userId: actor.userId,
      action: "desk_shift_closed",
      entityType: "desk_shifts",
      entityId: input.shiftId,
      changes: {
        station: view.shift.station,
        expectedCashCents: view.expectedCashCents,
        countedCashCents: Math.round(input.countedCashCents),
        varianceCents: variance,
        note: input.varianceNote?.trim() ?? null,
        forced: !!input.force,
      } as unknown as Record<string, unknown>,
    });
  } catch {
    /* best effort */
  }
  return { varianceCents: variance };
}

export async function listShifts(eventId: string): Promise<Shift[]> {
  await ensureDeskSchema();
  const db = getDb();
  try {
    return await db
      .select()
      .from(schema.deskShifts)
      .where(eq(schema.deskShifts.eventId, eventId))
      .orderBy(desc(schema.deskShifts.openedAt))
      .limit(50);
  } catch {
    return [];
  }
}
