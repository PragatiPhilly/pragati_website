/**
 * Live actuals — what really happened, read from the ledger.
 *
 * READS ONLY. This module exports no mutation and never will: the projection is
 * a plan, `payments` is the record, and a planning screen that could write to
 * the money ledger is a planning screen nobody should trust.
 *
 * It reads `payments` and NOT `donations`, because an in-checkout gift has a
 * donations row AND a payments row for the same money — the donations table is
 * a view over the ledger, and summing both double-counts.
 * (pragati-in-checkout-donations, pragati-payments-ledger)
 *
 * Every query is wrapped: a projections page with blank actuals is a mild
 * disappointment, a 500 is not.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";

export type HeadActuals = {
  /** Ticket money settled, in cents. */
  registrationCents: number;
  registrationOutstandingCents: number;
  /** All settled gifts/sponsorship taken through the site, in cents. Shown as
   *  unallocated: the ledger cannot know which sponsor line a gift belongs to. */
  donationCents: number;
  donationOutstandingCents: number;
  membershipCents: number;
  /** Card/processing fees actually paid — the one cost line the ledger knows. */
  feeCents: number;
  /** Paid attendance, by day and segment: the sheet's hand-typed footfall grid,
   *  filling itself. */
  attendance: Record<string, { withFood: number; withoutFood: number; kids: number }>;
  totalHeads: number;
  /** Null when there is no active event to date against. */
  daysOut: number | null;
  eventName: string | null;
  asOf: string;
};

export const EMPTY_ACTUALS: HeadActuals = {
  registrationCents: 0,
  registrationOutstandingCents: 0,
  donationCents: 0,
  donationOutstandingCents: 0,
  membershipCents: 0,
  feeCents: 0,
  attendance: {},
  totalHeads: 0,
  daysOut: null,
  eventName: null,
  asOf: new Date().toISOString(),
};

/** Age bands that mean "child" for the projection's kids segment. */
const KID_BANDS = new Set(["child_5_12", "child_under_5", "youth_5_18", "under_5"]);

export async function getActuals(): Promise<HeadActuals> {
  const out: HeadActuals = { ...EMPTY_ACTUALS, attendance: {}, asOf: new Date().toISOString() };

  // ── money ──────────────────────────────────────────────────────
  try {
    const { ensurePaymentsTable } = await import("@/lib/ledger-ensure");
    await ensurePaymentsTable().catch(() => {});
    const db = getDb();
    const rows = await db
      .select({
        kind: schema.payments.kind,
        status: schema.payments.status,
        amount: sql<number>`coalesce(sum(${schema.payments.amountCents}),0)`,
        fees: sql<number>`coalesce(sum(${schema.payments.feeCents}),0)`,
      })
      .from(schema.payments)
      .where(inArray(schema.payments.status, ["paid", "pending", "pending_verification"]))
      .groupBy(schema.payments.kind, schema.payments.status);

    for (const r of rows) {
      const amount = Number(r.amount) || 0;
      const settled = r.status === "paid";
      if (r.kind === "registration") {
        if (settled) out.registrationCents += amount;
        else out.registrationOutstandingCents += amount;
      } else if (r.kind === "donation") {
        if (settled) out.donationCents += amount;
        else out.donationOutstandingCents += amount;
      } else if (r.kind === "membership" && settled) {
        out.membershipCents += amount;
      }
      if (settled) out.feeCents += Number(r.fees) || 0;
    }
  } catch {
    /* ledger unavailable — actuals stay blank, the plan still works */
  }

  // ── attendance, by day and segment ─────────────────────────────
  try {
    const db = getDb();
    const { getActiveEvent } = await import("@/lib/queries/events");
    const event = await getActiveEvent();
    if (event) {
      out.eventName = event.name;
      const starts = event.startsAt ? new Date(event.startsAt as unknown as string) : null;
      if (starts && !Number.isNaN(starts.getTime())) {
        out.daysOut = Math.max(0, Math.round((starts.getTime() - Date.now()) / 86_400_000));
      }

      const rows = await db
        .select({
          dayKey: schema.tickets.dayKey,
          foodPref: schema.tickets.foodPref,
          ageBand: schema.ticketTypes.ageBand,
          withFood: schema.ticketTypes.withFood,
        })
        .from(schema.tickets)
        .innerJoin(schema.registrations, eq(schema.tickets.registrationId, schema.registrations.id))
        .innerJoin(schema.ticketTypes, eq(schema.tickets.ticketTypeId, schema.ticketTypes.id))
        .where(and(eq(schema.registrations.eventId, event.id), eq(schema.registrations.status, "paid")));

      for (const t of rows) {
        const key = t.dayKey ?? "all";
        const bucket = (out.attendance[key] ??= { withFood: 0, withoutFood: 0, kids: 0 });
        const isKid = KID_BANDS.has(t.ageBand ?? "") || t.foodPref === "kid";
        const eats = t.foodPref !== "none" && t.foodPref !== null && t.withFood !== false;
        if (isKid) bucket.kids++;
        else if (eats) bucket.withFood++;
        else bucket.withoutFood++;
        out.totalHeads++;
      }
    }
  } catch {
    /* no event, or the tickets tables are not there yet */
  }

  return out;
}
