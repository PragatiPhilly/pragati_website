/**
 * Checkout core — creates registrations + tickets, handles both payment
 * rails, marks paid, sends emails. Used by the register flow, the Square
 * webhook, and the admin Zelle queue.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { nextConfirmationNumber, makeQrCode } from "@/lib/confirmation";
import { priceQuote, type AttendeeInput, type TicketTypeInfo, formatCents } from "@/lib/pricing";
import { getConfig } from "@/lib/system-config";
import { createSquarePaymentLink } from "@/lib/payments/square";
import { getZelleInstructions, type ZelleInstructions } from "@/lib/payments/zelle";
import { sendMail } from "@/lib/email";
import * as T from "@/lib/email/templates";

export type CheckoutAttendee = {
  firstName: string;
  lastName?: string;
  isKid: boolean;
  age?: number;
  isMemberFlagged?: boolean;
  days: string[]; // e.g. ['sat'] or ['fri','sat','sun']
  withFood: boolean;
  foodPref: "veg" | "non_veg" | "kid" | "none";
};

export type CheckoutInput = {
  eventId: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone?: string;
  memberId?: string;
  isMemberPurchase: boolean;
  source?: "web" | "day_of_kiosk" | "admin";
  paymentMethod: "square" | "zelle" | "offline";
  promoCode?: string;
  attendees: CheckoutAttendee[];
};

export type CheckoutResult =
  | { kind: "square_redirect"; confirmationNumber: string; url: string; totalCents: number }
  | { kind: "zelle_instructions"; confirmationNumber: string; zelle: ZelleInstructions; totalCents: number }
  | { kind: "offline"; confirmationNumber: string; totalCents: number };

/** Pick the right ticket type for an attendee given the event's types. */
export function resolveTicketType(
  a: CheckoutAttendee,
  types: (typeof schema.ticketTypes.$inferSelect)[],
  eventDayCount: number
): { type: (typeof schema.ticketTypes.$inferSelect); perDay: boolean } {
  const allDays = a.days.length >= eventDayCount;
  const band = a.isKid ? (a.age !== undefined && a.age < 5 ? "child_under_5" : "child_5_12") : "adult";
  const candidates = types.filter((t) => {
    if (t.ageBand !== band && t.ageBand !== "all") return false;
    const isFullPass = Array.isArray(t.dayKeys) && (t.dayKeys as string[]).length >= eventDayCount;
    if (allDays !== isFullPass) return false;
    if (band === "adult" && t.withFood !== a.withFood) return false;
    return true;
  });
  if (candidates.length === 0) throw new Error(`No ticket type for ${a.firstName} (${band}, days=${a.days.join(",")})`);
  return { type: candidates[0], perDay: !allDays };
}

export async function createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const db = getDb();
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, input.eventId));
  if (!event) throw new Error("Event not found");
  const types = await db
    .select()
    .from(schema.ticketTypes)
    .where(eq(schema.ticketTypes.eventId, event.id));
  const eventDays = (event.days as { key: string }[] | null) ?? [];
  const dayCount = Math.max(eventDays.length, 1);

  // Expand each attendee×day into priced lines
  const ttMap = new Map<string, TicketTypeInfo>(
    types.map((t) => [
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

  const expanded: { attendee: AttendeeInput; day?: string }[] = [];
  for (const a of input.attendees) {
    const { type, perDay } = resolveTicketType(a, types, dayCount);
    const base: Omit<AttendeeInput, "ticketTypeId"> = {
      firstName: a.firstName,
      lastName: a.lastName,
      isKid: a.isKid,
      age: a.age,
      isMemberFlagged: a.isMemberFlagged ?? false,
      foodPref: a.foodPref,
    };
    if (perDay) {
      for (const day of a.days) expanded.push({ attendee: { ...base, ticketTypeId: type.id }, day });
    } else {
      expanded.push({ attendee: { ...base, ticketTypeId: type.id } });
    }
  }

  // Promo
  let promo: { id: string; discountType: "percent" | "fixed_amount_cents"; discountValue: number } | null = null;
  if (input.promoCode) {
    const [p] = await db
      .select()
      .from(schema.promoCodes)
      .where(
        and(
          eq(schema.promoCodes.code, input.promoCode.toUpperCase()),
          eq(schema.promoCodes.eventId, event.id)
        )
      );
    if (p) {
      const now = new Date();
      const valid =
        (!p.validFrom || p.validFrom <= now) &&
        (!p.validUntil || p.validUntil >= now) &&
        (p.maxUsesTotal === null || p.currentUses < p.maxUsesTotal);
      if (valid) promo = { id: p.id, discountType: p.discountType as never, discountValue: p.discountValue };
    }
  }

  const discountMode = (await getConfig<string>("member_discount_mode")) as "per_adult" | "whole_family";
  const quote = priceQuote(
    expanded.map((e) => e.attendee),
    ttMap,
    { isMemberPurchase: input.isMemberPurchase, discountMode, promo }
  );

  const conf = await nextConfirmationNumber("PRG");
  const squareResMin = await getConfig<number>("square_reservation_minutes");
  const now = new Date();
  const reservationExpiresAt = new Date(now.getTime() + squareResMin * 60_000);

  const status =
    input.paymentMethod === "zelle"
      ? "pending_zelle_verification"
      : input.paymentMethod === "offline"
        ? "pending_payment"
        : "pending_payment";

  const [reg] = await db
    .insert(schema.registrations)
    .values({
      confirmationNumber: conf,
      eventId: event.id,
      memberId: input.memberId,
      buyerEmail: input.buyerEmail,
      buyerName: input.buyerName,
      buyerPhone: input.buyerPhone,
      isMemberPurchase: input.isMemberPurchase,
      source: input.source ?? "web",
      subtotalCents: quote.subtotalCents,
      discountCents: quote.discountCents,
      totalCents: quote.totalCents,
      promoCodeId: promo?.id,
      paymentMethod: input.paymentMethod,
      status,
      reservationExpiresAt,
    })
    .returning();

  // Tickets (one per attendee×day; QR each)
  for (let i = 0; i < expanded.length; i++) {
    const e = expanded[i];
    const line = quote.lines[i];
    await db.insert(schema.tickets).values({
      registrationId: reg.id,
      ticketTypeId: e.attendee.ticketTypeId,
      attendeeFirstName: e.attendee.firstName,
      attendeeLastName: e.attendee.lastName,
      attendeeAge: e.attendee.age,
      attendeeIsMember: line.memberPricing,
      foodPref: e.attendee.foodPref,
      priceCents: line.priceCents,
      qrCode: makeQrCode(),
      dayKey: e.day ?? "all",
    });
    await db
      .update(schema.ticketTypes)
      .set({ soldCount: sql`${schema.ticketTypes.soldCount} + 1` })
      .where(eq(schema.ticketTypes.id, e.attendee.ticketTypeId));
  }
  if (promo) {
    await db
      .update(schema.promoCodes)
      .set({ currentUses: sql`${schema.promoCodes.currentUses} + 1` })
      .where(eq(schema.promoCodes.id, promo.id));
  }

  if (input.paymentMethod === "square") {
    const link = await createSquarePaymentLink({
      referenceId: reg.id,
      confirmationNumber: conf,
      amountCents: quote.totalCents,
      description: `${event.name} tickets — ${conf}`,
    });
    await db
      .update(schema.registrations)
      .set({ squareOrderId: link.squareOrderId })
      .where(eq(schema.registrations.id, reg.id));
    return { kind: "square_redirect", confirmationNumber: conf, url: link.url, totalCents: quote.totalCents };
  }

  if (input.paymentMethod === "zelle") {
    const zelle = await getZelleInstructions(conf, quote.totalCents);
    return { kind: "zelle_instructions", confirmationNumber: conf, zelle, totalCents: quote.totalCents };
  }

  return { kind: "offline", confirmationNumber: conf, totalCents: quote.totalCents };
}

/** Buyer clicked "I've sent the Zelle" — extend hold, ack buyer, alert treasurer. */
export async function zelleSentClicked(confirmationNumber: string): Promise<void> {
  const db = getDb();
  const [reg] = await db
    .select()
    .from(schema.registrations)
    .where(eq(schema.registrations.confirmationNumber, confirmationNumber));
  if (!reg || reg.status !== "pending_zelle_verification") return;

  const holdHours = await getConfig<number>("zelle_reservation_hours");
  await db
    .update(schema.registrations)
    .set({
      zelleSentClickedAt: new Date(),
      reservationExpiresAt: new Date(Date.now() + holdHours * 3600_000),
    })
    .where(eq(schema.registrations.id, reg.id));

  const [orgName, zelleEmail, sla, treasurerEmail] = await Promise.all([
    getConfig<string>("org_name"),
    getConfig<string>("zelle_recipient_email"),
    getConfig<number>("zelle_verification_sla_hours"),
    getConfig<string>("treasurer_notification_email"),
  ]);

  const ack = T.zelleAckEmail({
    buyerName: reg.buyerName,
    conf: confirmationNumber,
    totalCents: reg.totalCents,
    zelleEmail,
    slaHours: sla,
    orgName,
  });
  await sendMail({ to: reg.buyerEmail, ...ack, template: "zelle_ack", relatedRegistrationId: reg.id });

  const alert = T.treasurerAlertEmail({
    conf: confirmationNumber,
    buyerName: reg.buyerName,
    totalCents: reg.totalCents,
    kind: "registration",
    adminUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/admin/payments/pending-zelle`,
  });
  await sendMail({ to: treasurerEmail, ...alert, template: "admin_alert", relatedRegistrationId: reg.id });
}

/** Source of truth for flipping a registration to paid (webhook or admin). */
export async function markRegistrationPaid(
  registrationId: string,
  via: { method: "square" | "zelle" | "offline"; squarePaymentId?: string; adminUserId?: string }
): Promise<void> {
  const db = getDb();
  const [reg] = await db
    .select()
    .from(schema.registrations)
    .where(eq(schema.registrations.id, registrationId));
  if (!reg || reg.status === "paid") return; // idempotent

  await db
    .update(schema.registrations)
    .set({
      status: "paid",
      paidAt: new Date(),
      squarePaymentId: via.squarePaymentId ?? reg.squarePaymentId,
      zelleVerifiedBy: via.method === "zelle" ? via.adminUserId : reg.zelleVerifiedBy,
      zelleVerifiedAt: via.method === "zelle" ? new Date() : reg.zelleVerifiedAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.registrations.id, registrationId));

  await sendTicketsEmail(registrationId);
}

/** Compose + send the full tickets email (used on payment AND for admin resends). */
export async function sendTicketsEmail(registrationId: string, opts: { resend?: boolean } = {}): Promise<boolean> {
  const db = getDb();
  const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId));
  if (!reg || reg.status !== "paid") return false;

  const tix = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, registrationId));
  const types = await db.select().from(schema.ticketTypes);
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? "Ticket";
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, reg.eventId));
  const orgName = await getConfig<string>("org_name");
  const base = process.env.NEXT_PUBLIC_SITE_URL;

  const mail = T.ticketsEmail({
    buyerName: reg.buyerName,
    conf: reg.confirmationNumber,
    eventName: event?.name ?? "the event",
    lines: tix.map((t) => ({
      name: [t.attendeeFirstName, t.attendeeLastName].filter(Boolean).join(" ") + (t.dayKey && t.dayKey !== "all" ? ` (${t.dayKey})` : ""),
      type: typeName(t.ticketTypeId),
      price: t.priceCents,
      passUrl: `${base}/t/${t.qrCode}`,
    })),
    totalCents: reg.totalCents,
    lookupUrl: `${base}/lookup?email=${encodeURIComponent(reg.buyerEmail)}&conf=${reg.confirmationNumber}`,
    printUrl: `${base}/tickets/${reg.confirmationNumber}/print?email=${encodeURIComponent(reg.buyerEmail)}`,
    orgName,
    resend: opts.resend,
  });
  await sendMail({ to: reg.buyerEmail, ...mail, template: opts.resend ? "ticket_resend" : "ticket", relatedRegistrationId: reg.id });
  return true;
}

/** Cancel + release held seats. */
export async function cancelRegistration(registrationId: string, reason: "cancelled" | "cancelled_no_payment") {
  const db = getDb();
  const [reg] = await db
    .select()
    .from(schema.registrations)
    .where(eq(schema.registrations.id, registrationId));
  if (!reg || reg.status === "paid" || reg.status.startsWith("cancelled")) return;
  await db
    .update(schema.registrations)
    .set({ status: reason, cancelledAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.registrations.id, registrationId));
  const tix = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, registrationId));
  for (const t of tix) {
    await db
      .update(schema.ticketTypes)
      .set({ soldCount: sql`${schema.ticketTypes.soldCount} - 1` })
      .where(eq(schema.ticketTypes.id, t.ticketTypeId));
  }
}
