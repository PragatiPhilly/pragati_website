"use server";

/**
 * Every desk action, in one place.
 *
 * Each one is a thin wrapper: get the actor (which is where the role check
 * happens — never in the component), call into lib/desk, revalidate, return a
 * plain result the UI can show. The guards throw; we catch and hand back the
 * message, so a hand-crafted request gets the same "no" the button would have.
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getActiveEvent } from "@/lib/queries/events";
import { DeskError, requireDesk, requireDeskMoney, type DeskActor } from "@/lib/desk/guards";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import {
  createDeskOrder,
  admitWithBalance,
  closeOrder,
  fillOrderDetails,
  reopenOrder,
  voidOrder,
  searchOrders,
  guardianCandidates,
  sendDeskTicketsEmail,
  type CreateDeskOrderInput,
  type DeskSearchHit,
} from "@/lib/desk/orders";
import { addTender, clearCustody, failTender, pollCardTender, reverseTender, voidTender, type AddTenderInput } from "@/lib/desk/tenders";
import { addAdjustment, voidAdjustment } from "@/lib/desk/adjustments";
import { bulkResolve, resolveFollowup } from "@/lib/desk/followups";
import { closeShift, openShift, recordDrop } from "@/lib/desk/shifts";
import type { AdjustmentKind, VoidReason } from "@/lib/desk/constants";
import type { DeskPerson } from "@/lib/desk/party";

export type ActionResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

async function run<T>(fn: (actor: DeskActor) => Promise<{ message?: string; data?: T }>, money = false): Promise<ActionResult<T>> {
  try {
    const actor = money ? await requireDeskMoney() : await requireDesk();
    await ensureDeskSchema();
    const out = await fn(actor);
    revalidatePath("/admin/desk");
    return { ok: true, message: out.message, data: out.data };
  } catch (e) {
    if (e instanceof DeskError) return { ok: false, error: e.message };
    const msg = e instanceof Error ? e.message : "Something went wrong.";
    console.error("[desk]", msg);
    return { ok: false, error: msg };
  }
}

// ── search ────────────────────────────────────────────────────────────────

export async function searchAction(q: string): Promise<ActionResult<DeskSearchHit[]>> {
  return run(async () => ({ data: await searchOrders(q) }));
}

export async function guardianSearchAction(q: string) {
  return run(async () => {
    const event = await getActiveEvent();
    if (!event) throw new DeskError("No active event.");
    return { data: await guardianCandidates(event.id, q) };
  });
}

// ── orders ────────────────────────────────────────────────────────────────

export async function createOrderAction(
  input: Omit<CreateDeskOrderInput, "eventId"> & { eventId?: string }
): Promise<ActionResult<{ registrationId: string; conf: string; warnings: string[]; reused: boolean }>> {
  return run(async (actor) => {
    let eventId = input.eventId;
    if (!eventId) {
      const active = await getActiveEvent();
      if (!active) throw new DeskError("No active event is set.");
      eventId = active.id;
    }
    const res = await createDeskOrder({ ...input, eventId }, actor);
    revalidatePath(`/admin/desk/o/${res.registrationId}`);
    return {
      message: res.reused ? "That order already exists — opening it." : `Opened ${res.confirmationNumber}`,
      data: {
        registrationId: res.registrationId,
        conf: res.confirmationNumber,
        warnings: res.warnings,
        reused: res.reused,
      },
    };
  });
}

export async function fillDetailsAction(
  registrationId: string,
  patch: { buyerEmail?: string; buyerPhone?: string; buyerName?: string; note?: string }
): Promise<ActionResult> {
  return run(async (actor) => {
    const out = await fillOrderDetails(registrationId, patch, actor);
    revalidatePath(`/admin/desk/o/${registrationId}`);
    return { message: out.emailed ? "Saved — tickets emailed ✓" : "Saved ✓" };
  });
}

export async function closeOrderAction(registrationId: string): Promise<ActionResult> {
  return run(async (actor) => {
    await closeOrder(registrationId, actor);
    revalidatePath(`/admin/desk/o/${registrationId}`);
    return { message: "Order closed ✓" };
  });
}

export async function admitWithBalanceAction(registrationId: string): Promise<ActionResult> {
  return run(async (actor) => {
    await admitWithBalance(registrationId, actor);
    revalidatePath(`/admin/desk/o/${registrationId}`);
    return { message: "Admitted — the balance is on the follow-up queue." };
  });
}

export async function voidOrderAction(registrationId: string, reason: VoidReason, note: string): Promise<ActionResult> {
  return run(async (actor) => {
    await voidOrder(registrationId, reason, note, actor);
    revalidatePath(`/admin/desk/o/${registrationId}`);
    return { message: "Order voided — the passes and the timeline stay." };
  });
}

export async function reopenOrderAction(registrationId: string, why: string): Promise<ActionResult> {
  return run(async (actor) => {
    await reopenOrder(registrationId, actor, why);
    revalidatePath(`/admin/desk/o/${registrationId}`);
    return { message: "Reopened." };
  });
}

export async function resendTicketsAction(registrationId: string): Promise<ActionResult> {
  return run(async (actor) => {
    const sent = await sendDeskTicketsEmail(registrationId, actor, { resend: true });
    return { message: sent ? "Tickets emailed ✓" : "No email address on this order yet." };
  });
}

// ── tenders ───────────────────────────────────────────────────────────────

export async function addTenderAction(
  input: AddTenderInput
): Promise<ActionResult<{ tenderId: string; paymentUrl?: string; changeDueCents: number; overpaidCents: number }>> {
  return run(async (actor) => {
    const out = await addTender(input, actor);
    revalidatePath(`/admin/desk/o/${input.registrationId}`);
    const bits = [`Recorded ${(input.amountCents / 100).toFixed(2)}`];
    if (out.changeDueCents > 0) bits.push(`change $${(out.changeDueCents / 100).toFixed(2)}`);
    return { message: bits.join(" · "), data: out };
  });
}

export async function pollCardAction(tenderId: string, registrationId: string): Promise<ActionResult> {
  return run(async () => {
    const out = await pollCardTender(tenderId);
    revalidatePath(`/admin/desk/o/${registrationId}`);
    if (!out.settled) throw new DeskError(out.message);
    return { message: out.message };
  });
}

export async function failTenderAction(tenderId: string, registrationId: string, why: string): Promise<ActionResult> {
  return run(async (actor) => {
    await failTender(tenderId, why || "Card declined", actor);
    revalidatePath(`/admin/desk/o/${registrationId}`);
    return { message: "Marked as not gone through." };
  });
}

export async function voidTenderAction(
  tenderId: string,
  registrationId: string,
  why: string,
  currentShiftId: string | null
): Promise<ActionResult> {
  return run(async (actor) => {
    await voidTender(tenderId, why, actor, currentShiftId);
    revalidatePath(`/admin/desk/o/${registrationId}`);
    return { message: "Payment undone." };
  });
}

export async function reverseTenderAction(tenderId: string, registrationId: string, why: string): Promise<ActionResult> {
  return run(async (actor) => {
    await reverseTender(tenderId, why, actor);
    revalidatePath(`/admin/desk/o/${registrationId}`);
    revalidatePath("/admin/desk/treasury");
    return { message: "Reversed — the order owes that money again." };
  });
}

// ── adjustments ───────────────────────────────────────────────────────────

export async function addAdjustmentAction(input: {
  registrationId: string;
  kind: AdjustmentKind;
  amountCents: number;
  reasonCode: string;
  note?: string;
}): Promise<ActionResult> {
  return run(async (actor) => {
    await addAdjustment(input, actor);
    revalidatePath(`/admin/desk/o/${input.registrationId}`);
    return { message: "Applied ✓" };
  });
}

export async function voidAdjustmentAction(id: string, registrationId: string, why: string): Promise<ActionResult> {
  return run(async (actor) => {
    await voidAdjustment(id, why, actor);
    revalidatePath(`/admin/desk/o/${registrationId}`);
    return { message: "Undone." };
  });
}

// ── follow-ups ────────────────────────────────────────────────────────────

export async function resolveFollowupAction(id: string, note: string, waive = false): Promise<ActionResult> {
  return run(async (actor) => {
    await resolveFollowup(id, actor, note, waive);
    revalidatePath("/admin/desk/followups");
    return { message: waive ? "Waived." : "Resolved ✓" };
  });
}

export async function bulkResolveAction(ids: string[], note: string): Promise<ActionResult<number>> {
  return run(async (actor) => {
    const n = await bulkResolve(ids, actor, note || "Resolved in bulk");
    revalidatePath("/admin/desk/followups");
    return { message: `${n} resolved ✓`, data: n };
  });
}

/** Fill an email in the queue and send that family their tickets, in one go. */
export async function fillEmailAndSendAction(registrationId: string, email: string): Promise<ActionResult> {
  return run(async (actor) => {
    const out = await fillOrderDetails(registrationId, { buyerEmail: email }, actor);
    revalidatePath("/admin/desk/followups");
    return { message: out.emailed ? "Email saved — tickets sent ✓" : "Email saved. Tickets go out once the order settles." };
  });
}

// ── treasury ──────────────────────────────────────────────────────────────

export async function clearCustodyAction(tenderIds: string[], depositRef: string): Promise<ActionResult<number>> {
  return run(async (actor) => {
    const n = await clearCustody(tenderIds, depositRef, actor);
    revalidatePath("/admin/desk/treasury");
    return { message: `${n} payment${n === 1 ? "" : "s"} cleared into the org account ✓`, data: n };
  }, true);
}

// ── shifts ────────────────────────────────────────────────────────────────

export async function openShiftAction(input: {
  station: string;
  openingFloatCents: number;
  note?: string;
}): Promise<ActionResult> {
  return run(async (actor) => {
    const event = await getActiveEvent();
    if (!event) throw new DeskError("No active event is set.");
    await openShift({ eventId: event.id, ...input }, actor);
    revalidatePath("/admin/desk/shifts");
    return { message: `${input.station} open ✓` };
  });
}

export async function recordDropAction(shiftId: string, amountCents: number, toWhom: string): Promise<ActionResult> {
  return run(async (actor) => {
    await recordDrop(shiftId, amountCents, toWhom, actor);
    revalidatePath("/admin/desk/shifts");
    return { message: "Drop recorded." };
  });
}

export async function closeShiftAction(input: {
  shiftId: string;
  countedCashCents: number;
  varianceNote?: string;
  force?: boolean;
}): Promise<ActionResult<{ varianceCents: number }>> {
  return run(async (actor) => {
    const out = await closeShift(input, actor);
    revalidatePath("/admin/desk/shifts");
    const v = out.varianceCents;
    return {
      message: v === 0 ? "Closed — the drawer balanced ✓" : `Closed — ${v > 0 ? "over" : "short"} by $${(Math.abs(v) / 100).toFixed(2)}`,
      data: out,
    };
  });
}

// ── live quote, so the screen shows exactly what will be charged ──────────

/**
 * Price a party WITHOUT creating anything.
 *
 * The desk must never show a total the server would then disagree with, so the
 * running figure on the tablet comes from the same function that will issue the
 * passes — not from a client-side mirror that drifts.
 */
export async function quoteAction(input: {
  people: DeskPerson[];
  isMemberPurchase?: boolean;
  eventId?: string;
  donationCents?: number;
}): Promise<ActionResult<{ listPriceCents: number; dueCents: number; passes: number; problems: { firstName: string; why: string }[]; lines: { name: string; type: string; day: string; priceCents: number }[] }>> {
  return run(async () => {
    let eventId = input.eventId;
    if (!eventId) {
      const active = await getActiveEvent();
      if (!active) throw new DeskError("No active event is set.");
      eventId = active.id;
    }
    const db = getDb();
    const [event] = await db.select().from(schema.events).where(eq(schema.events.id, eventId));
    if (!event) throw new DeskError("That event no longer exists.");
    const types = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.eventId, eventId));
    const days = ((event.days as { key: string }[] | null) ?? []).length;
    const { priceParty } = await import("@/lib/desk/party");
    const { getConfig } = await import("@/lib/system-config");
    const discountMode = ((await getConfig<string>("member_discount_mode")) === "whole_family"
      ? "whole_family"
      : "per_adult") as "per_adult" | "whole_family";
    const priced = priceParty(input.people, types, {
      eventDayCount: Math.max(days, 1),
      isMemberPurchase: !!input.isMemberPurchase,
      discountMode,
    });
    const donation = Math.max(0, Math.round(input.donationCents ?? 0));
    return {
      data: {
        listPriceCents: priced.listPriceCents,
        dueCents: priced.listPriceCents + donation,
        passes: priced.passes.length,
        problems: priced.problems.map((p) => ({ firstName: p.firstName, why: p.why })),
        lines: priced.passes.map((p) => ({
          name: [p.attendeeFirstName, p.attendeeLastName].filter(Boolean).join(" "),
          type: p.ticketTypeName,
          day: p.dayKey,
          priceCents: p.priceCents,
        })),
      },
    };
  });
}

/**
 * Membership is CHECKED, not claimed.
 *
 * The public flow has an honour-system backdoor ("I'm already a member"); the
 * desk does not. A volunteer looks the family up on the roster and picks them,
 * or an admin grants member pricing explicitly and it lands on the timeline.
 */
export async function memberLookupAction(q: string): Promise<ActionResult<{ memberId: string; label: string; active: boolean }[]>> {
  return run(async () => {
    if (q.trim().length < 2) return { data: [] };
    const db = getDb();
    const { ilike, or: orSql } = await import("drizzle-orm");
    const like = `%${q.trim()}%`;
    const rows = await db
      .select({
        id: schema.members.id,
        first: schema.members.primaryFirstName,
        last: schema.members.primaryLastName,
        family: schema.members.familyName,
        phone: schema.members.phone,
        status: schema.members.membershipStatus,
        number: schema.members.memberNumber,
      })
      .from(schema.members)
      .where(
        orSql(
          ilike(schema.members.primaryFirstName, like),
          ilike(schema.members.primaryLastName, like),
          ilike(schema.members.familyName, like),
          ilike(schema.members.phone, like),
          ilike(schema.members.memberNumber, like)
        )
      )
      .limit(10);
    return {
      data: rows.map((m) => ({
        memberId: m.id,
        label: `${m.first} ${m.last}${m.number ? ` · ${m.number}` : ""}${m.phone ? ` · ${m.phone}` : ""}${m.status === "active" ? "" : ` · ${m.status}`}`,
        active: m.status === "active",
      })),
    };
  });
}

// ── staff list, for "who did the Zelle go to?" ────────────────────────────

export async function staffListAction(): Promise<ActionResult<{ userId: string; label: string }[]>> {
  return run(async () => {
    const db = getDb();
    const rows = await db
      .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.role, "admin"));
    const vols = await db
      .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.role, "volunteer"));
    const supers = await db
      .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.role, "super_admin"));
    return {
      data: [...supers, ...rows, ...vols].map((u) => ({ userId: u.id, label: u.email })),
    };
  });
}
