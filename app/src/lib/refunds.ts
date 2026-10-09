/**
 * Cancelling passes after payment, and recording the refund.
 *
 * Two separate facts, both recorded, neither moving money by itself:
 *   1. Which passes stop working — a row per pass in ticket_voids. The ticket
 *      row is never edited or deleted. A voided pass is refused at the gate and
 *      drops out of every count (kitchen, coupons, door list, dashboard).
 *   2. How much went back, how and when — a ledger row with status "refunded"
 *      (positive amount, the refund method). A CARD refund is done in the
 *      Square dashboard first; this only records it. Zelle/cash/cheque refunds
 *      are made by the treasurer and recorded here.
 *
 * Online bookings only. A walk-in desk order is cancelled with the desk's own
 * tools (void / reverse a payment), which already raise "we owe them money".
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensurePaymentsTable } from "@/lib/ledger-ensure";

let ensured: Promise<void> | null = null;

export function ensureRefundSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await getDb().execute(sql`CREATE TABLE IF NOT EXISTS ticket_voids (
      ticket_id text PRIMARY KEY,
      registration_id text NOT NULL,
      voided_at timestamptz NOT NULL DEFAULT now(),
      voided_by text,
      reason text,
      refund_payment_id text
    );`);
  })().catch((e) => {
    ensured = null;
    throw e;
  });
  return ensured;
}

/** Every cancelled pass id (small table — read whole). Never throws. */
export async function voidedTicketIds(): Promise<Set<string>> {
  try {
    await ensureRefundSchema();
    const rows = await getDb().select({ id: schema.ticketVoids.ticketId }).from(schema.ticketVoids);
    return new Set(rows.map((r) => r.id));
  } catch {
    return new Set();
  }
}

export async function isTicketVoided(ticketId: string): Promise<boolean> {
  try {
    await ensureRefundSchema();
    const [r] = await getDb().select().from(schema.ticketVoids).where(eq(schema.ticketVoids.ticketId, ticketId));
    return !!r;
  } catch {
    return false;
  }
}

export type RefundMethod = "square" | "zelle" | "cash" | "check";
export const REFUND_METHOD_LABEL: Record<RefundMethod, string> = {
  square: "Card — refunded in the Square dashboard",
  zelle: "Zelle back to them",
  cash: "Cash back",
  check: "Cheque",
};

export class RefundError extends Error {}

export async function refundView(registrationId: string) {
  await ensureRefundSchema();
  await ensurePaymentsTable();
  const db = getDb();
  const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId));
  if (!reg) return null;
  const rows = await db
    .select({ t: schema.tickets, typeName: schema.ticketTypes.name })
    .from(schema.tickets)
    .innerJoin(schema.ticketTypes, eq(schema.ticketTypes.id, schema.tickets.ticketTypeId))
    .where(eq(schema.tickets.registrationId, registrationId));
  const voids = await db.select().from(schema.ticketVoids).where(eq(schema.ticketVoids.registrationId, registrationId));
  const ledger = await db.select().from(schema.payments).where(eq(schema.payments.entityId, registrationId));
  const paidCents = ledger.filter((p) => p.status === "paid").reduce((n, p) => n + p.amountCents + (p.feeCents ?? 0), 0);
  const refunds = ledger.filter((p) => p.status === "refunded" && p.source === "refund");
  const refundedCents = refunds.reduce((n, p) => n + p.amountCents, 0);
  return {
    reg,
    isDesk: reg.source === "desk" || !!reg.deskState,
    tickets: rows.map(({ t, typeName }) => ({
      id: t.id,
      name: `${t.attendeeFirstName} ${t.attendeeLastName ?? ""}`.trim(),
      pass: typeName,
      dayKey: t.dayKey ?? "all",
      priceCents: t.priceCents ?? 0,
      used: !!t.checkedInAt,
      voided: voids.find((v) => v.ticketId === t.id) ?? null,
    })),
    paidCents,
    refundedCents,
    refunds: refunds.map((p) => ({ id: p.id, amountCents: p.amountCents, method: p.method, note: p.note, at: p.paidAt ?? p.createdAt })),
  };
}

export async function cancelAndRefund(
  registrationId: string,
  input: { ticketIds: string[]; refundCents: number; method: RefundMethod; note: string },
  actor: { userId: string; email?: string }
): Promise<{ voided: number; refundCents: number }> {
  const v = await refundView(registrationId);
  if (!v) throw new RefundError("Booking not found.");
  if (v.isDesk) throw new RefundError("This is a walk-in desk booking — cancel it at the walk-in desk (it records the refund owed there).");
  if (v.reg.status !== "paid") throw new RefundError("Only a paid booking can be refunded. An unpaid one can simply be left — it never admits anyone.");
  if (!input.note.trim()) throw new RefundError("Say why (e.g. 'paid twice', 'can't come Sunday').");
  const cents = Math.round(input.refundCents);
  if (!Number.isFinite(cents) || cents < 0) throw new RefundError("The refund amount isn't a valid number.");
  if (cents === 0 && input.ticketIds.length === 0) throw new RefundError("Pick passes to cancel, or enter a refund amount.");
  const room = v.paidCents - v.refundedCents;
  if (cents > room) throw new RefundError(`That's more than is left to refund on this booking (${(room / 100).toFixed(2)}).`);

  const byId = new Map(v.tickets.map((t) => [t.id, t]));
  for (const id of input.ticketIds) {
    const t = byId.get(id);
    if (!t) throw new RefundError("A selected pass isn't on this booking.");
    if (t.voided) throw new RefundError(`${t.name}'s pass is already cancelled.`);
    if (t.used) throw new RefundError(`${t.name}'s pass was already used at the gate, so it can't be cancelled.`);
  }

  const db = getDb();
  let refundPaymentId: string | null = null;
  if (cents > 0) {
    const [row] = await db
      .insert(schema.payments)
      .values({
        kind: "registration",
        entityId: registrationId,
        groupId: registrationId,
        payerName: v.reg.buyerName,
        payerEmail: v.reg.buyerEmail,
        amountCents: cents,
        method: input.method,
        status: "refunded",
        paidAt: new Date(), // when the money went back
        reference: v.reg.confirmationNumber,
        verifiedBy: actor.userId,
        verifiedAt: new Date(),
        source: "refund",
        note: `Refund: ${input.note.trim()}`,
      })
      .returning({ id: schema.payments.id });
    refundPaymentId = row.id;
  }

  if (input.ticketIds.length) {
    await ensureRefundSchema();
    await db
      .insert(schema.ticketVoids)
      .values(
        input.ticketIds.map((ticketId) => ({
          ticketId,
          registrationId,
          voidedBy: actor.userId,
          reason: input.note.trim(),
          refundPaymentId,
        }))
      )
      .onConflictDoNothing();
    // A cancelled pass gives its seat back.
    const tickets = await db.select().from(schema.tickets).where(inArray(schema.tickets.id, input.ticketIds));
    for (const t of tickets) {
      await db
        .update(schema.ticketTypes)
        .set({ soldCount: sql`GREATEST(${schema.ticketTypes.soldCount} - 1, 0)` })
        .where(eq(schema.ticketTypes.id, t.ticketTypeId));
    }
  }

  const passNames = input.ticketIds.map((id) => byId.get(id)!.name);
  const line = `${v.reg.confirmationNumber}: ${passNames.length ? `cancelled ${passNames.join(", ")}` : "no passes cancelled"}; refunded $${(cents / 100).toFixed(2)} (${input.method}) — ${input.note.trim()}`;
  await db.update(schema.registrations).set({ notes: [v.reg.notes, line].filter(Boolean).join("\n"), updatedAt: new Date() }).where(eq(schema.registrations.id, registrationId));
  await db.insert(schema.auditLog).values({
    userId: actor.userId,
    action: "refund_recorded",
    entityType: "registrations",
    entityId: registrationId,
    changes: { ticketIds: input.ticketIds, refundCents: cents, method: input.method, note: input.note.trim() },
  });
  void and;
  return { voided: input.ticketIds.length, refundCents: cents };
}
