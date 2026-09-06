/**
 * Turning "a family standing at the desk" into priced passes.
 *
 * This deliberately REUSES the pricing primitives the online checkout uses —
 * `resolveTicketType`, `matchConcertSelection`, `splitEven`, `priceQuote`,
 * `attendeeGetsMemberPricing` — so a walk-in and a web order are priced by the
 * same rules and a change to the price list applies to both. What is not reused
 * is the orchestration, because the desk needs three things the web flow does
 * not have and must not be given:
 *
 *  1. it can price a party where some details are missing,
 *  2. it issues a pass for an under-5 even when the event has no under-5 type,
 *     because the gate count and the food count still have to be right, and
 *  3. it refuses a minor with no adult attached.
 */
import { attendeeGetsMemberPricing, priceQuote, type AttendeeInput, type TicketTypeInfo } from "@/lib/pricing";
import { matchConcertSelection, sameDaySet, splitEven } from "@/lib/event-days";
import { resolveTicketType, type CheckoutAttendee, type StudentInfo } from "@/lib/checkout";
import { DeskError } from "@/lib/desk/guards";
import { GUARDIAN_REQUIRED_UNDER, type PersonKind } from "@/lib/desk/constants";
import type { schema } from "@/db/client";

export type TicketType = typeof schema.ticketTypes.$inferSelect;

/** One human in front of the desk. Everything optional is genuinely optional. */
export type DeskPerson = {
  /** Stable within one submission, so a guardian can be named before ids exist. */
  ref: string;
  firstName: string;
  lastName?: string;
  kind: PersonKind;
  age?: number;
  days: string[];
  withFood: boolean;
  foodPref: "veg" | "non_veg" | "kid" | "none";
  /** ref of another person in this party, or an existing ticket id (amendments). */
  guardianRef?: string | null;
  guardianTicketId?: string | null;
  student?: StudentInfo;
  isMemberFlagged?: boolean;
};

export type PricedPass = {
  personRef: string;
  ticketTypeId: string;
  ticketTypeName: string;
  attendeeFirstName: string;
  attendeeLastName?: string;
  attendeeAge?: number;
  foodPref: "veg" | "non_veg" | "kid" | "none";
  dayKey: string;
  priceCents: number;
  memberPricing: boolean;
  studentInfo?: StudentInfo | null;
  needsGuardian: boolean;
};

export type PricedParty = {
  passes: PricedPass[];
  listPriceCents: number;
  /** People we could not issue a pass for, with the reason — shown, never swallowed. */
  problems: { personRef: string; firstName: string; why: string }[];
};

/**
 * A "kid" aged 18 or over is an adult everywhere — the same rule the online
 * checkout enforces server-side, so a crafted request cannot smuggle an adult
 * onto youth pricing. Applied here too, before anything is priced.
 */
export function effectiveKind(p: DeskPerson): PersonKind {
  if (p.kind === "youth" || p.kind === "under5") {
    if (p.age !== undefined && p.age >= GUARDIAN_REQUIRED_UNDER) return "adult";
    if (p.age !== undefined && p.age < 5) return "under5";
    if (p.kind === "under5") return "under5";
    return "youth";
  }
  return p.kind;
}

export function needsGuardian(p: DeskPerson): boolean {
  const kind = effectiveKind(p);
  if (kind !== "youth" && kind !== "under5") return false;
  return p.age === undefined || p.age < GUARDIAN_REQUIRED_UNDER;
}

/** Map a desk person onto the attendee shape the shared pricing rules expect. */
function toCheckoutAttendee(p: DeskPerson): CheckoutAttendee {
  const kind = effectiveKind(p);
  const isKid = kind === "youth" || kind === "under5";
  return {
    firstName: p.firstName,
    lastName: p.lastName || undefined,
    isKid,
    // An under-5 with no age typed still has to price as an under-5.
    age: p.age ?? (kind === "under5" ? 3 : kind === "youth" ? 10 : undefined),
    isMemberFlagged: !!p.isMemberFlagged,
    days: p.days,
    withFood: kind === "concert" ? false : p.withFood,
    foodPref: kind === "concert" ? "none" : isKid ? "kid" : p.withFood ? p.foodPref : "none",
    concertOnly: kind === "concert",
    isStudent: kind === "student",
    student: p.student,
  };
}

/**
 * Price a party against an event's live ticket types.
 *
 * Mirrors createCheckout's expansion (full pass / explicit multi-day bundle
 * split across its days / legacy per-day) so a desk pass and a web pass for the
 * same selection cost the same and scan the same.
 */
export function priceParty(
  people: DeskPerson[],
  types: TicketType[],
  opts: {
    eventDayCount: number;
    isMemberPurchase: boolean;
    discountMode: "per_adult" | "whole_family";
  }
): PricedParty {
  const live = types.filter((t) => !t.archivedAt);
  const ttMap = new Map<string, TicketTypeInfo>(
    live.map((t) => [
      t.id,
      {
        id: t.id,
        name: t.name,
        priceMemberCents: t.priceMemberCents,
        priceNonmemberCents: t.priceNonmemberCents,
        ageBand: t.ageBand,
      },
    ])
  );
  const concertPasses = live.filter((t) => t.ageBand === "concert");

  const expanded: { personRef: string; attendee: AttendeeInput; day: string; student?: StudentInfo | null }[] = [];
  const problems: PricedParty["problems"] = [];

  for (const p of people) {
    const kind = effectiveKind(p);
    const a = toCheckoutAttendee(p);
    const base: Omit<AttendeeInput, "ticketTypeId"> = {
      firstName: a.firstName,
      lastName: a.lastName,
      isKid: a.isKid,
      age: a.age,
      isMemberFlagged: a.isMemberFlagged ?? false,
      foodPref: a.foodPref,
    };

    try {
      if (p.days.length === 0) throw new DeskError(`Pick at least one day for ${p.firstName}.`);

      // ── concert-only: one QR per night, never food ──────────────────────
      if (kind === "concert") {
        if (concertPasses.length === 0) throw new DeskError("This event has no concert passes.");
        const sel = matchConcertSelection(concertPasses, p.days);
        if (sel.mode === "combo") {
          const t = sel.pass;
          const member = attendeeGetsMemberPricing(
            { ...base, ticketTypeId: t.id },
            opts.isMemberPurchase,
            opts.discountMode
          );
          const total = member ? t.priceMemberCents : t.priceNonmemberCents;
          const shares = total >= 0 ? splitEven(total, sel.days.length) : [];
          sel.days.forEach((day, i) =>
            expanded.push({
              personRef: p.ref,
              attendee: { ...base, ticketTypeId: t.id, priceOverrideCents: total >= 0 ? shares[i] : undefined },
              day,
            })
          );
        } else {
          if (sel.items.length === 0) throw new DeskError(`No concert pass covers those nights for ${p.firstName}.`);
          for (const { day, pass } of sel.items)
            expanded.push({ personRef: p.ref, attendee: { ...base, ticketTypeId: pass.id }, day });
        }
        continue;
      }

      // ── under-5 with no dedicated pass ──────────────────────────────────
      // The web checkout skips issuing entirely here. The desk does NOT: the
      // gate headcount and the kitchen count both have to include this child.
      // We hang a zero-price pass off the nearest youth/universal type so the
      // row is real and scannable, and record the age on the ticket so the door
      // can see why it is free.
      if (kind === "under5" && !live.some((t) => t.ageBand === "child_under_5" || t.ageBand === "all")) {
        const carrier =
          live.find((t) => t.ageBand === "child_5_18" || t.ageBand === "child_5_12") ??
          live.find((t) => t.ageBand === "adult");
        if (!carrier) throw new DeskError(`No pass exists that could carry ${p.firstName}.`);
        // Issue the same SHAPE the carrier would: one "all days" pass when the
        // child is there for the whole event, otherwise one per day. A child
        // who produces twice as many rows as the adult beside them makes every
        // headcount wrong in the other direction.
        const carrierKeys = Array.isArray(carrier.dayKeys) ? (carrier.dayKeys as string[]) : null;
        const wholeEvent = p.days.length >= opts.eventDayCount && (!carrierKeys || sameDaySet(carrierKeys, p.days));
        if (wholeEvent) {
          expanded.push({
            personRef: p.ref,
            attendee: { ...base, ticketTypeId: carrier.id, priceOverrideCents: 0 },
            day: "all",
          });
        } else {
          for (const day of p.days)
            expanded.push({
              personRef: p.ref,
              attendee: { ...base, ticketTypeId: carrier.id, priceOverrideCents: 0 },
              day,
            });
        }
        continue;
      }

      const { type, mode } = resolveTicketType(a, live, opts.eventDayCount);
      if (mode === "full") {
        expanded.push({ personRef: p.ref, attendee: { ...base, ticketTypeId: type.id }, day: "all", student: p.student });
      } else if (mode === "bundle") {
        const member = attendeeGetsMemberPricing(
          { ...base, ticketTypeId: type.id },
          opts.isMemberPurchase,
          opts.discountMode
        );
        const total = member ? type.priceMemberCents : type.priceNonmemberCents;
        const shares = total >= 0 ? splitEven(total, p.days.length) : [];
        p.days.forEach((day, i) =>
          expanded.push({
            personRef: p.ref,
            attendee: { ...base, ticketTypeId: type.id, priceOverrideCents: total >= 0 ? shares[i] : undefined },
            day,
            student: p.student,
          })
        );
      } else {
        for (const day of p.days)
          expanded.push({ personRef: p.ref, attendee: { ...base, ticketTypeId: type.id }, day, student: p.student });
      }
    } catch (e) {
      problems.push({
        personRef: p.ref,
        firstName: p.firstName,
        why: e instanceof Error ? e.message : `No pass matches ${p.firstName}'s selection.`,
      });
    }
  }

  const quote = priceQuote(
    expanded.map((e) => e.attendee),
    ttMap,
    { isMemberPurchase: opts.isMemberPurchase, discountMode: opts.discountMode }
  );

  const byRef = new Map(people.map((p) => [p.ref, p]));
  const passes: PricedPass[] = expanded.map((e, i) => {
    const line = quote.lines[i];
    const person = byRef.get(e.personRef)!;
    return {
      personRef: e.personRef,
      ticketTypeId: e.attendee.ticketTypeId,
      ticketTypeName: ttMap.get(e.attendee.ticketTypeId)?.name ?? "Pass",
      attendeeFirstName: e.attendee.firstName,
      attendeeLastName: e.attendee.lastName,
      attendeeAge: e.attendee.age,
      foodPref: e.attendee.foodPref,
      dayKey: e.day,
      priceCents: line.priceCents,
      memberPricing: line.memberPricing,
      studentInfo: e.student ?? null,
      needsGuardian: needsGuardian(person),
    };
  });

  return {
    passes,
    listPriceCents: passes.reduce((s, p) => s + p.priceCents, 0),
    problems,
  };
}

/** Day combos an event actually sells for a band — used by the party builder. */
export function availableCombos(types: TicketType[], band: string): string[][] {
  const out: string[][] = [];
  for (const t of types) {
    if (t.archivedAt) continue;
    if (t.ageBand !== band && t.ageBand !== "all") continue;
    const keys = Array.isArray(t.dayKeys) ? (t.dayKeys as string[]) : null;
    if (!keys) continue;
    if (!out.some((c) => sameDaySet(c, keys))) out.push(keys);
  }
  return out;
}
