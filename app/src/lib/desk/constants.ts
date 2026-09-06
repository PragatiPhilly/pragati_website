/**
 * Walk-in desk — pure data and pure functions.
 *
 * Deliberately DEPENDENCY-FREE, for the same reason lib/auth/sections.ts is:
 * client components (the party builder, the tender form) import these lists,
 * and importing a value from a module that touches the database drags `fs`,
 * `net` and `tls` into the browser bundle. The page then dies at runtime while
 * `tsc` and `next build` both stay silent.
 *
 * Rule: constants and pure helpers here; anything touching the request or the
 * database lives in the sibling modules.
 */

/** How a desk order moves. Separate from `registrations.status`, which keeps
 *  answering the money question the rest of the app already asks of it. */
export type DeskState = "draft" | "open" | "settled" | "closed" | "voided";

/** Payment shapes the desk can take. Mirrors payments.method plus 'check',
 *  which the online rails never had. */
export type TenderMethod = "cash" | "check" | "zelle" | "square" | "comped";

/**
 * WHERE THE MONEY IS — the second axis, and the whole point of the desk.
 *
 * `registrations.status` answers "has the guest settled?" and decides whether
 * they walk in. This answers "is the money in the org account?" and decides
 * whether the treasurer can stop chasing it. A Zelle sent to a committee
 * member's personal phone is settled AND held_by_person, for weeks.
 */
export type Custody =
  | "org_account" // with the organisation. terminal.
  | "in_drawer" // cash, in a named station's drawer
  | "undeposited_check" // physical cheque held
  | "held_by_person" // sent to an individual, or cash they pocketed
  | "n_a"; // comp / waiver / write-off — no money exists

export const CUSTODY_LABEL: Record<Custody, string> = {
  org_account: "In the org account",
  in_drawer: "Cash in drawer",
  undeposited_check: "Cheque not deposited",
  held_by_person: "Held by a person",
  n_a: "No money (comp)",
};

/** Custody values a treasurer still has to chase. */
export const OPEN_CUSTODY: Custody[] = ["in_drawer", "undeposited_check", "held_by_person"];

/** Ledger status a fresh tender opens in, by method. Cash and comps are real
 *  the instant they are taken; a card link is only a promise until Square says
 *  otherwise; a cheque is money in hand, held, not yet banked. */
export function openingTenderStatus(method: TenderMethod): "pending" | "paid" {
  return method === "square" ? "pending" : "paid";
}

/** Where a confirmed tender of this shape physically sits. */
export function defaultCustody(method: TenderMethod, sentToOrg = true): Custody {
  switch (method) {
    case "cash":
      return "in_drawer";
    case "check":
      return "undeposited_check";
    case "zelle":
      return sentToOrg ? "org_account" : "held_by_person";
    case "square":
      return "org_account";
    case "comped":
      return "n_a";
  }
}

/** Typed gaps and chases. A closed set — free text is what a Post-it is. */
export type FollowupKind =
  | "missing_email"
  | "missing_phone"
  | "missing_age"
  | "name_uncertain"
  | "verify_membership"
  | "check_uncleared"
  | "zelle_with_person"
  | "balance_owed"
  | "guardian_unlinked"
  | "duplicate_suspected"
  | "refund_due"
  | "card_unconfirmed";

export const FOLLOWUP_LABEL: Record<FollowupKind, string> = {
  missing_email: "No email address",
  missing_phone: "No phone number",
  missing_age: "Age not given",
  name_uncertain: "Name needs checking",
  verify_membership: "Membership claim to verify",
  check_uncleared: "Cheque not deposited",
  zelle_with_person: "Zelle held by a person",
  balance_owed: "Balance owed",
  guardian_unlinked: "Minor without a guardian",
  duplicate_suspected: "Possible duplicate",
  refund_due: "Refund owed",
  card_unconfirmed: "Card payment not confirmed",
};

/** Adjustment kinds. `amountCents` is always the amount taken OFF what the
 *  guest owes — so a surcharge is stored negative. One sign convention, checked
 *  by the invariant test. */
export type AdjustmentKind = "comp" | "discount" | "writeoff" | "surcharge";

export const ADJUSTMENT_REASONS: { code: string; label: string; kinds: AdjustmentKind[] }[] = [
  { code: "volunteer", label: "Volunteer", kinds: ["comp"] },
  { code: "clergy", label: "Priest / clergy", kinds: ["comp"] },
  { code: "performer", label: "Performer / artist", kinds: ["comp"] },
  { code: "guest_of_org", label: "Invited guest of Pragati", kinds: ["comp"] },
  { code: "sponsor_allocation", label: "Sponsor package", kinds: ["comp"] },
  { code: "committee", label: "Committee member", kinds: ["comp"] },
  { code: "hardship", label: "Hardship", kinds: ["discount", "comp"] },
  { code: "goodwill", label: "Goodwill / service recovery", kinds: ["discount"] },
  { code: "price_correction", label: "Price correction", kinds: ["discount", "surcharge"] },
  { code: "bounced_check", label: "Cheque bounced — written off", kinds: ["writeoff"] },
  { code: "uncollectable", label: "Uncollectable balance", kinds: ["writeoff"] },
  { code: "other", label: "Other (explain)", kinds: ["comp", "discount", "writeoff", "surcharge"] },
];

export const VOID_REASONS = [
  "created_in_error",
  "duplicate",
  "guest_left",
  "wrong_family",
  "test_entry",
  "other",
] as const;
export type VoidReason = (typeof VOID_REASONS)[number];

/** Timeline event types. Every one of these is written by a named person. */
export type OrderEventType =
  | "order_opened"
  | "person_added"
  | "person_removed"
  | "details_edited"
  | "tender_added"
  | "tender_confirmed"
  | "tender_failed"
  | "tender_voided"
  | "tender_reversed"
  | "custody_cleared"
  | "adjustment_added"
  | "adjustment_voided"
  | "admitted_with_balance"
  | "order_settled"
  | "order_closed"
  | "order_reopened"
  | "order_voided"
  | "followup_raised"
  | "followup_resolved"
  | "stub_printed"
  | "tickets_emailed"
  | "amendment_created";

/** The desk's own age bands, matched to the ticket-type bands the event uses. */
export type PersonKind = "adult" | "youth" | "under5" | "student" | "concert";

export const PERSON_KIND_LABEL: Record<PersonKind, string> = {
  adult: "Adult",
  youth: "Youth 5–18",
  under5: "Under 5",
  student: "Student",
  concert: "Concert only",
};

/** Anyone under this age needs an adult pass attached to their own. */
export const GUARDIAN_REQUIRED_UNDER = 18;

/** Money formatting is shared with the rest of the admin (lib/pricing), but the
 *  desk parses typed amounts too — "40", "40.00", "$40" all mean 4000 cents. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = (input ?? "").replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d*\.?\d{0,2}$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}
