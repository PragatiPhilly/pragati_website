/**
 * Taking payment AT THE DESK for a booking that was started ONLINE and never
 * paid (card checkout abandoned, Zelle never verified, or swept as unpaid).
 *
 * Before this, the desk showed such a booking with "payment is already handled
 * by the website" and offered nothing; only an admin could mark it paid, and
 * only as cash, from the Registrations page.
 *
 * The money path is the website's own: markRegistrationPaid() — the same call
 * the Zelle queue and "mark paid (cash)" use — so seats, the ledger and the
 * tickets email behave exactly as for any web booking. On top of that we stamp
 * the desk facts on the ledger rows: who took it, how, and WHERE THE MONEY IS
 * (cash box / cheque not banked / Zelle on someone's phone), so it shows up in
 * "Money to bank" like any desk payment.
 *
 * Card: a fresh Square link for exactly what the booking owes, shown as a QR;
 * Square's webhook settles it through the normal web path.
 */
import { and, eq, inArray, ne } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { markRegistrationPaid } from "@/lib/checkout";
import { expectedTotalCents, attachSquareOrder } from "@/lib/ledger";
import { createSquarePaymentLink } from "@/lib/payments/square";
import { ensureDeskSchema } from "./ensure";
import { currentShift } from "./shifts";
import { recordOrderEvent } from "./events";
import { raiseFollowup } from "./followups";
import { DeskError, type DeskActor } from "./guards";
import type { Custody } from "./constants";

/** Statuses the desk may settle. A booking an admin cancelled on purpose is not one of them. */
export const SETTLEABLE_ONLINE = ["pending_payment", "pending_zelle_verification", "cancelled_no_payment"];

export type OnlineSettleMethod = "cash" | "check" | "zelle_org" | "zelle_person";

export type OnlineBookingState = {
  /** Cash / cheque / Zelle: the booking without any card surcharge. */
  owesCents: number;
  /** By card: what Square will charge (includes the card fee if the booking had one). */
  cardCents: number;
  status: string;
  /** Same buyer, same event, already PAID — this one is probably an abandoned retry. */
  paidSiblings: { id: string; conf: string; passes: number }[];
};

const isDesk = (r: { source: string; deskState: string | null }) => r.source === "desk" || !!r.deskState;

export async function onlineBookingState(registrationId: string): Promise<OnlineBookingState | null> {
  const db = getDb();
  const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId));
  if (!reg || isDesk(reg) || !SETTLEABLE_ONLINE.includes(reg.status)) return null;
  const ledger = (await db.select().from(schema.payments).where(eq(schema.payments.entityId, reg.id))).filter((r) => r.status !== "refunded");
  const owes = ledger.length ? ledger.reduce((n, r) => n + r.amountCents, 0) : reg.totalCents;
  const card = (await expectedTotalCents(reg.id)) || reg.totalCents + (reg.processingFeeCents ?? 0);
  const email = reg.buyerEmail.trim().toLowerCase();
  const siblings = email
    ? (
        await db
          .select()
          .from(schema.registrations)
          .where(and(eq(schema.registrations.eventId, reg.eventId), eq(schema.registrations.status, "paid"), ne(schema.registrations.id, reg.id)))
      ).filter((r) => r.buyerEmail.trim().toLowerCase() === email)
    : [];
  const counts = siblings.length
    ? await db.select().from(schema.tickets).where(inArray(schema.tickets.registrationId, siblings.map((s) => s.id)))
    : [];
  return {
    owesCents: owes,
    cardCents: card,
    status: reg.status,
    paidSiblings: siblings.map((s) => ({ id: s.id, conf: s.confirmationNumber, passes: counts.filter((t) => t.registrationId === s.id).length })),
  };
}

async function loadSettleable(registrationId: string) {
  const db = getDb();
  const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId));
  if (!reg) throw new DeskError("Booking not found.");
  if (isDesk(reg)) throw new DeskError("This is a walk-in desk booking — take payment with the usual buttons.");
  if (reg.status === "paid") throw new DeskError("This booking is already paid.");
  if (!SETTLEABLE_ONLINE.includes(reg.status)) throw new DeskError("This booking was cancelled by an admin — start a new walk-in booking instead.");
  return reg;
}

export async function settleOnlineBooking(
  registrationId: string,
  input: { method: OnlineSettleMethod; checkNumber?: string; bank?: string; holder?: { userId: string; displayName: string }; note?: string },
  actor: DeskActor
): Promise<void> {
  await ensureDeskSchema();
  const reg = await loadSettleable(registrationId);
  if (input.method === "check" && !input.checkNumber?.trim()) throw new DeskError("Write down the cheque number.");
  if (input.method === "zelle_person" && !input.holder) throw new DeskError("Pick who received the Zelle.");

  const db = getDb();
  const shift = await currentShift(reg.eventId);
  if (input.method === "cash" && !shift) throw new DeskError("Open the cash box first (top of the desk page) before taking cash.");

  // The website's own settle path: seats, ledger, tickets email.
  await markRegistrationPaid(reg.id, {
    method: input.method.startsWith("zelle") ? "zelle" : "offline",
    adminUserId: actor.userId,
  });

  const method = input.method === "cash" ? "cash" : input.method === "check" ? "check" : "zelle";
  const custody: Custody =
    input.method === "cash" ? "in_drawer" : input.method === "check" ? "undeposited_check" : input.method === "zelle_person" ? "held_by_person" : "org_account";
  const instrument: Record<string, unknown> = { settledOnlineBookingAtDesk: true };
  if (input.method === "check") Object.assign(instrument, { checkNumber: input.checkNumber?.trim(), bank: input.bank?.trim() || null });
  if (input.method === "zelle_person") instrument.sentTo = input.holder;
  if (input.note?.trim()) instrument.note = input.note.trim();

  const rows = await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.entityId, reg.id), eq(schema.payments.status, "paid")));
  if (rows.length) {
    await db
      .update(schema.payments)
      .set({
        method,
        feeCents: 0, // no card surcharge on cash / cheque / Zelle
        collectedBy: actor.userId,
        custody,
        instrument,
        shiftId: shift?.id ?? null,
        updatedAt: new Date(),
      })
      .where(inArray(schema.payments.id, rows.map((r) => r.id)));
  }

  const total = rows.reduce((n, r) => n + r.amountCents, 0);
  const how = { cash: "cash", check: `cheque #${input.checkNumber?.trim()}`, zelle_org: "Zelle to Pragati", zelle_person: `Zelle to ${input.holder?.displayName}` }[input.method];
  await recordOrderEvent({
    registrationId: reg.id,
    type: "tender_added",
    summary: `Online booking paid at the desk — $${(total / 100).toFixed(2)} by ${how}`,
    actor,
    shiftId: shift?.id ?? null,
    payload: { method: input.method, previousStatus: reg.status },
  });
  const main = rows.find((r) => r.kind === "registration") ?? rows[0];
  if (main && input.method === "check") {
    await raiseFollowup({ kind: "check_uncleared", registrationId: reg.id, paymentId: main.id, createdBy: actor.userId, detail: how });
  }
  if (main && input.method === "zelle_person") {
    await raiseFollowup({ kind: "zelle_with_person", registrationId: reg.id, paymentId: main.id, createdBy: actor.userId, assignedTo: input.holder?.userId ?? null, detail: how });
  }
}

/** A fresh Square link for exactly what this online booking owes; the webhook settles it. */
export async function startOnlineCardPayment(registrationId: string, actor: DeskActor): Promise<{ url: string; amountCents: number }> {
  const reg = await loadSettleable(registrationId);
  const db = getDb();
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, reg.eventId));
  const amountCents = (await expectedTotalCents(reg.id)) || reg.totalCents + (reg.processingFeeCents ?? 0);
  if (amountCents <= 0) throw new DeskError("Nothing to charge on this booking.");
  const link = await createSquarePaymentLink({
    referenceId: reg.id,
    confirmationNumber: reg.confirmationNumber,
    amountCents,
    description: `${event?.name ?? "Pragati"} tickets — ${reg.confirmationNumber}`,
  });
  await db
    .update(schema.registrations)
    .set({ squareOrderId: link.squareOrderId, squarePaymentLinkId: link.paymentLinkId, updatedAt: new Date() })
    .where(eq(schema.registrations.id, reg.id));
  await attachSquareOrder("registration", reg.id, link.squareOrderId);
  await recordOrderEvent({
    registrationId: reg.id,
    type: "tender_added",
    summary: `Card payment started at the desk for the online booking — $${(amountCents / 100).toFixed(2)}`,
    actor,
    payload: { squareOrderId: link.squareOrderId },
  });
  return { url: link.url, amountCents };
}
