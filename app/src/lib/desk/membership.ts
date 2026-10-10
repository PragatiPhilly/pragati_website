/**
 * Membership at the walk-in desk (Admin → Walk-in desk → Membership).
 *
 * Anyone at the door — already a member, an honour-system "I'm a member" from
 * registration, a family who booked online, or someone we have never seen —
 * can join, renew or extend for one year, paying by card on Square's own page
 * (they type the card themselves on the desk tablet or their phone) or by
 * Zelle the volunteer has seen land.
 *
 * Money: ONE `payments` row per attempt, kind = 'membership', exactly the shape
 * the public dues flow writes, so every existing report counts it the same way.
 * It is deliberately NOT source = 'desk': the desk's tender code reads every
 * desk row as belonging to a registration. Desk rows are told apart by
 * `instrument.via = 'desk'`.
 *
 * Renewals: the public flow (activateMembershipPaid) does nothing for a member
 * who is already active, because it was written for first payments. Desk dues
 * on an active member EXTEND the term by a year from the current end date —
 * that logic lives here and only here, and only runs when THIS row turns paid
 * (a conditional update), so a retried webhook or a double tap cannot add two
 * years for one payment.
 */
import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb, schema } from "@/db/client";
import { getConfig } from "@/lib/system-config";
import { cardProcessingFeeCents, formatCents } from "@/lib/pricing";
import { ensureMembershipColumn } from "@/lib/membership-ensure";
import { ensureExtraColumns } from "@/lib/schema-ensure";
import { ensurePaymentsTable } from "@/lib/ledger-ensure";
import { hashPassword } from "@/lib/auth/password";
import { DeskError, type DeskActor } from "./guards";

/** Same calendar date next year (a leap day lands on Feb 28). */
export function plusOneYear(d: Date): Date {
  const out = new Date(d);
  out.setUTCFullYear(out.getUTCFullYear() + 1);
  if (out.getUTCMonth() !== d.getUTCMonth()) out.setUTCDate(0);
  return out;
}
const TZ = "America/New_York";

type Member = typeof schema.members.$inferSelect;

export type MemberStanding = "active" | "expired" | "not_paid" | "honour";

export type DeskMemberHit = {
  memberId: string;
  name: string;
  family: string;
  email: string;
  phone: string;
  number: string | null;
  standing: MemberStanding;
  expiresAt: string | null;
  /** What the end date becomes if they pay a year now. */
  nextExpiresAt: string;
};

export type DeskGuestHit = {
  registrationId: string;
  conf: string;
  name: string;
  email: string;
  phone: string;
};

// ── pure rules (unit-tested) ────────────────────────────────────────────────

/** Where a member stands today, in words a volunteer can act on. */
export function standingOf(
  m: Pick<Member, "membershipStatus" | "membershipExpiresAt" | "source">,
  now: Date = new Date()
): MemberStanding {
  if (m.membershipStatus !== "active") return m.membershipStatus === "inactive" ? "expired" : "not_paid";
  if (m.membershipExpiresAt && new Date(m.membershipExpiresAt) <= now) return "expired";
  if (m.source === "self_declared") return "honour";
  return "active";
}

/**
 * The new end date after one more year of dues.
 *  - Paid-up and still running → one year on from the CURRENT end date (renew early, lose nothing).
 *  - Honour-system claim → they never paid; this payment is their first real year:
 *    a year from today (never shorter than what they already show).
 *  - Lapsed, unpaid or new → a year from today.
 */
export function nextExpiry(
  m: Pick<Member, "membershipStatus" | "membershipExpiresAt" | "source">,
  now: Date = new Date()
): Date {
  const fromToday = plusOneYear(now);
  const current = m.membershipExpiresAt ? new Date(m.membershipExpiresAt) : null;
  const s = standingOf(m, now);
  if (s === "active" && current) return plusOneYear(current);
  if (s === "honour" && current && current > fromToday) return current;
  return fromToday;
}

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", { timeZone: TZ, year: "numeric", month: "long", day: "numeric" });

// ── reads ───────────────────────────────────────────────────────────────────

export async function membershipPrice(): Promise<{ priceCents: number; cardFeeCents: number }> {
  const priceCents = Number(await getConfig<number>("membership_annual_price_cents"));
  return { priceCents, cardFeeCents: cardProcessingFeeCents(priceCents) };
}

async function ensureAll() {
  await ensureExtraColumns();
  await ensureMembershipColumn();
  await ensurePaymentsTable();
}

/** Members (by name, family, phone, email, member no.) and, below them, this event's bookers who aren't members yet. */
export async function searchForMembership(q: string): Promise<{ members: DeskMemberHit[]; guests: DeskGuestHit[] }> {
  const needle = q.trim();
  if (needle.length < 2) return { members: [], guests: [] };
  await ensureAll();
  const db = getDb();
  const like = `%${needle}%`;
  const rows = await db
    .select({ m: schema.members, email: schema.users.email })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(
      and(
        isNull(schema.members.deletedAt),
        or(
          ilike(schema.members.primaryFirstName, like),
          ilike(schema.members.primaryLastName, like),
          ilike(schema.members.familyName, like),
          ilike(schema.members.phone, like),
          ilike(schema.members.memberNumber, like),
          ilike(schema.users.email, like),
          sql`(${schema.members.primaryFirstName} || ' ' || ${schema.members.primaryLastName}) ILIKE ${like}`
        )
      )
    )
    .limit(12);
  const members: DeskMemberHit[] = rows.map(({ m, email }) => ({
    memberId: m.id,
    name: `${m.primaryFirstName} ${m.primaryLastName}`.trim(),
    family: m.familyName,
    email,
    phone: m.phone ?? "",
    number: m.memberNumber,
    standing: standingOf(m),
    expiresAt: m.membershipExpiresAt ? new Date(m.membershipExpiresAt).toISOString() : null,
    nextExpiresAt: nextExpiry(m).toISOString(),
  }));

  // Bookers of the active event — the "I registered, can I become a member?" family.
  const { getActiveEvent } = await import("@/lib/queries/events");
  const event = await getActiveEvent();
  let guests: DeskGuestHit[] = [];
  if (event) {
    const regs = await db
      .select()
      .from(schema.registrations)
      .where(
        and(
          eq(schema.registrations.eventId, event.id),
          or(
            ilike(schema.registrations.buyerName, like),
            ilike(schema.registrations.buyerEmail, like),
            ilike(schema.registrations.buyerPhone, like),
            ilike(schema.registrations.confirmationNumber, like)
          )
        )
      )
      .orderBy(desc(schema.registrations.createdAt))
      .limit(20);
    const memberEmails = new Set(members.map((m) => m.email.toLowerCase()));
    const seen = new Set<string>();
    for (const r of regs) {
      const email = r.buyerEmail.trim().toLowerCase();
      if (r.status.startsWith("cancelled")) continue;
      const key = email || r.buyerName.toLowerCase();
      if ((email && memberEmails.has(email)) || seen.has(key)) continue;
      seen.add(key);
      guests.push({
        registrationId: r.id,
        conf: r.confirmationNumber,
        name: r.buyerName,
        email: r.buyerEmail,
        phone: r.buyerPhone ?? "",
      });
    }
    // A booker whose email already belongs to a member we didn't match by name.
    if (guests.length) {
      const emails = guests.map((g) => g.email.trim().toLowerCase()).filter(Boolean);
      if (emails.length) {
        const known = await db
          .select({ email: schema.users.email })
          .from(schema.users)
          .innerJoin(schema.members, eq(schema.members.userId, schema.users.id))
          .where(inArray(schema.users.email, emails));
        const knownSet = new Set(known.map((k) => k.email.toLowerCase()));
        guests = guests.filter((g) => !knownSet.has(g.email.trim().toLowerCase()));
      }
    }
    guests = guests.slice(0, 8);
  }
  return { members, guests };
}

export async function memberCard(memberId: string): Promise<DeskMemberHit | null> {
  await ensureAll();
  const db = getDb();
  const [row] = await db
    .select({ m: schema.members, email: schema.users.email })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(eq(schema.members.id, memberId));
  if (!row) return null;
  const m = row.m;
  return {
    memberId: m.id,
    name: `${m.primaryFirstName} ${m.primaryLastName}`.trim(),
    family: m.familyName,
    email: row.email,
    phone: m.phone ?? "",
    number: m.memberNumber,
    standing: standingOf(m),
    expiresAt: m.membershipExpiresAt ? new Date(m.membershipExpiresAt).toISOString() : null,
    nextExpiresAt: nextExpiry(m).toISOString(),
  };
}

// ── new member ──────────────────────────────────────────────────────────────

/**
 * Find or create the member for someone joining at the desk. An existing
 * account with that email is reused (and its member record, if it has one) —
 * we never make a second account for the same email.
 */
export async function findOrCreateDeskMember(
  input: { firstName: string; lastName: string; email: string; phone: string },
  actor: DeskActor
): Promise<{ memberId: string; existed: boolean }> {
  const first = input.firstName.trim();
  const last = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (!first) throw new DeskError("Type their first name.");
  if (!last) throw new DeskError("Type their last name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DeskError("Type a real email — that's where their membership confirmation goes.");
  if (phone.replace(/\D/g, "").length < 10) throw new DeskError("Type their phone number (10 digits).");
  await ensureAll();
  const db = getDb();

  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) {
    [user] = await db
      .insert(schema.users)
      .values({ email, passwordHash: hashPassword(randomUUID() + randomUUID()), role: "member" })
      .returning();
  }
  const [existing] = await db.select().from(schema.members).where(eq(schema.members.userId, user.id));
  if (existing) return { memberId: existing.id, existed: true };

  const [member] = await db
    .insert(schema.members)
    .values({
      userId: user.id,
      familyName: `${last} family`,
      primaryFirstName: first,
      primaryLastName: last,
      phone,
      membershipStatus: "pending_payment",
      source: "account",
      notes: `Joined at the walk-in desk (${actor.email}).`,
    })
    .returning();
  await db.insert(schema.auditLog).values({
    userId: actor.userId,
    action: "create",
    entityType: "members",
    entityId: member.id,
    changes: { via: "walk_in_desk", email },
  });
  return { memberId: member.id, existed: false };
}

// ── taking the dues ─────────────────────────────────────────────────────────

type Payment = typeof schema.payments.$inferSelect;

export type DuesResult = {
  paymentId: string;
  status: "paid" | "pending";
  payUrl?: string;
  totalCents: number;
  /** Set once paid. */
  done?: { expiresAt: string; memberNumber: string; renewed: boolean; emailed: boolean };
};

async function loadMember(memberId: string): Promise<{ member: Member; email: string }> {
  const db = getDb();
  const [row] = await db
    .select({ m: schema.members, email: schema.users.email })
    .from(schema.members)
    .innerJoin(schema.users, eq(schema.users.id, schema.members.userId))
    .where(eq(schema.members.id, memberId));
  if (!row || row.m.deletedAt) throw new DeskError("That member record isn't there any more — search again.");
  return { member: row.m, email: row.email };
}

async function byIdem(idem: string): Promise<Payment | undefined> {
  const [row] = await getDb()
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.kind, "membership"), sql`${schema.payments.instrument}->>'idem' = ${idem}`));
  return row;
}

function resultOf(row: Payment, member?: Member): DuesResult {
  const inst = (row.instrument ?? {}) as Record<string, unknown>;
  return {
    paymentId: row.id,
    status: row.status === "paid" ? "paid" : "pending",
    payUrl: typeof inst.payUrl === "string" ? inst.payUrl : undefined,
    totalCents: row.amountCents + row.feeCents,
    done:
      row.status === "paid" && member?.membershipExpiresAt
        ? {
            expiresAt: new Date(member.membershipExpiresAt).toISOString(),
            memberNumber: member.memberNumber ?? "",
            renewed: !!inst.renewed,
            emailed: !!inst.emailed,
          }
        : undefined,
  };
}

/**
 * Take a year's dues for a member.
 *  - zelle: the volunteer has SEEN the Zelle confirmation to Pragati's account → paid now.
 *  - square: a Square payment page is created; it turns paid when Square says so
 *    (desk "Check payment" button, the webhook, or the nightly reconciler).
 * `idem` is a one-per-attempt key from the screen, so a double tap returns the first attempt.
 */
export async function takeMembershipDues(
  input: {
    memberId: string;
    method: "square" | "zelle";
    idem: string;
    withCardFee?: boolean;
    zelle?: { confirmationSeen: boolean; senderName?: string; senderLast4?: string };
  },
  actor: DeskActor
): Promise<DuesResult> {
  if (!input.idem || !/^[A-Za-z0-9-]{8,64}$/.test(input.idem)) throw new DeskError("Reload the page and try again.");
  await ensureAll();
  const again = await byIdem(input.idem);
  if (again) return resultOf(again, (await loadMember(again.entityId)).member);

  const { member, email } = await loadMember(input.memberId);
  const { priceCents, cardFeeCents } = await membershipPrice();
  if (!(priceCents > 0)) throw new DeskError("No membership price is set. An admin can set it in Settings.");
  const payerName = `${member.primaryFirstName} ${member.primaryLastName}`.trim();
  const db = getDb();
  const renewal = standingOf(member) === "active";
  const base = {
    kind: "membership",
    entityId: member.id,
    groupId: null,
    memberId: member.id,
    payerName,
    payerEmail: email,
    amountCents: priceCents,
    source: "app",
  } as const;

  if (input.method === "zelle") {
    if (!input.zelle?.confirmationSeen)
      throw new DeskError("Ask them to show you the Zelle confirmation on their phone — sent to Pragati — then tick the box.");
    const zelleTo = (await getConfig<string>("zelle_recipient_email")) || "Pragati";
    const [row] = await db
      .insert(schema.payments)
      .values({
        ...base,
        feeCents: 0,
        method: "zelle",
        status: "paid",
        reference: `MEM ${payerName}`,
        verifiedBy: actor.userId,
        verifiedAt: new Date(),
        paidAt: new Date(),
        note: `Membership dues${renewal ? " (renewal)" : ""} — walk-in desk, Zelle confirmation seen by ${actor.email}`,
        instrument: {
          via: "desk",
          idem: input.idem,
          takenBy: actor.email,
          sentTo: zelleTo,
          senderName: input.zelle.senderName?.trim() || null,
          senderLast4: (input.zelle.senderLast4 ?? "").replace(/\D/g, "").slice(-4) || null,
          confirmationSeen: true,
        },
      })
      .returning();
    const done = await applyYear(row.id, actor.userId);
    const [fresh] = await db.select().from(schema.payments).where(eq(schema.payments.id, row.id));
    return { ...resultOf(fresh, done.member) };
  }

  // ── card: Square's hosted page ────────────────────────────────────────────
  const feeCents = input.withCardFee === false ? 0 : cardFeeCents;
  const [row] = await db
    .insert(schema.payments)
    .values({
      ...base,
      feeCents,
      method: "square",
      status: "pending",
      reference: `MEM-${member.id.slice(0, 6).toUpperCase()}`,
      note: `Membership dues${renewal ? " (renewal)" : ""} — walk-in desk, card`,
      instrument: { via: "desk", idem: input.idem, takenBy: actor.email, feeChargedCents: feeCents },
    })
    .returning();

  let link: { url: string; squareOrderId: string; paymentLinkId: string | null };
  try {
    const { createSquarePaymentLink } = await import("@/lib/payments/square");
    link = await createSquarePaymentLink({
      // The payment row's id, not the member's: Square uses this as the
      // idempotency key, and a member can pay dues more than once in their life.
      referenceId: row.id,
      confirmationNumber: `MEM-${member.id.slice(0, 6).toUpperCase()}`,
      amountCents: priceCents + feeCents,
      description: `Pragati Annual Membership — ${payerName}`,
      redirectPath: `/pay/membership-done`,
    });
  } catch (e) {
    await db
      .update(schema.payments)
      .set({ status: "cancelled", cancelledAt: new Date(), note: `${row.note} — Square page could not be created`, updatedAt: new Date() })
      .where(eq(schema.payments.id, row.id));
    throw new DeskError(`Couldn't open the card page (${e instanceof Error ? e.message : "Square error"}). Try again, or take Zelle.`);
  }

  await db
    .update(schema.payments)
    .set({
      squareOrderId: link.squareOrderId,
      instrument: { ...(row.instrument as Record<string, unknown>), payUrl: link.url, paymentLinkId: link.paymentLinkId, squareOrderId: link.squareOrderId },
      updatedAt: new Date(),
    })
    .where(eq(schema.payments.id, row.id));
  // Where the webhook and the nightly reconciler look up a dues payment.
  const { ensurePaymentIntegritySchema } = await import("@/lib/payments/ensure");
  await ensurePaymentIntegritySchema();
  await db
    .update(schema.members)
    .set({ squareOrderId: link.squareOrderId, squarePaymentLinkId: link.paymentLinkId })
    .where(eq(schema.members.id, member.id));

  return { paymentId: row.id, status: "pending", payUrl: link.url, totalCents: priceCents + feeCents };
}

/** The desk row (if any) behind a Square order — used by the webhook and the reconciler. */
export async function deskDuesForSquareOrder(orderId: string | null | undefined): Promise<Payment | null> {
  if (!orderId) return null;
  await ensurePaymentsTable();
  const [row] = await getDb()
    .select()
    .from(schema.payments)
    .where(
      and(
        eq(schema.payments.kind, "membership"),
        eq(schema.payments.squareOrderId, orderId),
        sql`${schema.payments.instrument}->>'via' = 'desk'`
      )
    );
  return row ?? null;
}

/**
 * Square confirmed a desk card payment. Idempotent: settles only a row that is
 * still pending, and only then adds the year.
 */
export async function settleDeskDuesCard(input: {
  paymentId: string;
  squarePaymentId: string | null;
  squareAmountCents: number | null;
}): Promise<{ settled: boolean; reason?: string }> {
  const db = getDb();
  const [row] = await db.select().from(schema.payments).where(eq(schema.payments.id, input.paymentId));
  if (!row) return { settled: false, reason: "No such payment." };
  if (row.status === "paid") return { settled: true };
  if (row.status !== "pending" && row.status !== "pending_verification")
    return { settled: false, reason: "This card attempt was cancelled at the desk — check the Payments page." };
  const expected = row.amountCents + row.feeCents;
  if (input.squareAmountCents !== null && input.squareAmountCents + 2 < expected) {
    const { alertAmountMismatch } = await import("@/lib/payments/alerts");
    await alertAmountMismatch({ reference: row.entityId, paymentId: input.squarePaymentId ?? undefined, expectedCents: expected, squareCents: input.squareAmountCents });
    return { settled: false, reason: `Square took ${formatCents(input.squareAmountCents)}, not ${formatCents(expected)}.` };
  }
  const won = await db
    .update(schema.payments)
    .set({
      status: "paid",
      paidAt: new Date(),
      squarePaymentId: input.squarePaymentId,
      squareVerifiedAt: new Date(),
      squareAmountCents: input.squareAmountCents,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.payments.id, row.id), inArray(schema.payments.status, ["pending", "pending_verification"])))
    .returning();
  if (won.length === 0) return { settled: true }; // someone else got there first
  await applyYear(row.id, null);
  return { settled: true };
}

/** The desk's "Check payment" button: ask Square directly. */
export async function checkDeskDuesCard(paymentId: string): Promise<{ settled: boolean; message: string; result?: DuesResult }> {
  const db = getDb();
  const [row] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
  if (!row || row.kind !== "membership") return { settled: false, message: "That payment is no longer there." };
  if (row.status !== "paid") {
    const { lookupSquarePaymentSafe } = await import("@/lib/payments/square");
    const res = await lookupSquarePaymentSafe(row.squareOrderId);
    if (!res.ok) return { settled: false, message: "Couldn't reach Square — try again in a moment." };
    if (!res.payment) return { settled: false, message: "Square hasn't seen the payment yet. Wait until their screen says it's done." };
    const out = await settleDeskDuesCard({ paymentId, squarePaymentId: res.payment.paymentId, squareAmountCents: res.payment.amountCents });
    if (!out.settled) return { settled: false, message: out.reason ?? "Square hasn't confirmed it yet." };
  }
  const [fresh] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
  const { member } = await loadMember(fresh.entityId);
  return { settled: true, message: "Card payment confirmed ✓", result: resultOf(fresh, member) };
}

/** "Their card didn't go through / they walked away" — retire the page so it can't be paid later. */
export async function cancelDeskDuesCard(paymentId: string, actor: DeskActor): Promise<void> {
  const db = getDb();
  const [row] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
  if (!row || row.kind !== "membership") throw new DeskError("That payment is no longer there.");
  if (row.status === "paid") throw new DeskError("That payment already went through — the membership is done.");
  // Ask Square one last time: never cancel money that actually arrived.
  if (row.squareOrderId) {
    const { lookupSquarePaymentSafe, deleteSquarePaymentLink } = await import("@/lib/payments/square");
    const res = await lookupSquarePaymentSafe(row.squareOrderId);
    if (res.ok && res.payment) {
      await settleDeskDuesCard({ paymentId, squarePaymentId: res.payment.paymentId, squareAmountCents: res.payment.amountCents });
      throw new DeskError("Square says they DID pay — the membership is done. Refresh to see it.");
    }
    const inst = (row.instrument ?? {}) as Record<string, unknown>;
    await deleteSquarePaymentLink(typeof inst.paymentLinkId === "string" ? inst.paymentLinkId : null);
  }
  await db
    .update(schema.payments)
    .set({ status: "cancelled", cancelledAt: new Date(), note: `${row.note ?? ""} — cancelled at the desk by ${actor.email}`, updatedAt: new Date() })
    .where(and(eq(schema.payments.id, paymentId), inArray(schema.payments.status, ["pending", "pending_verification"])));
}

/**
 * Add one year for a payment that has just become paid. Called exactly once per
 * row (by whoever flipped it to paid). Sends the welcome email when this is
 * their first real paid year.
 */
async function applyYear(paymentId: string, verifiedBy: string | null): Promise<{ member: Member }> {
  const db = getDb();
  const [row] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
  const { member, email } = await loadMember(row.entityId);
  const now = new Date();
  const before = standingOf(member, now);
  const expires = nextExpiry(member, now);
  const memberNumber = member.memberNumber ?? `PGM-${member.id.slice(0, 8).toUpperCase()}`;
  const [updated] = await db
    .update(schema.members)
    .set({
      membershipStatus: "active",
      membershipStartedAt: member.membershipStartedAt ?? now.toISOString().slice(0, 10),
      membershipExpiresAt: expires,
      memberNumber,
      // An honour-system claim that has now actually paid is a real membership.
      source: member.source === "self_declared" ? "account" : member.source,
      updatedAt: now,
    })
    .where(eq(schema.members.id, member.id))
    .returning();

  await db.insert(schema.auditLog).values({
    userId: verifiedBy,
    action: "update",
    entityType: "members",
    entityId: member.id,
    changes: {
      via: "walk_in_desk",
      paymentId,
      method: row.method,
      membershipStatus: { from: member.membershipStatus, to: "active" },
      expiresAt: { from: member.membershipExpiresAt, to: expires.toISOString() },
    },
  });

  // Welcome email for a first real year; a paid-up member renewing gets a short note.
  let emailed = false;
  try {
    const { sendMail } = await import("@/lib/email");
    const orgName = (await getConfig<string>("org_name")) || "Pragati";
    const validUntil = fmtDate(expires);
    if (before === "active") {
      const subject = `${orgName} membership renewed — valid through ${validUntil}`;
      const text = `Namaskar ${member.primaryFirstName},\n\nThank you for renewing at the ${orgName} desk. Your membership (${memberNumber}) is now valid through ${validUntil}.\n\n— ${orgName}`;
      await sendMail({ to: email, subject, text, html: text.replace(/\n/g, "<br>"), template: "membership_renewed", priority: 1 });
    } else {
      const { welcomeEmail } = await import("@/lib/email/templates");
      const [user] = await db.select().from(schema.users).where(eq(schema.users.id, member.userId));
      let loginUrl: string | undefined;
      if (user && !user.lastLoginAt) {
        const { createResetToken } = await import("@/lib/auth/reset");
        const { siteUrl } = await import("@/lib/site-url");
        loginUrl = siteUrl(`/reset-password?token=${await createResetToken(user.id, "invite")}`);
      }
      const mail = welcomeEmail({ firstName: member.primaryFirstName, familyName: member.familyName, orgName, memberNumber, validUntil, loginUrl });
      await sendMail({ to: email, ...mail, template: "welcome", relatedUserId: member.userId, priority: 1 });
    }
    emailed = true;
  } catch {
    /* the membership is done; an email failure must not undo it */
  }
  await db
    .update(schema.payments)
    .set({ instrument: { ...((row.instrument ?? {}) as Record<string, unknown>), renewed: before === "active", emailed }, updatedAt: new Date() })
    .where(eq(schema.payments.id, paymentId));
  return { member: updated };
}
