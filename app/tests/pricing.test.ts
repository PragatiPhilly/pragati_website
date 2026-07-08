import { describe, it, expect } from "vitest";
import { priceQuote, attendeeGetsMemberPricing, type AttendeeInput, type TicketTypeInfo } from "../src/lib/pricing";

const types = new Map<string, TicketTypeInfo>([
  ["adult3", { id: "adult3", name: "Adult 3-day", priceMemberCents: 8000, priceNonmemberCents: 11500, ageBand: "adult" }],
  ["kid3", { id: "kid3", name: "Kid 3-day", priceMemberCents: 2000, priceNonmemberCents: 3000, ageBand: "child_5_12" }],
  ["membersOnly", { id: "membersOnly", name: "Members-only", priceMemberCents: 1000, priceNonmemberCents: -1, ageBand: "adult" }],
]);

const adult = (over: Partial<AttendeeInput> = {}): AttendeeInput => ({
  firstName: "A",
  isKid: false,
  isMemberFlagged: false,
  ticketTypeId: "adult3",
  foodPref: "non_veg",
  ...over,
});
const kid = (over: Partial<AttendeeInput> = {}): AttendeeInput => ({
  firstName: "K",
  isKid: true,
  age: 8,
  isMemberFlagged: false,
  ticketTypeId: "kid3",
  foodPref: "kid",
  ...over,
});

describe("member pricing rules", () => {
  it("guests never get member pricing", () => {
    expect(attendeeGetsMemberPricing(adult({ isMemberFlagged: true }), false, "per_adult")).toBe(false);
  });
  it("kids always get member pricing on a member purchase", () => {
    expect(attendeeGetsMemberPricing(kid(), true, "per_adult")).toBe(true);
  });
  it("per_adult mode: only flagged adults get member pricing", () => {
    expect(attendeeGetsMemberPricing(adult(), true, "per_adult")).toBe(false);
    expect(attendeeGetsMemberPricing(adult({ isMemberFlagged: true }), true, "per_adult")).toBe(true);
  });
  it("whole_family mode: all adults get member pricing", () => {
    expect(attendeeGetsMemberPricing(adult(), true, "whole_family")).toBe(true);
  });
});

describe("priceQuote", () => {
  it("prices a mixed family correctly (per_adult)", () => {
    const q = priceQuote(
      [adult({ isMemberFlagged: true }), adult(), kid()],
      types,
      { isMemberPurchase: true, discountMode: "per_adult" }
    );
    // 8000 (member) + 11500 (non-flagged adult) + 2000 (kid, member) = 21500
    expect(q.subtotalCents).toBe(21500);
    expect(q.totalCents).toBe(21500);
  });

  it("applies percent promo", () => {
    const q = priceQuote([adult()], types, {
      isMemberPurchase: false,
      discountMode: "per_adult",
      promo: { id: "p", discountType: "percent", discountValue: 10 },
    });
    expect(q.subtotalCents).toBe(11500);
    expect(q.discountCents).toBe(1150);
    expect(q.totalCents).toBe(10350);
  });

  it("fixed promo never exceeds subtotal", () => {
    const q = priceQuote([kid()], types, {
      isMemberPurchase: false,
      discountMode: "per_adult",
      promo: { id: "p", discountType: "fixed_amount_cents", discountValue: 99999 },
    });
    expect(q.totalCents).toBe(0);
  });

  it("rejects members-only tickets for non-members", () => {
    expect(() =>
      priceQuote([adult({ ticketTypeId: "membersOnly" })], types, { isMemberPurchase: false, discountMode: "per_adult" })
    ).toThrow(/members only/);
  });
});
