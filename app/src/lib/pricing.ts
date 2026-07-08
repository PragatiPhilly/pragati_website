/**
 * Pricing engine — pure functions, unit-tested in tests/pricing.test.ts.
 * Member discount: ticket_types carry explicit member/non-member prices.
 * member_discount_mode (per_adult | whole_family) decides which attendees
 * get member pricing on a member purchase. Spec: README + 03-data-model.md.
 */

export type AttendeeInput = {
  firstName: string;
  lastName?: string;
  isKid: boolean;
  age?: number;
  isMemberFlagged: boolean; // family_members.is_member (adults, Mode A)
  ticketTypeId: string;
  foodPref: "veg" | "non_veg" | "kid" | "none";
};

export type TicketTypeInfo = {
  id: string;
  name: string;
  priceMemberCents: number;
  priceNonmemberCents: number; // -1 = members only
  ageBand: string;
};

export type PromoInfo = {
  id: string;
  discountType: "percent" | "fixed_amount_cents";
  discountValue: number;
} | null;

export type PricedLine = {
  attendee: AttendeeInput;
  ticketType: TicketTypeInfo;
  memberPricing: boolean;
  priceCents: number;
};

export type Quote = {
  lines: PricedLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
};

export function attendeeGetsMemberPricing(
  attendee: AttendeeInput,
  isMemberPurchase: boolean,
  discountMode: "per_adult" | "whole_family"
): boolean {
  if (!isMemberPurchase) return false;
  if (attendee.isKid) return true; // kids always member pricing on a member purchase
  if (discountMode === "whole_family") return true;
  return attendee.isMemberFlagged;
}

export function priceQuote(
  attendees: AttendeeInput[],
  ticketTypes: Map<string, TicketTypeInfo>,
  opts: {
    isMemberPurchase: boolean;
    discountMode: "per_adult" | "whole_family";
    promo?: PromoInfo;
  }
): Quote {
  const lines: PricedLine[] = attendees.map((a) => {
    const tt = ticketTypes.get(a.ticketTypeId);
    if (!tt) throw new Error(`Unknown ticket type: ${a.ticketTypeId}`);
    const memberPricing = attendeeGetsMemberPricing(a, opts.isMemberPurchase, opts.discountMode);
    const priceCents = memberPricing ? tt.priceMemberCents : tt.priceNonmemberCents;
    if (priceCents < 0) throw new Error(`${tt.name} is available to members only`);
    return { attendee: a, ticketType: tt, memberPricing, priceCents };
  });

  const subtotalCents = lines.reduce((s, l) => s + l.priceCents, 0);
  let discountCents = 0;
  if (opts.promo) {
    discountCents =
      opts.promo.discountType === "percent"
        ? Math.round((subtotalCents * opts.promo.discountValue) / 100)
        : Math.min(opts.promo.discountValue, subtotalCents);
  }
  return { lines, subtotalCents, discountCents, totalCents: subtotalCents - discountCents };
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function ageOn(dateOfBirth: string | Date, onDate: Date): number {
  const dob = new Date(dateOfBirth);
  let age = onDate.getFullYear() - dob.getFullYear();
  const m = onDate.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && onDate.getDate() < dob.getDate())) age--;
  return age;
}
