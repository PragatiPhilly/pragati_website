/**
 * Desk orders.
 *
 * A desk order IS a `registrations` row (source = 'desk') and its passes ARE
 * `tickets` rows. That is deliberate and load-bearing: the scan desk, the
 * kitchen counts, the gate-sheet export, the /t/<qr> pass page, the Payments
 * log and the dashboard totals all keep working on day one with no new
 * plumbing. What the desk adds is a second lifecycle on top —
 * `registrations.desk_state` — and its own settlement path.
 *
 * Two rules here differ from the online checkout, both on purpose:
 *
 *  1. SEATS ARE TAKEN AT `open`, not at payment. The web rule (capacity follows
 *     the money) exists because a browser tab can be abandoned; at the desk the
 *     guest is physically standing there, so the seat is genuinely gone the
 *     moment we say yes. Voiding gives it back. This is also exactly why a desk
 *     order must never travel through markRegistrationPaid, which takes seats
 *     itself — it would count every body twice.
 *
 *  2. NOTHING IS REQUIRED THAT A PERSON MIGHT NOT HAVE. A first name and one
 *     adult. Everything else missing becomes a typed follow-up, never a
 *     placeholder written into a real column.
 */
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { nextConfirmationNumber, makeQrCode } from "@/lib/confirmation";
import { getConfig } from "@/lib/system-config";
import { isEmail, isPhone } from "@/lib/validation";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { DeskError, assertMayAdmitWithBalance, type DeskActor } from "@/lib/desk/guards";
import { priceParty, needsGuardian, effectiveKind, type DeskPerson, type TicketType } from "@/lib/desk/party";
import { deskOrderSummary, dominantMethod, type DeskOrderSummary } from "@/lib/desk/summary";
import { recordOrderEvent } from "@/lib/desk/events";
import { clearFollowups, gapsFor, raiseFollowup } from "@/lib/desk/followups";
import type { VoidReason } from "@/lib/desk/constants";

export type CreateDeskOrderInput = {
  eventId: string;
  /** Client-generated. A double-tapped Create returns the same order. */
  idempotencyKey: string;
  buyerName: string;
  buyerEmail?: string;
  buyerPhone?: string;
  memberId?: string | null;
  /** Checked against the roster by the caller — never an honour-system claim. */
  isMemberPurchase?: boolean;
  people: DeskPerson[];
  donationCents?: number;
  /** Set when this is an amendment hanging off an existing registration. */
  parentRegistrationId?: string | null;
  note?: string;
  overrideCapacity?: boolean;
  overrideGuardian?: boolean;
  shiftId?: string | null;
};

export type CreateDeskOrderResult = {
  registrationId: string;
  confirmationNumber: string;
  reused: boolean;
  warnings: string[];
};

/** Blank, not a placeholder. The column is NOT NULL; "" means "we never got one". */
const NO_EMAIL = "";

export async function createDeskOrder(
  input: CreateDeskOrderInput,
  actor: DeskActor
): Promise<CreateDeskOrderResult> {
  await ensureDeskSchema();
  const db = getDb();

  if (!input.buyerName.trim()) throw new DeskError("Type at least a first name for whoever is paying.");
  if (input.people.length === 0) throw new DeskError("Add at least one person.");
  if (!input.idempotencyKey) throw new DeskError("Missing idempotency key — reload the desk and try again.");

  // ── idempotency: the same key always yields the same order ───────────────
  const [existing] = await db
    .select()
    .from(schema.registrations)
    .where(eq(schema.registrations.idempotencyKey, input.idempotencyKey));
  if (existing) {
    return {
      registrationId: existing.id,
      confirmationNumber: existing.confirmationNumber,
      reused: true,
      warnings: [],
    };
  }

  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, input.eventId));
  if (!event) throw new DeskError("That event no longer exists.");
  const types = (await db
    .select()
    .from(schema.ticketTypes)
    .where(eq(schema.ticketTypes.eventId, event.id))) as TicketType[];
  const eventDays = (event.days as { key: string }[] | null) ?? [];
  const dayCount = Math.max(eventDays.length, 1);

  // ── guardians: a minor never enters on their own pass ────────────────────
  const adultRefs = new Set(
    input.people.filter((p) => !needsGuardian(p)).map((p) => p.ref)
  );
  const unguarded = input.people.filter((p) => {
    if (!needsGuardian(p)) return false;
    if (p.guardianTicketId) return false;
    if (p.guardianRef && adultRefs.has(p.guardianRef)) return false;
    // One adult in the party and no explicit choice → they are the guardian.
    if (!p.guardianRef && adultRefs.size === 1) return false;
    return true;
  });
  if (unguarded.length > 0 && !input.overrideGuardian) {
    throw new DeskError(
      `${unguarded.map((p) => p.firstName).join(", ")} ${unguarded.length === 1 ? "is" : "are"} under 18 — pick the adult they are coming with. (An admin can override this.)`
    );
  }
  if (unguarded.length > 0 && input.overrideGuardian && !actor.isAdmin) {
    throw new DeskError("Only an admin can let a minor in without an adult attached.");
  }

  // ── price the party ──────────────────────────────────────────────────────
  const discountMode = ((await getConfig<string>("member_discount_mode")) === "whole_family"
    ? "whole_family"
    : "per_adult") as "per_adult" | "whole_family";
  const priced = priceParty(input.people, types, {
    eventDayCount: dayCount,
    isMemberPurchase: !!input.isMemberPurchase,
    discountMode,
  });
  if (priced.problems.length > 0) {
    throw new DeskError(priced.problems.map((p) => p.why).join(" "));
  }
  if (priced.passes.length === 0) throw new DeskError("Nothing to issue — check the days and passes chosen.");

  // ── capacity: never oversell without a named decision ────────────────────
  const demand = new Map<string, number>();
  for (const p of priced.passes) demand.set(p.ticketTypeId, (demand.get(p.ticketTypeId) ?? 0) + 1);
  const overCapacity: string[] = [];
  for (const [ttId, want] of demand) {
    const t = types.find((x) => x.id === ttId);
    if (t && t.capacity !== null && t.soldCount + want > t.capacity) {
      const left = Math.max(0, t.capacity - t.soldCount);
      overCapacity.push(left === 0 ? `"${t.name}" is sold out.` : `Only ${left} left for "${t.name}".`);
    }
  }
  if (overCapacity.length > 0) {
    if (!input.overrideCapacity)
      throw new DeskError(`${overCapacity.join(" ")} An admin can override this at the door.`);
    if (!actor.isAdmin) throw new DeskError("Only an admin can go past a pass's capacity.");
  }

  const donationCents = Math.max(0, Math.round(input.donationCents ?? 0));
  const dueCents = priced.listPriceCents + donationCents;
  const conf = await nextConfirmationNumber("PRG");
  const email = input.buyerEmail && isEmail(input.buyerEmail) ? input.buyerEmail.trim().toLowerCase() : NO_EMAIL;
  const phone = input.buyerPhone && isPhone(input.buyerPhone, true) ? input.buyerPhone.trim() : null;

  const [reg] = await db
    .insert(schema.registrations)
    .values({
      confirmationNumber: conf,
      eventId: event.id,
      memberId: input.memberId ?? undefined,
      buyerEmail: email,
      buyerName: input.buyerName.trim(),
      buyerPhone: phone,
      isMemberPurchase: !!input.isMemberPurchase,
      source: "desk",
      subtotalCents: priced.listPriceCents,
      discountCents: 0,
      totalCents: dueCents,
      processingFeeCents: 0,
      donationCents,
      paymentMethod: "offline", // real shapes live on the tenders; updated on settle
      status: "pending_payment",
      deskState: "open",
      deskShiftId: input.shiftId ?? null,
      createdByUserId: actor.userId,
      idempotencyKey: input.idempotencyKey,
      parentRegistrationId: input.parentRegistrationId ?? null,
      notes: input.note?.trim() || null,
    })
    .returning();

  // ── issue the passes, adults first so a minor can point at one ───────────
  const primaryTicketByRef = new Map<string, string>();
  const minorPasses = priced.passes.filter((p) => p.needsGuardian);
  const adultPasses = priced.passes.filter((p) => !p.needsGuardian);

  const insertPass = async (p: (typeof priced.passes)[number], guardianTicketId: string | null) => {
    const [row] = await db
      .insert(schema.tickets)
      .values({
        registrationId: reg.id,
        ticketTypeId: p.ticketTypeId,
        attendeeFirstName: p.attendeeFirstName,
        attendeeLastName: p.attendeeLastName,
        attendeeAge: p.attendeeAge,
        attendeeIsMember: p.memberPricing,
        foodPref: p.foodPref,
        studentInfo: p.studentInfo ?? null,
        priceCents: p.priceCents,
        qrCode: makeQrCode(),
        dayKey: p.dayKey,
        guardianTicketId,
        issuedByUserId: actor.userId,
      })
      .returning({ id: schema.tickets.id });
    if (!primaryTicketByRef.has(p.personRef)) primaryTicketByRef.set(p.personRef, row.id);
  };

  for (const p of adultPasses) await insertPass(p, null);
  const personByRef = new Map(input.people.map((p) => [p.ref, p]));
  for (const p of minorPasses) {
    const person = personByRef.get(p.personRef);
    let guardian = person?.guardianTicketId ?? null;
    if (!guardian && person?.guardianRef) guardian = primaryTicketByRef.get(person.guardianRef) ?? null;
    if (!guardian && adultRefs.size === 1) guardian = primaryTicketByRef.get([...adultRefs][0]) ?? null;
    await insertPass(p, guardian);
  }

  // ── take the seats NOW: the guest is standing here ───────────────────────
  for (const [ttId, n] of demand) {
    await db
      .update(schema.ticketTypes)
      .set({ soldCount: sql`${schema.ticketTypes.soldCount} + ${n}` })
      .where(eq(schema.ticketTypes.id, ttId));
  }

  // ── gaps become follow-ups, never placeholders ───────────────────────────
  const warnings: string[] = [];
  for (const gap of gapsFor({
    buyerEmail: email || null,
    buyerPhone: phone,
    people: input.people.map((p) => ({ firstName: p.firstName, age: p.age, kind: effectiveKind(p) })),
  })) {
    await raiseFollowup({ ...gap, registrationId: reg.id, createdBy: actor.userId });
    warnings.push(gap.detail);
  }
  if (unguarded.length > 0) {
    await raiseFollowup({
      kind: "guardian_unlinked",
      registrationId: reg.id,
      detail: `${unguarded.map((p) => p.firstName).join(", ")} admitted without an adult attached (admin override by ${actor.email}).`,
      createdBy: actor.userId,
    });
    warnings.push("A minor was admitted without a guardian — flagged at the gate.");
  }
  if (overCapacity.length > 0) warnings.push(`Capacity overridden: ${overCapacity.join(" ")}`);

  await recordOrderEvent({
    registrationId: reg.id,
    type: input.parentRegistrationId ? "amendment_created" : "order_opened",
    summary: `${conf} opened for ${reg.buyerName} — ${priced.passes.length} pass${priced.passes.length === 1 ? "" : "es"}, ${fmt(dueCents)} due`,
    actor,
    shiftId: input.shiftId ?? null,
    payload: {
      passes: priced.passes.length,
      dueCents,
      capacityOverridden: overCapacity.length > 0,
      guardianOverridden: unguarded.length > 0,
      parentRegistrationId: input.parentRegistrationId ?? null,
    },
  });

  if (input.parentRegistrationId) {
    await recordOrderEvent({
      registrationId: input.parentRegistrationId,
      type: "amendment_created",
      summary: `Added ${priced.passes.length} pass${priced.passes.length === 1 ? "" : "es"} on ${conf}`,
      actor,
      payload: { childRegistrationId: reg.id, conf },
    });
  }

  return { registrationId: reg.id, confirmationNumber: conf, reused: false, warnings };
}

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

/**
 * Re-derive an order's money state after any tender or adjustment change.
 *
 * This is the ONLY thing that flips a desk order between owing and settled, and
 * it never touches seat counts (those were taken at `open`) and never calls
 * settlePayments (which would settle every tender at once).
 */
export async function recomputeOrder(
  registrationId: string,
  actor: DeskActor | null
): Promise<DeskOrderSummary> {
  const db = getDb();
  const s = await deskOrderSummary(registrationId);
  if (!s) throw new DeskError("Order not found.");
  if (s.reg.deskState === "voided") return s;

  const settled = s.balanceCents <= 0;
  const wasPaid = s.reg.status === "paid";
  const nextState = s.reg.deskState === "closed" ? "closed" : settled ? "settled" : "open";

  await db
    .update(schema.registrations)
    .set({
      totalCents: s.dueCents,
      subtotalCents: s.listPriceCents,
      discountCents: Math.max(0, s.adjustedCents),
      processingFeeCents: s.feeCents,
      paymentMethod: dominantMethod(s.tenders),
      status: settled ? "paid" : "pending_payment",
      paidAt: settled ? (s.reg.paidAt ?? new Date()) : null,
      deskState: nextState,
      deskVersion: sql`${schema.registrations.deskVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.registrations.id, registrationId));

  if (settled && !wasPaid) {
    await clearFollowups("balance_owed", { registrationId }, actor, "Balance settled at the desk.");
    await recordOrderEvent({
      registrationId,
      type: "order_settled",
      summary: `Settled — ${fmt(s.collectedCents)} collected`,
      actor,
      payload: { collectedCents: s.collectedCents },
    });
    await sendDeskTicketsEmail(registrationId, actor);
  }
  if (!settled && wasPaid) {
    await raiseFollowup({
      kind: "balance_owed",
      registrationId,
      detail: `${fmt(s.balanceCents)} owed again after a payment was reversed.`,
      createdBy: actor?.userId ?? null,
    });
  }

  return (await deskOrderSummary(registrationId))!;
}

/**
 * Send the normal tickets email — the same one a web buyer gets, just late.
 * Silently skipped when we never took an email address; the follow-up queue is
 * what remembers to come back to it.
 */
export async function sendDeskTicketsEmail(
  registrationId: string,
  actor: DeskActor | null,
  opts: { resend?: boolean } = {}
): Promise<boolean> {
  const db = getDb();
  const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId));
  if (!reg) return false;
  if (!reg.buyerEmail || !isEmail(reg.buyerEmail)) return false;
  if (reg.status !== "paid") return false;
  try {
    const { sendTicketsEmail } = await import("@/lib/checkout");
    const sent = await sendTicketsEmail(registrationId, opts);
    if (sent)
      await recordOrderEvent({
        registrationId,
        type: "tickets_emailed",
        summary: `Tickets emailed to ${reg.buyerEmail}`,
        actor,
      });
    return sent;
  } catch {
    return false;
  }
}

/** Fill in something we didn't have. The one in-place edit the desk allows. */
export async function fillOrderDetails(
  registrationId: string,
  patch: { buyerEmail?: string; buyerPhone?: string; buyerName?: string; note?: string },
  actor: DeskActor
): Promise<{ emailed: boolean }> {
  await ensureDeskSchema();
  const db = getDb();
  const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId));
  if (!reg) throw new DeskError("Order not found.");
  if (reg.deskState === "closed" && !actor.isAdmin)
    throw new DeskError("This order is closed — an admin can reopen it, or add an amendment.");

  const set: Record<string, unknown> = { updatedAt: new Date() };
  const changes: string[] = [];

  if (patch.buyerEmail !== undefined) {
    const e = patch.buyerEmail.trim().toLowerCase();
    if (e && !isEmail(e)) throw new DeskError("That doesn't look like an email address.");
    if (e !== reg.buyerEmail) {
      set.buyerEmail = e;
      changes.push(`email → ${e || "(blank)"}`);
    }
  }
  if (patch.buyerPhone !== undefined) {
    const ph = patch.buyerPhone.trim();
    if (ph && !isPhone(ph, true)) throw new DeskError("That doesn't look like a phone number.");
    if (ph !== (reg.buyerPhone ?? "")) {
      set.buyerPhone = ph || null;
      changes.push(`phone → ${ph || "(blank)"}`);
    }
  }
  if (patch.buyerName !== undefined && patch.buyerName.trim() && patch.buyerName.trim() !== reg.buyerName) {
    set.buyerName = patch.buyerName.trim();
    changes.push(`name → ${patch.buyerName.trim()}`);
  }
  if (patch.note !== undefined) set.notes = patch.note.trim() || null;

  if (changes.length === 0 && patch.note === undefined) return { emailed: false };

  await db.update(schema.registrations).set(set).where(eq(schema.registrations.id, registrationId));
  await recordOrderEvent({
    registrationId,
    type: "details_edited",
    summary: changes.length ? changes.join(" · ") : "Note updated",
    actor,
    payload: { changes },
  });

  let emailed = false;
  if (set.buyerEmail) {
    await clearFollowups("missing_email", { registrationId }, actor, `Email supplied: ${set.buyerEmail}`);
    emailed = await sendDeskTicketsEmail(registrationId, actor, { resend: true });
  }
  if (set.buyerPhone) await clearFollowups("missing_phone", { registrationId }, actor, "Phone supplied.");
  return { emailed };
}

/** Let them in owing money. Always attributed, never silent. */
export async function admitWithBalance(registrationId: string, actor: DeskActor): Promise<void> {
  const s = await deskOrderSummary(registrationId);
  if (!s) throw new DeskError("Order not found.");
  if (s.balanceCents <= 0) throw new DeskError("Nothing is owed on this order.");
  await assertMayAdmitWithBalance(actor, s.balanceCents);

  const db = getDb();
  await db
    .update(schema.registrations)
    .set({ admittedUnsettledBy: actor.userId, admittedUnsettledAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.registrations.id, registrationId));
  await raiseFollowup({
    kind: "balance_owed",
    registrationId,
    detail: `${fmt(s.balanceCents)} owed — admitted by ${actor.email}.`,
    createdBy: actor.userId,
  });
  await recordOrderEvent({
    registrationId,
    type: "admitted_with_balance",
    summary: `Admitted owing ${fmt(s.balanceCents)}`,
    actor,
    payload: { balanceCents: s.balanceCents },
  });
}

/** Sign the order off. Only from a zero balance. */
export async function closeOrder(registrationId: string, actor: DeskActor): Promise<void> {
  const s = await deskOrderSummary(registrationId);
  if (!s) throw new DeskError("Order not found.");
  if (s.reg.deskState === "voided") throw new DeskError("That order was voided.");
  if (s.balanceCents > 0)
    throw new DeskError(`${fmt(s.balanceCents)} still owed — take a payment, comp it, or admit with a balance.`);

  const db = getDb();
  await db
    .update(schema.registrations)
    .set({ deskState: "closed", updatedAt: new Date() })
    .where(eq(schema.registrations.id, registrationId));
  await recordOrderEvent({
    registrationId,
    type: "order_closed",
    summary: `Closed — ${fmt(s.collectedCents)} collected${s.adjustedCents ? `, ${fmt(s.adjustedCents)} adjusted` : ""}`,
    actor,
  });
}

export async function reopenOrder(registrationId: string, actor: DeskActor, why: string): Promise<void> {
  if (!actor.isAdmin) throw new DeskError("Reopening a closed order is an admin action.");
  if (!why.trim()) throw new DeskError("Say why you're reopening it.");
  const db = getDb();
  await db
    .update(schema.registrations)
    .set({ deskState: "open", updatedAt: new Date() })
    .where(eq(schema.registrations.id, registrationId));
  await recordOrderEvent({ registrationId, type: "order_reopened", summary: why.trim(), actor });
  await recomputeOrder(registrationId, actor);
}

/**
 * Void an order. Nothing at the desk deletes.
 *
 * The passes, the tenders and the timeline all stay; the order simply stops
 * admitting and gives its seats back. An order that took real money can only be
 * voided by an admin, and doing so raises a refund_due follow-up — the desk
 * records a refund, the treasurer executes it.
 */
export async function voidOrder(
  registrationId: string,
  reason: VoidReason,
  note: string,
  actor: DeskActor
): Promise<void> {
  await ensureDeskSchema();
  const db = getDb();
  const s = await deskOrderSummary(registrationId);
  if (!s) throw new DeskError("Order not found.");
  if (s.reg.deskState === "voided") return;

  const scanned = s.tickets.filter((t) => t.checkedInAt).length;
  if (s.collectedCents > 0 && !actor.isAdmin)
    throw new DeskError("This order has taken money — an admin has to void it.");
  if (scanned > 0 && !actor.isAdmin)
    throw new DeskError("Someone on this order has already been scanned in — an admin has to void it.");
  if (s.reg.deskState === "closed" && !actor.isAdmin)
    throw new DeskError("This order is closed — an admin has to void it.");

  // Open tenders are cancelled; settled ones are left standing and become a
  // refund the treasurer owes. We never pretend money we took didn't arrive.
  for (const t of s.tenders) {
    if (t.status === "pending" || t.status === "pending_verification") {
      await db
        .update(schema.payments)
        .set({ status: "cancelled", cancelledAt: new Date(), note: `Order voided: ${reason}`, updatedAt: new Date() })
        .where(eq(schema.payments.id, t.id));
    }
  }

  // Seats come back — they were taken at `open`.
  const demand = new Map<string, number>();
  for (const t of s.tickets) demand.set(t.ticketTypeId, (demand.get(t.ticketTypeId) ?? 0) + 1);
  for (const [ttId, n] of demand) {
    await db
      .update(schema.ticketTypes)
      .set({ soldCount: sql`greatest(0, ${schema.ticketTypes.soldCount} - ${n})` })
      .where(eq(schema.ticketTypes.id, ttId));
  }

  await db
    .update(schema.registrations)
    .set({
      deskState: "voided",
      status: s.collectedCents > 0 ? "cancelled" : "cancelled_no_payment",
      cancelledAt: new Date(),
      voidReason: `${reason}${note ? `: ${note}` : ""}`,
      updatedAt: new Date(),
    })
    .where(eq(schema.registrations.id, registrationId));

  if (s.collectedCents > 0) {
    await raiseFollowup({
      kind: "refund_due",
      registrationId,
      detail: `${fmt(s.collectedCents)} was collected before this order was voided.`,
      createdBy: actor.userId,
    });
  }

  await recordOrderEvent({
    registrationId,
    type: "order_voided",
    summary: `Voided (${reason})${note ? ` — ${note}` : ""}${s.collectedCents > 0 ? ` · ${fmt(s.collectedCents)} refund owed` : ""}`,
    actor,
    payload: { reason, note, collectedCents: s.collectedCents, scanned },
  });
}

// ── search ────────────────────────────────────────────────────────────────

export type DeskSearchHit = {
  id: string;
  conf: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string | null;
  status: string;
  deskState: string | null;
  source: string;
  totalCents: number;
  balanceCents: number;
  passes: number;
  checkedIn: number;
  createdAt: Date;
};

/**
 * One search box for the whole desk: name, phone, email, confirmation number,
 * or a scanned QR. Searches EVERY registration, web ones included — the family
 * who bought online in July is exactly who turns up at the door wanting to add
 * a child.
 */
export async function searchOrders(q: string, limit = 25): Promise<DeskSearchHit[]> {
  await ensureDeskSchema();
  const db = getDb();
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const digits = term.replace(/\D/g, "");

  let regs;
  try {
    // A scanned pass code resolves to its order.
    if (/^PRAGATI-TKT-/i.test(term)) {
      const [tk] = await db.select().from(schema.tickets).where(eq(schema.tickets.qrCode, term));
      if (!tk) return [];
      regs = await db.select().from(schema.registrations).where(eq(schema.registrations.id, tk.registrationId));
    } else {
      regs = await db
        .select()
        .from(schema.registrations)
        .where(
          or(
            ilike(schema.registrations.confirmationNumber, like),
            ilike(schema.registrations.buyerName, like),
            ilike(schema.registrations.buyerEmail, like),
            digits.length >= 4 ? ilike(schema.registrations.buyerPhone, `%${digits}%`) : undefined
          )
        )
        .orderBy(desc(schema.registrations.createdAt))
        .limit(limit);
    }
  } catch {
    return [];
  }
  if (regs.length === 0) return [];

  const ids = regs.map((r) => r.id);
  const tickets = await db.select().from(schema.tickets).where(inArray(schema.tickets.registrationId, ids));
  const tenders = await db
    .select()
    .from(schema.payments)
    .where(and(inArray(schema.payments.entityId, ids), eq(schema.payments.source, "desk")));
  const adjustments = await db
    .select()
    .from(schema.deskAdjustments)
    .where(inArray(schema.deskAdjustments.registrationId, ids));

  return regs.map((r) => {
    const tks = tickets.filter((t) => t.registrationId === r.id);
    const tds = tenders.filter((t) => t.entityId === r.id && !t.reversedAt);
    const adj = adjustments.filter((a) => a.registrationId === r.id && !a.voidedAt);
    const isDesk = r.source === "desk" || !!r.deskState;
    const listPrice = tks.reduce((s, t) => s + (t.priceCents ?? 0), 0);
    const due = isDesk
      ? Math.max(0, listPrice + (r.donationCents ?? 0) - adj.reduce((s, a) => s + a.amountCents, 0))
      : r.totalCents;
    const paid = isDesk
      ? tds.filter((t) => ["paid", "pending", "pending_verification"].includes(t.status)).reduce((s, t) => s + t.amountCents, 0)
      : r.status === "paid"
        ? r.totalCents
        : 0;
    return {
      id: r.id,
      conf: r.confirmationNumber,
      buyerName: r.buyerName,
      buyerEmail: r.buyerEmail,
      buyerPhone: r.buyerPhone,
      status: r.status,
      deskState: r.deskState,
      source: r.source,
      totalCents: due,
      balanceCents: r.deskState === "voided" ? 0 : due - paid,
      passes: tks.length,
      checkedIn: tks.filter((t) => t.checkedInAt).length,
      createdAt: r.createdAt,
    };
  });
}

/** Adult passes that could act as a guardian — used when adding a child later. */
export async function guardianCandidates(eventId: string, q: string) {
  const db = getDb();
  const like = `%${q.trim()}%`;
  if (q.trim().length < 2) return [];
  try {
    const rows = await db
      .select({
        ticketId: schema.tickets.id,
        name: sql<string>`trim(coalesce(${schema.tickets.attendeeFirstName},'') || ' ' || coalesce(${schema.tickets.attendeeLastName},''))`,
        age: schema.tickets.attendeeAge,
        conf: schema.registrations.confirmationNumber,
        buyerName: schema.registrations.buyerName,
        checkedInAt: schema.tickets.checkedInAt,
      })
      .from(schema.tickets)
      .innerJoin(schema.registrations, eq(schema.tickets.registrationId, schema.registrations.id))
      .where(
        and(
          eq(schema.registrations.eventId, eventId),
          or(
            ilike(schema.tickets.attendeeFirstName, like),
            ilike(schema.tickets.attendeeLastName, like),
            ilike(schema.registrations.confirmationNumber, like),
            ilike(schema.registrations.buyerName, like)
          )
        )
      )
      .limit(20);
    // Only adults may act as a guardian.
    return rows.filter((r) => r.age === null || r.age === undefined || r.age >= 18);
  } catch {
    return [];
  }
}

/** Orders this shift/day still has open — the desk home's working list. */
export async function openOrders(eventId: string, limit = 40): Promise<DeskSearchHit[]> {
  await ensureDeskSchema();
  const db = getDb();
  try {
    const regs = await db
      .select()
      .from(schema.registrations)
      .where(
        and(
          eq(schema.registrations.eventId, eventId),
          eq(schema.registrations.source, "desk"),
          inArray(schema.registrations.deskState, ["open", "settled"])
        )
      )
      .orderBy(desc(schema.registrations.createdAt))
      .limit(limit);
    if (regs.length === 0) return [];
    const hits = await Promise.all(regs.map((r) => searchOrders(r.confirmationNumber, 1)));
    return hits.flat();
  } catch {
    return [];
  }
}
