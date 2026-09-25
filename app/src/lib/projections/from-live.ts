/**
 * Build a projection out of what the website already knows.
 *
 * The 2024 workbook was typed from scratch every year because nothing fed it.
 * This app HAS the ticket money, the head counts and the prices people actually
 * paid — so the only numbers a human should have to supply are the ones that
 * were never transacted here: the hall, the artists, the caterer, the pujo.
 *
 * Three tiers, and the UI must keep them visibly apart:
 *   live    — pulled from this event's own rows. Fact.
 *   carried — copied from a previous year (optionally escalated). A starting
 *             point, not an answer.
 *   blank   — nobody has a number for this yet.
 *
 * READS ONLY, like actuals.ts. Money comes from `payments`, never from
 * `donations` (that table is a view over the same money — summing both
 * double-counts). Head counts and realised prices come from `tickets`, which is
 * the only place that knows WHO came and WHAT THEY PAID after member pricing,
 * promo codes and desk discounts.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import {
  NEUTRAL_MODIFIERS,
  newId,
  type EventDayLite,
  type Line,
  type ProjectionDay,
  type ProjectionModel,
  type Segment,
} from "./types";

export type Provenance = "live" | "carried" | "blank";

/**
 * Age bands that mean "a child" for the model's kids segment.
 *
 * These are THIS app's bands (see the event form): adult · child_5_18 ·
 * child_under_5 · student · concert · addon. Getting this list wrong silently
 * counts youths as adults, which inflates the with-food segment and hides the
 * one fact the model exists to surface — that children are the segment losing
 * money.
 */
export const KID_AGE_BANDS = new Set(["child_5_18", "child_under_5"]);
/** Not a person — a parking space or an extra dinner. Never a head. */
export const NON_PERSON_AGE_BANDS = new Set(["addon"]);

export type TicketRow = {
  dayKey: string | null;
  foodPref: string | null;
  ageBand: string | null;
  typeWithFood: boolean | null;
  priceCents: number;
};

/** Which segment a sold ticket belongs to. Pure, and unit-tested. */
export function classifySegment(t: {
  foodPref: string | null;
  ageBand: string | null;
  typeWithFood: boolean | null;
}): Segment | null {
  const band = t.ageBand ?? "adult";
  if (NON_PERSON_AGE_BANDS.has(band)) return null;
  if (KID_AGE_BANDS.has(band)) return "kids";
  if (t.typeWithFood === false) return "withoutFood";
  if (t.foodPref === "none" || t.foodPref === null) return "withoutFood";
  return "withFood";
}

const emptySeg = (): Record<Segment, number> => ({ withFood: 0, withoutFood: 0, kids: 0 });

export type LivePull = {
  eventId: string | null;
  eventName: string | null;
  days: EventDayLite[];
  /** Heads actually sold, per event day per segment. */
  attendance: Record<string, Record<Segment, number>>;
  /** What those heads actually PAID, per day per segment, in cents — after
   *  member pricing, promos and desk discounts. Better than any list price. */
  realisedPrice: Record<string, Record<Segment, number>>;
  /** Fallback when nothing has sold in a segment yet: the price on the shelf. */
  listPrice: Record<string, Record<Segment, number>>;
  ticketRevenueCents: number;
  ticketOutstandingCents: number;
  donationCents: number;
  /** Each settled gift, so a human can split corporate from individual. */
  donationLines: { id: string; label: string; amountCents: number }[];
  membershipCents: number;
  /** Card / processing fees actually paid — a real cost line, exactly known. */
  feeCents: number;
  /** Distinct guests (a 3-day pass is one guest, not three). */
  totalHeads: number;
  /** Sum of every ticket's price — sanity check against the ledger figure. */
  ticketFaceValueCents: number;
  asOf: string;
};

export const EMPTY_PULL: LivePull = {
  eventId: null,
  eventName: null,
  days: [],
  attendance: {},
  realisedPrice: {},
  listPrice: {},
  ticketRevenueCents: 0,
  ticketOutstandingCents: 0,
  donationCents: 0,
  donationLines: [],
  membershipCents: 0,
  feeCents: 0,
  totalHeads: 0,
  ticketFaceValueCents: 0,
  asOf: new Date().toISOString(),
};

/** Everything the site can tell us about the active event, in one pass. */
export async function pullLive(): Promise<LivePull> {
  const out: LivePull = {
    ...EMPTY_PULL,
    attendance: {},
    realisedPrice: {},
    listPrice: {},
    donationLines: [],
    asOf: new Date().toISOString(),
  };
  const db = getDb();

  // ── money, from the ledger ────────────────────────────────────
  try {
    const { ensurePaymentsTable } = await import("@/lib/ledger-ensure");
    await ensurePaymentsTable().catch(() => {});
    const rows = await db
      .select()
      .from(schema.payments)
      .where(inArray(schema.payments.status, ["paid", "pending", "pending_verification"]));
    for (const r of rows) {
      const settled = r.status === "paid";
      const amt = r.amountCents || 0;
      if (r.kind === "registration") {
        if (settled) out.ticketRevenueCents += amt;
        else out.ticketOutstandingCents += amt;
      } else if (r.kind === "donation" && settled) {
        out.donationCents += amt;
      } else if (r.kind === "membership" && settled) {
        out.membershipCents += amt;
      }
      if (settled) out.feeCents += r.feeCents || 0;
    }
  } catch {
    /* no ledger yet — the caller shows this as "nothing to pull" */
  }

  // ── who is coming, and what they paid ─────────────────────────
  try {
    const { getActiveEvent } = await import("@/lib/queries/events");
    const event = await getActiveEvent();
    if (!event) return out;
    out.eventId = event.id;
    out.eventName = event.name;
    out.days = ((event.days as EventDayLite[] | null) ?? []).filter((d) => d && d.key);

    const rows: TicketRow[] = await db
      .select({
        dayKey: schema.tickets.dayKey,
        foodPref: schema.tickets.foodPref,
        ageBand: schema.ticketTypes.ageBand,
        typeWithFood: schema.ticketTypes.withFood,
        priceCents: schema.tickets.priceCents,
      })
      .from(schema.tickets)
      .innerJoin(schema.registrations, eq(schema.tickets.registrationId, schema.registrations.id))
      .innerJoin(schema.ticketTypes, eq(schema.tickets.ticketTypeId, schema.ticketTypes.id))
      .where(and(eq(schema.registrations.eventId, event.id), eq(schema.registrations.status, "paid")));

    const dayKeys = out.days.map((d) => d.key);
    const sums: Record<string, Record<Segment, number>> = {};
    for (const k of dayKeys) {
      out.attendance[k] = emptySeg();
      sums[k] = emptySeg();
    }

    for (const t of rows) {
      const seg = classifySegment(t);
      if (!seg) continue;
      out.ticketFaceValueCents += t.priceCents || 0;
      // A ticket stored as "all" covers every day of the event, and its price is
      // the whole-pass price — so it is one head on each day, and its money
      // divides across them. Everything else is already one row per day with its
      // own per-day share of a bundle (see lib/checkout.ts).
      const spansAll = !t.dayKey || t.dayKey === "all";
      const keys = spansAll ? dayKeys : [t.dayKey as string];
      if (keys.length === 0) continue;
      const share = (t.priceCents || 0) / keys.length;
      for (const k of keys) {
        if (!out.attendance[k]) {
          out.attendance[k] = emptySeg();
          sums[k] = emptySeg();
        }
        out.attendance[k][seg] += 1;
        sums[k][seg] += share;
      }
      // One ticket row = one guest-day, except an "all" pass, which is one
      // guest across the whole event. Counting it per day would triple it.
      out.totalHeads += 1;
    }

    for (const k of dayKeys) {
      out.realisedPrice[k] = emptySeg();
      for (const seg of ["withFood", "withoutFood", "kids"] as Segment[]) {
        const n = out.attendance[k][seg];
        out.realisedPrice[k][seg] = n > 0 ? Math.round(sums[k][seg] / n) : 0;
      }
    }

    // ── list prices, for a segment that has not sold anything yet ──
    const types = await db.select().from(schema.ticketTypes).where(eq(schema.ticketTypes.eventId, event.id));
    for (const k of dayKeys) {
      const shelf = emptySeg();
      for (const tt of types) {
        const band = tt.ageBand ?? "adult";
        if (NON_PERSON_AGE_BANDS.has(band)) continue;
        const bucket: Segment = KID_AGE_BANDS.has(band) ? "kids" : tt.withFood ? "withFood" : "withoutFood";
        const covers = Array.isArray(tt.dayKeys) ? (tt.dayKeys as string[]) : null;
        if (covers && !covers.includes(k)) continue;
        const face = tt.priceNonmemberCents >= 0 ? tt.priceNonmemberCents : tt.priceMemberCents;
        const perDay = Math.round(face / Math.max(1, covers ? covers.length : 1));
        // Keep the dearest option on the shelf — a committee prices up, not down.
        if (perDay > shelf[bucket]) shelf[bucket] = perDay;
      }
      out.listPrice[k] = shelf;
    }

    // ── gifts, listed so a human can attribute them ───────────────
    try {
      const gifts = await db.select().from(schema.donations).where(eq(schema.donations.status, "paid"));
      out.donationLines = gifts
        .map((g) => ({
          id: g.id,
          label: g.isAnonymous ? "Anonymous gift" : g.donorName,
          amountCents: g.amountCents || 0,
        }))
        .sort((a, b) => b.amountCents - a.amountCents)
        .slice(0, 60);
    } catch {
      /* donations table absent — the total from the ledger still stands */
    }
  } catch {
    /* no active event — money still pulled, drivers stay empty */
  }

  return out;
}

// ── turning a pull into a model ──────────────────────────────────

export type BuildOptions = {
  year: number;
  /** The previous year's model, for everything the site cannot know. */
  carryFrom: ProjectionModel;
  /** Percent uplift on carried cost lines and per-head food cost. */
  escalationPct: number;
  /** Add settled website gifts as an unallocated individual-sponsorship line. */
  includeDonations: boolean;
  /** Add membership dues as a revenue line. Off by default — dues are not event
   *  income, and the 2024 model never counted them. */
  includeMembership: boolean;
};

export type BuildResult = {
  model: ProjectionModel;
  dayProvenance: Record<string, { attendance: Provenance; price: Provenance; foodCost: Provenance }>;
  lineProvenance: Record<string, Provenance>;
  summary: {
    liveRevenueCents: number;
    carriedCostCents: number;
    liveCostCents: number;
    needsInput: number;
    headsPulled: number;
    daysMatched: number;
  };
};

/**
 * Compose the model: drivers and ticket money from the site, every cost head
 * carried from last year so nothing is ever blank, and each one tagged with
 * where it came from.
 */
export function buildFromLive(live: LivePull, opts: BuildOptions): BuildResult {
  const f = 1 + (opts.escalationPct || 0) / 100;
  const esc = (c: number) => Math.round(c * f);
  const dayProvenance: BuildResult["dayProvenance"] = {};
  const lineProvenance: Record<string, Provenance> = {};

  // ── days ───────────────────────────────────────────────────────
  // Prefer the real event's days. Fall back to last year's shape when there is
  // no published event yet, so the tool still works in January.
  const source: { key: string; label: string }[] =
    live.days.length > 0 ? live.days.map((d) => ({ key: d.key, label: d.label })) : opts.carryFrom.days.map((d) => ({ key: d.key, label: d.label }));

  const days: ProjectionDay[] = source.map((d, i) => {
    // Match last year by day key, falling back to position — Friday to Friday
    // even when the key changed, so food costs and prices follow the right day.
    const prev = opts.carryFrom.days.find((p) => p.key === d.key) ?? opts.carryFrom.days[i] ?? opts.carryFrom.days[0];
    const att = live.attendance[d.key];
    const realised = live.realisedPrice[d.key];
    const shelf = live.listPrice[d.key];
    const soldAnything = att ? att.withFood + att.withoutFood + att.kids > 0 : false;

    const price = (seg: Segment) =>
      realised && realised[seg] > 0
        ? realised[seg]
        : shelf && shelf[seg] > 0
          ? shelf[seg]
          : (prev?.price[seg] ?? 0);

    const priceIsLive =
      (realised && (realised.withFood > 0 || realised.withoutFood > 0 || realised.kids > 0)) ||
      (shelf && (shelf.withFood > 0 || shelf.withoutFood > 0));

    dayProvenance[d.key] = {
      attendance: soldAnything ? "live" : "carried",
      price: priceIsLive ? "live" : "carried",
      // Nobody sells catering through this website. This always needs a human.
      foodCost: "carried",
    };

    return {
      key: d.key,
      label: d.label,
      enabled: true,
      driverMode: prev?.driverMode === "manual" ? "manual" : "computed",
      attendance: soldAnything
        ? { withFood: att.withFood, withoutFood: att.withoutFood, kids: att.kids }
        : { ...(prev?.attendance ?? emptySeg()) },
      price: { withFood: price("withFood"), withoutFood: price("withoutFood"), kids: price("kids") },
      foodCost: prev
        ? {
            breakfast: esc(prev.foodCost.breakfast),
            lunch: esc(prev.foodCost.lunch),
            dinner: esc(prev.foodCost.dinner),
            kid: esc(prev.foodCost.kid),
          }
        : { breakfast: 0, lunch: 0, dinner: 0, kid: 0 },
    };
  });

  // Days last year had that this event does not (a Kali puja on its own date)
  // are kept, disabled, rather than silently dropped.
  for (const prev of opts.carryFrom.days) {
    if (!days.some((d) => d.key === prev.key)) {
      days.push({
        ...prev,
        enabled: false,
        foodCost: {
          breakfast: esc(prev.foodCost.breakfast),
          lunch: esc(prev.foodCost.lunch),
          dinner: esc(prev.foodCost.dinner),
          kid: esc(prev.foodCost.kid),
        },
      });
      dayProvenance[prev.key] = { attendance: "carried", price: "carried", foodCost: "carried" };
    }
  }

  // ── cost lines: carried, except the fees the ledger knows exactly ──
  const costLines: Line[] = opts.carryFrom.costLines.map((l) => {
    const id = newId();
    if (l.computed) {
      lineProvenance[id] = "live"; // driven by the pulled attendance
      return { ...l, id, actualCents: null };
    }
    if (l.actualSource === "ledger:fees") {
      lineProvenance[id] = "live";
      return {
        ...l,
        id,
        amountCents: live.feeCents > 0 ? live.feeCents : esc(l.amountCents),
        actualCents: live.feeCents > 0 ? live.feeCents : null,
        confidence: "confirmed",
      };
    }
    lineProvenance[id] = "carried";
    return { ...l, id, amountCents: esc(l.amountCents), actualCents: null };
  });

  // ── revenue lines ──────────────────────────────────────────────
  const revenueLines: Line[] = [];
  for (const l of opts.carryFrom.revenueLines) {
    const id = newId();
    if (l.computed) {
      lineProvenance[id] = "live";
      revenueLines.push({ ...l, id, actualCents: live.ticketRevenueCents || null });
      continue;
    }
    // Last year's named sponsors are LAST YEAR'S. Keep the rows as a checklist —
    // the committee works down them — but zero the amounts and mark them
    // unconfirmed, because carrying a sponsor's money forward as though it were
    // promised is exactly the mistake the 2024 sheet made.
    const sponsorship = l.head === "corporate" || l.head === "individual" || l.head === "magazine";
    lineProvenance[id] = sponsorship ? "blank" : "carried";
    revenueLines.push({
      ...l,
      id,
      amountCents: sponsorship ? 0 : esc(l.amountCents),
      confidence: sponsorship ? "expected" : l.confidence,
      actualCents: null,
    });
  }

  if (opts.includeDonations && live.donationCents > 0) {
    const id = newId();
    lineProvenance[id] = "live";
    revenueLines.push({
      id,
      head: "individual",
      label: "Website donations (unallocated)",
      amountCents: live.donationCents,
      confidence: "confirmed",
      actualCents: live.donationCents,
      actualSource: "ledger:donation",
      note: `${live.donationLines.length} settled gift${live.donationLines.length === 1 ? "" : "s"} taken through the site — split this into named sponsors as you attribute them.`,
    });
  }

  if (opts.includeMembership && live.membershipCents > 0) {
    const id = newId();
    lineProvenance[id] = "live";
    revenueLines.push({
      id,
      head: "individual",
      label: "Membership dues",
      amountCents: live.membershipCents,
      confidence: "confirmed",
      actualCents: live.membershipCents,
      actualSource: "ledger:membership",
      note: "Dues are not event income — included because you asked for them.",
    });
  }

  const model: ProjectionModel = {
    version: 1,
    year: opts.year,
    days,
    buffers: { ...opts.carryFrom.buffers },
    modifiers: { ...NEUTRAL_MODIFIERS },
    costLines,
    revenueLines,
    // Last year's closing cash is a bank fact nobody has typed yet.
    carryInCents: 0,
    targetProfitCents: opts.carryFrom.targetProfitCents ?? 0,
  };

  const needsInput =
    Object.values(lineProvenance).filter((p) => p !== "live").length +
    Object.values(dayProvenance).filter((d) => d.foodCost !== "live").length;

  return {
    model,
    dayProvenance,
    lineProvenance,
    summary: {
      liveRevenueCents: live.ticketRevenueCents + (opts.includeDonations ? live.donationCents : 0),
      carriedCostCents: costLines
        .filter((l) => lineProvenance[l.id] === "carried")
        .reduce((s, l) => s + l.amountCents, 0),
      liveCostCents: live.feeCents,
      needsInput,
      headsPulled: live.totalHeads,
      daysMatched: live.days.length,
    },
  };
}

/**
 * Fill the Actual column on an existing scenario from the ledger, without
 * touching a number a human typed. This is what turns "capture as the baseline"
 * from an evening of retyping into a click.
 */
export function applyActuals(
  model: ProjectionModel,
  live: LivePull
): { model: ProjectionModel; filled: number } {
  let filled = 0;
  const revenueLines = model.revenueLines.map((l) => {
    if (l.computed) {
      filled++;
      return { ...l, actualCents: live.ticketRevenueCents };
    }
    if (l.actualSource === "ledger:donation") {
      filled++;
      return { ...l, actualCents: live.donationCents };
    }
    if (l.actualSource === "ledger:membership") {
      filled++;
      return { ...l, actualCents: live.membershipCents };
    }
    return l;
  });
  const costLines = model.costLines.map((l) => {
    if (l.actualSource === "ledger:fees") {
      filled++;
      return { ...l, actualCents: live.feeCents };
    }
    return l;
  });
  return { model: { ...model, revenueLines, costLines }, filled };
}
