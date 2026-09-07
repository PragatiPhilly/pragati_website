/**
 * Tenders — the money the desk actually takes.
 *
 * A tender IS a `payments` row, marked `source = 'desk'`. The ledger stays the
 * single source of truth for money; what the desk adds is who physically took
 * it, which drawer it belongs to, and the second axis this whole module exists
 * for: WHERE THE MONEY IS NOW.
 *
 *   settlement — has the guest handed over what they owe?  → decides admission
 *   custody    — is that money in the org account?         → decides whether the
 *                                                             treasurer can stop
 *                                                             chasing it
 *
 * A Zelle sent to a committee member's personal phone is settled the moment the
 * desk sees the confirmation screen, and stays `held_by_person` — with that
 * person's name on it — until they hand it over and a treasurer clears it
 * against a deposit reference. Collapsing those two questions into one boolean
 * is what the old kiosk did, and it is why nobody could say where $260 was.
 *
 * ── WHAT THIS MODULE MUST NEVER DO ────────────────────────────────────────
 * Call `settlePayments()`. It settles EVERY outstanding row for an entity in
 * one UPDATE — correct for a web checkout with one payment method, catastrophic
 * for an order paid half in cash and half by card. Every function here touches
 * exactly the tender it was given. There is a test that asserts this file never
 * imports it.
 */
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { cardProcessingFeeCents } from "@/lib/pricing";
import { siteUrl } from "@/lib/site-url";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { DeskError, canVoidTender, type DeskActor } from "@/lib/desk/guards";
import {
  CUSTODY_LABEL,
  defaultCustody,
  openingTenderStatus,
  OPEN_CUSTODY,
  type Custody,
  type TenderMethod,
} from "@/lib/desk/constants";
import { deskOrderSummary, loadTenders } from "@/lib/desk/summary";
import { recordOrderEvent } from "@/lib/desk/events";
import { raiseFollowup, clearFollowups } from "@/lib/desk/followups";
import { recomputeOrder } from "@/lib/desk/orders";

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

export type CashDetail = { cashTenderedCents?: number };
export type CheckDetail = {
  checkNumber: string;
  bank?: string;
  payerName?: string;
  checkDate?: string; // YYYY-MM-DD — a post-dated cheque is not overdue yet
  memo?: string;
};
export type ZelleDetail = {
  /** The org's own account, or a named person's. Never free text: a user id. */
  sentTo: "org" | { userId: string; displayName: string };
  senderHandle?: string;
  senderLast4?: string;
  sentAt?: string;
  confirmationSeen?: boolean;
};
export type CompDetail = { reasonCode: string };

export type AddTenderInput = {
  registrationId: string;
  method: TenderMethod;
  amountCents: number;
  /** Card only: add the 3% surcharge on top. Never part of what is owed. */
  withCardFee?: boolean;
  shiftId?: string | null;
  cash?: CashDetail;
  check?: CheckDetail;
  zelle?: ZelleDetail;
  note?: string;
};

export type AddTenderResult = {
  tenderId: string;
  /** Card only — show this to the guest as a QR on the tablet. */
  paymentUrl?: string;
  changeDueCents: number;
  overpaidCents: number;
};

export async function addTender(input: AddTenderInput, actor: DeskActor): Promise<AddTenderResult> {
  await ensureDeskSchema();
  const db = getDb();

  const s = await deskOrderSummary(input.registrationId);
  if (!s) throw new DeskError("That booking no longer exists.");
  if (s.reg.deskState === "voided") throw new DeskError("This booking was cancelled — you can't take money on it.");
  if (s.reg.deskState === "closed" && !actor.isAdmin)
    throw new DeskError("This booking is finished. An admin can reopen it if something changed.");
  if (input.amountCents <= 0) throw new DeskError("Type how much they're paying.");
  if (input.method === "comped") throw new DeskError("To make something free, use 'Make it free' instead.");

  // Cash: what they handed over may exceed what they owe. The difference is
  // change, not revenue — we record only the amount that settles the order.
  const cashTendered = input.cash?.cashTenderedCents ?? 0;
  let amountCents = Math.round(input.amountCents);
  let changeDueCents = 0;
  if (input.method === "cash" && cashTendered > 0) {
    if (cashTendered < amountCents) throw new DeskError("They handed over less than the amount you typed.");
    changeDueCents = cashTendered - amountCents;
  }

  // Overpayment on a non-cash tender is real money we now hold. It becomes
  // either a gift or a refund we owe — never a silently negative balance.
  const overpaidCents = Math.max(0, amountCents - Math.max(0, s.balanceCents));
  if (overpaidCents > 0 && input.method === "cash" && cashTendered === 0) {
    // Someone typed more cash than is owed without saying what they handed
    // over. Treat the excess as change rather than inventing revenue.
    changeDueCents = overpaidCents;
    amountCents -= overpaidCents;
    if (amountCents <= 0) throw new DeskError("They don't owe anything.");
  }

  const seq = (s.tenders.reduce((m, t) => Math.max(m, t.tenderSeq ?? 0), 0) ?? 0) + 1;
  const status = openingTenderStatus(input.method);
  const sentToOrg = input.method !== "zelle" || input.zelle?.sentTo === "org";
  const custody: Custody = status === "paid" ? defaultCustody(input.method, sentToOrg) : "org_account";

  let instrument: Record<string, unknown> = {};
  let feeCents = 0;
  let paymentUrl: string | undefined;
  let squareOrderId: string | null = null;
  let squarePaymentLinkId: string | null = null;

  if (input.method === "cash") {
    instrument = { cashTenderedCents: cashTendered || amountCents, changeGivenCents: changeDueCents };
  }

  if (input.method === "check") {
    const c = input.check;
    if (!c?.checkNumber?.trim()) throw new DeskError("Type the cheque number — that's what the treasurer matches it against later.");
    instrument = {
      checkNumber: c.checkNumber.trim(),
      bank: c.bank?.trim() || null,
      payerName: c.payerName?.trim() || null,
      checkDate: c.checkDate || null,
      memo: c.memo?.trim() || null,
    };
  }

  if (input.method === "zelle") {
    const z = input.zelle;
    if (!z) throw new DeskError("Say where the Zelle went.");
    if (z.sentTo !== "org" && !z.sentTo?.userId)
      throw new DeskError("Pick who it was sent to.");
    instrument = {
      sentTo: z.sentTo === "org" ? "org" : { userId: z.sentTo.userId, displayName: z.sentTo.displayName },
      senderHandle: z.senderHandle?.trim() || null,
      senderLast4: (z.senderLast4 ?? "").replace(/\D/g, "").slice(-4) || null,
      sentAt: z.sentAt || new Date().toISOString(),
      confirmationSeen: !!z.confirmationSeen,
    };
  }

  if (input.method === "square") {
    feeCents = input.withCardFee ? cardProcessingFeeCents(amountCents) : 0;
    const { createSquarePaymentLink } = await import("@/lib/payments/square");
    const link = await createSquarePaymentLink({
      referenceId: s.reg.id,
      confirmationNumber: s.reg.confirmationNumber,
      amountCents: amountCents + feeCents,
      description: `Walk-in desk — ${s.reg.confirmationNumber}`,
    });
    paymentUrl = link.url;
    squareOrderId = link.squareOrderId;
    squarePaymentLinkId = link.paymentLinkId;
    instrument = {
      paymentLinkId: link.paymentLinkId,
      squareOrderId: link.squareOrderId,
      feeChargedCents: feeCents,
      presentedAs: "qr",
      payUrl: link.url,
    };
  }

  const [row] = await db
    .insert(schema.payments)
    .values({
      kind: "registration",
      entityId: s.reg.id,
      groupId: s.reg.id,
      memberId: s.reg.memberId ?? null,
      payerName: s.reg.buyerName,
      payerEmail: s.reg.buyerEmail || "",
      amountCents,
      feeCents,
      method: input.method,
      status,
      squareOrderId,
      squarePaymentId: null,
      reference: s.reg.confirmationNumber,
      source: "desk",
      tenderSeq: seq,
      shiftId: input.shiftId ?? s.reg.deskShiftId ?? null,
      collectedBy: actor.userId,
      custody,
      instrument: instrument as unknown as Record<string, unknown>,
      paidAt: status === "paid" ? new Date() : null,
      note: input.note?.trim() || null,
    })
    .returning();

  if (squarePaymentLinkId) {
    // Keep the link id where the rest of the app already looks for one, so an
    // abandoned desk link can be retired the same way a web one is.
    await db
      .update(schema.registrations)
      .set({ squareOrderId, squarePaymentLinkId, updatedAt: new Date() })
      .where(eq(schema.registrations.id, s.reg.id));
  }

  await recordOrderEvent({
    registrationId: s.reg.id,
    type: "tender_added",
    summary: describeTender(input.method, amountCents, instrument, feeCents),
    actor,
    shiftId: input.shiftId ?? null,
    payload: { tenderId: row.id, method: input.method, amountCents, feeCents, custody },
  });

  // Custody follow-ups: money we hold but the organisation does not.
  if (status === "paid" && OPEN_CUSTODY.includes(custody)) {
    if (input.method === "check") {
      await raiseFollowup({
        kind: "check_uncleared",
        registrationId: s.reg.id,
        paymentId: row.id,
        detail: `Cheque ${(instrument.checkNumber as string) ?? ""}${instrument.bank ? ` (${instrument.bank})` : ""} for ${fmt(amountCents)} — not deposited.`,
        createdBy: actor.userId,
        dueAt: instrument.checkDate ? new Date(`${instrument.checkDate}T12:00:00`) : null,
      });
    }
    if (input.method === "zelle" && typeof instrument.sentTo === "object") {
      const to = instrument.sentTo as { userId: string; displayName: string };
      await raiseFollowup({
        kind: "zelle_with_person",
        registrationId: s.reg.id,
        paymentId: row.id,
        detail: `${fmt(amountCents)} sent to ${to.displayName}'s personal account — not in the org account.`,
        assignedTo: to.userId,
        createdBy: actor.userId,
      });
    }
  }
  if (status === "pending") {
    await raiseFollowup({
      kind: "card_unconfirmed",
      registrationId: s.reg.id,
      paymentId: row.id,
      detail: `${fmt(amountCents + feeCents)} card payment created — waiting for Square.`,
      createdBy: actor.userId,
    });
  }

  if (overpaidCents > 0 && input.method !== "cash") {
    await raiseFollowup({
      kind: "refund_due",
      registrationId: s.reg.id,
      paymentId: row.id,
      detail: `${fmt(overpaidCents)} more than was owed. Offer it as a donation, or refund it.`,
      createdBy: actor.userId,
    });
  }

  await recomputeOrder(s.reg.id, actor);
  return { tenderId: row.id, paymentUrl, changeDueCents, overpaidCents };
}

function describeTender(
  method: TenderMethod,
  amountCents: number,
  instrument: Record<string, unknown>,
  feeCents: number
): string {
  const money = fmt(amountCents);
  switch (method) {
    case "cash":
      return `Cash ${money}${Number(instrument.changeGivenCents) > 0 ? ` (change ${fmt(Number(instrument.changeGivenCents))})` : ""}`;
    case "check":
      return `Cheque ${money} — no. ${instrument.checkNumber}${instrument.bank ? `, ${instrument.bank}` : ""}`;
    case "zelle":
      return typeof instrument.sentTo === "object"
        ? `Zelle ${money} → ${(instrument.sentTo as { displayName: string }).displayName} (personal)`
        : `Zelle ${money} → org account`;
    case "square":
      return `Card ${money}${feeCents ? ` + ${fmt(feeCents)} fee` : ""} — link shown to the guest`;
    case "comped":
      return `Comped ${money}`;
  }
}

/**
 * Square told us a desk card tender completed.
 *
 * Called from the webhook (touchpoint T1) and from the desk's own poller. It
 * settles EXACTLY ONE tender — never the cash tender sitting next to it — and
 * then recomputes the order.
 */
export async function settleDeskCardTender(input: {
  registrationId: string;
  squarePaymentId: string | null;
  squareOrderId: string | null;
  squareAmountCents: number | null;
}): Promise<{ settled: boolean; reason?: string; tenderId?: string }> {
  await ensureDeskSchema();
  const db = getDb();
  const tenders = await loadTenders(input.registrationId);

  // Prefer the tender Square is actually talking about.
  const candidate =
    (input.squareOrderId ? tenders.find((t) => t.squareOrderId === input.squareOrderId) : undefined) ??
    tenders.find((t) => t.method === "square" && t.status === "pending");

  if (!candidate) return { settled: false, reason: "there is no card payment waiting on this booking" };
  if (candidate.status === "paid") return { settled: true, reason: "already confirmed", tenderId: candidate.id };

  // Amount check, per tender rather than per order — the reason this handler
  // exists at all. A shortfall of a couple of cents is rounding; more than that
  // is a human's problem, not ours.
  const expected = candidate.amountCents + (candidate.feeCents ?? 0);
  const got = input.squareAmountCents ?? 0;
  if (got > 0 && got + 2 < expected) {
    await raiseFollowup({
      kind: "balance_owed",
      registrationId: input.registrationId,
      paymentId: candidate.id,
      detail: `Square took ${fmt(got)}, but the payment was recorded as ${fmt(expected)}.`,
    });
    return { settled: false, reason: "Square took a different amount from the one recorded", tenderId: candidate.id };
  }

  await db
    .update(schema.payments)
    .set({
      status: "paid",
      paidAt: new Date(),
      squarePaymentId: input.squarePaymentId,
      squareVerifiedAt: new Date(),
      squareAmountCents: input.squareAmountCents,
      custody: "org_account",
      updatedAt: new Date(),
    })
    .where(eq(schema.payments.id, candidate.id));

  await clearFollowups("card_unconfirmed", { paymentId: candidate.id }, null, "Square confirmed the payment.");
  await recordOrderEvent({
    registrationId: input.registrationId,
    type: "tender_confirmed",
    summary: `Card ${fmt(candidate.amountCents)} confirmed by Square`,
    payload: { tenderId: candidate.id, squarePaymentId: input.squarePaymentId },
  });
  await recomputeOrder(input.registrationId, null);
  return { settled: true, tenderId: candidate.id };
}

/**
 * Ask Square directly whether a card tender has been paid.
 *
 * The desk does not wait on the webhook: venue wi-fi is bad, deliveries get
 * lost, and there is a family standing at the counter. Same read-back the
 * checkout success page already uses.
 */
export async function pollCardTender(tenderId: string): Promise<{ settled: boolean; message: string }> {
  const db = getDb();
  const [t] = await db.select().from(schema.payments).where(eq(schema.payments.id, tenderId));
  if (!t) return { settled: false, message: "That payment is no longer there." };
  if (t.status === "paid") return { settled: true, message: "Already confirmed." };
  const { lookupSquarePaymentSafe } = await import("@/lib/payments/square");
  const res = await lookupSquarePaymentSafe(t.squareOrderId);
  if (!res.ok) return { settled: false, message: "Couldn't reach Square — try again in a moment." };
  if (!res.payment) return { settled: false, message: "Square hasn't seen the payment yet." };
  const out = await settleDeskCardTender({
    registrationId: t.entityId,
    squarePaymentId: res.payment.paymentId,
    squareOrderId: res.payment.orderId,
    squareAmountCents: res.payment.amountCents,
  });
  return out.settled
    ? { settled: true, message: "Card payment confirmed ✓" }
    : { settled: false, message: out.reason ?? "Square hasn't confirmed it yet." };
}

/** The card was declined, or the guest walked away from the link. */
export async function failTender(tenderId: string, why: string, actor: DeskActor): Promise<void> {
  const db = getDb();
  const [t] = await db.select().from(schema.payments).where(eq(schema.payments.id, tenderId));
  if (!t) throw new DeskError("That payment is no longer there.");
  if (t.status === "paid") throw new DeskError("That payment already went through. Undo it instead.");
  await db
    .update(schema.payments)
    .set({ status: "cancelled", cancelledAt: new Date(), note: why, updatedAt: new Date() })
    .where(eq(schema.payments.id, tenderId));
  await clearFollowups("card_unconfirmed", { paymentId: tenderId }, actor, why);
  await recordOrderEvent({
    registrationId: t.entityId,
    type: "tender_failed",
    summary: `${fmt(t.amountCents)} ${t.method} didn't go through — ${why}`,
    actor,
    payload: { tenderId },
  });
  await recomputeOrder(t.entityId, actor);
}

/** Undo a payment taken by mistake. Time-boxed for volunteers, open to admins. */
export async function voidTender(
  tenderId: string,
  why: string,
  actor: DeskActor,
  currentShiftId: string | null
): Promise<void> {
  const db = getDb();
  const [t] = await db.select().from(schema.payments).where(eq(schema.payments.id, tenderId));
  if (!t) throw new DeskError("That payment is no longer there.");
  if (t.reversedAt) throw new DeskError("That payment has already been undone.");
  if (!why.trim()) throw new DeskError("Say why you're undoing it.");
  const may = canVoidTender(actor, t, currentShiftId);
  if (!may.ok) throw new DeskError(may.why);

  await db
    .update(schema.payments)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      reversedAt: new Date(),
      reversalReason: why.trim(),
      custody: "n_a",
      updatedAt: new Date(),
    })
    .where(eq(schema.payments.id, tenderId));
  await clearFollowups("check_uncleared", { paymentId: tenderId }, actor, "Payment undone.");
  await clearFollowups("zelle_with_person", { paymentId: tenderId }, actor, "Payment undone.");
  await clearFollowups("card_unconfirmed", { paymentId: tenderId }, actor, "Payment undone.");
  await recordOrderEvent({
    registrationId: t.entityId,
    type: "tender_voided",
    summary: `Undid ${fmt(t.amountCents)} ${t.method} — ${why.trim()}`,
    actor,
    payload: { tenderId },
  });
  await recomputeOrder(t.entityId, actor);
}

/**
 * The cheque bounced, weeks later.
 *
 * The money never arrived, so the order owes it again — but the family already
 * came, ate, and went home. We do not retract a scanned pass; the exit is a
 * write-off or a conversation. Treasurer action.
 */
export async function reverseTender(tenderId: string, why: string, actor: DeskActor): Promise<void> {
  if (!actor.isTreasurer && !actor.isAdmin)
    throw new DeskError("Only the treasurer can undo a payment that already went through.");
  if (!why.trim()) throw new DeskError("Say what happened.");
  const db = getDb();
  const [t] = await db.select().from(schema.payments).where(eq(schema.payments.id, tenderId));
  if (!t) throw new DeskError("That payment is no longer there.");
  if (t.status !== "paid") throw new DeskError("That payment never went through, so there's nothing to undo.");

  await db
    .update(schema.payments)
    .set({
      status: "cancelled",
      reversedAt: new Date(),
      reversalReason: why.trim(),
      cancelledAt: new Date(),
      custody: "n_a",
      updatedAt: new Date(),
    })
    .where(eq(schema.payments.id, tenderId));
  await clearFollowups("check_uncleared", { paymentId: tenderId }, actor, `Reversed: ${why.trim()}`);
  await clearFollowups("zelle_with_person", { paymentId: tenderId }, actor, `Reversed: ${why.trim()}`);
  await recordOrderEvent({
    registrationId: t.entityId,
    type: "tender_reversed",
    summary: `${fmt(t.amountCents)} ${t.method} reversed — ${why.trim()}`,
    actor,
    payload: { tenderId, amountCents: t.amountCents },
  });
  await recomputeOrder(t.entityId, actor);
}

// ── custody: the second axis ───────────────────────────────────────────────

/**
 * The money reached the organisation. Treasurer only.
 *
 * This is the ONLY thing that moves a tender to `org_account`, and it always
 * carries a deposit reference and a name. Nothing about it changes what the
 * guest owes — they settled weeks ago.
 */
export async function clearCustody(
  tenderIds: string[],
  depositRef: string,
  actor: DeskActor
): Promise<number> {
  if (!actor.isTreasurer) throw new DeskError("Only the treasurer can mark money as reaching Pragati's account.");
  if (!depositRef.trim()) throw new DeskError("Add the bank slip or reference number, so this can be traced later.");
  if (tenderIds.length === 0) return 0;
  await ensureDeskSchema();
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.payments)
    .where(and(inArray(schema.payments.id, tenderIds), eq(schema.payments.status, "paid")));
  if (rows.length === 0) return 0;

  await db
    .update(schema.payments)
    .set({
      custody: "org_account",
      custodyClearedAt: new Date(),
      custodyClearedBy: actor.userId,
      depositRef: depositRef.trim(),
      updatedAt: new Date(),
    })
    .where(inArray(schema.payments.id, rows.map((r) => r.id)));

  for (const r of rows) {
    await clearFollowups("check_uncleared", { paymentId: r.id }, actor, `Deposited — ${depositRef.trim()}`);
    await clearFollowups("zelle_with_person", { paymentId: r.id }, actor, `Handed over — ${depositRef.trim()}`);
    await recordOrderEvent({
      registrationId: r.entityId,
      type: "custody_cleared",
      summary: `${fmt(r.amountCents)} ${r.method} reached the org account (${depositRef.trim()})`,
      actor,
      payload: { tenderId: r.id, depositRef: depositRef.trim(), from: r.custody },
    });
  }
  return rows.length;
}

/** Everything the treasurer still has to chase, grouped by who is holding it. */
export type CustodyGroup = {
  key: string;
  label: string;
  custody: Custody;
  holderUserId: string | null;
  amountCents: number;
  tenders: (typeof schema.payments.$inferSelect & { conf?: string | null })[];
  oldestAt: Date | null;
};

export async function custodyGroups(): Promise<CustodyGroup[]> {
  await ensureDeskSchema();
  const db = getDb();
  let rows: (typeof schema.payments.$inferSelect)[] = [];
  try {
    rows = await db
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.source, "desk"),
          eq(schema.payments.status, "paid"),
          isNotNull(schema.payments.custody),
          inArray(schema.payments.custody, OPEN_CUSTODY as unknown as string[])
        )
      );
  } catch {
    return [];
  }

  const groups = new Map<string, CustodyGroup>();
  for (const r of rows) {
    const custody = (r.custody ?? "in_drawer") as Custody;
    const inst = (r.instrument ?? {}) as Record<string, unknown>;
    const holder =
      custody === "held_by_person" && typeof inst.sentTo === "object"
        ? (inst.sentTo as { userId: string; displayName: string })
        : null;
    const key = holder ? `person:${holder.userId}` : `custody:${custody}`;
    const label = holder ? holder.displayName : CUSTODY_LABEL[custody];
    const g =
      groups.get(key) ??
      ({ key, label, custody, holderUserId: holder?.userId ?? null, amountCents: 0, tenders: [], oldestAt: null } as CustodyGroup);
    g.amountCents += r.amountCents;
    g.tenders.push(r);
    if (!g.oldestAt || r.createdAt < g.oldestAt) g.oldestAt = r.createdAt;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.oldestAt?.getTime() ?? 0) - (b.oldestAt?.getTime() ?? 0));
}

/** Cash counted into a drawer during an open shift, for the close-out screen. */
export async function cashTakenInShift(shiftId: string): Promise<number> {
  const db = getDb();
  try {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${schema.payments.amountCents}),0)` })
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.shiftId, shiftId),
          eq(schema.payments.method, "cash"),
          eq(schema.payments.status, "paid")
        )
      );
    return Number(row?.total ?? 0);
  } catch {
    return 0;
  }
}

export function payLinkFor(tender: typeof schema.payments.$inferSelect): string | null {
  const inst = (tender.instrument ?? {}) as Record<string, unknown>;
  return typeof inst.payUrl === "string" ? inst.payUrl : tender.squareOrderId ? siteUrl("/") : null;
}
