/**
 * Membership activation on paid dues. Called by the Square webhook (card) and
 * available to admin actions. Idempotent — the webhook may retry, and a member
 * who is already active is left untouched (no duplicate welcome email).
 */
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { getDb, schema } from "@/db/client";
import { getConfig } from "@/lib/system-config";
import { sendMail } from "@/lib/email";
import { welcomeEmail } from "@/lib/email/templates";
import { hashPassword } from "@/lib/auth/password";
import { createResetToken } from "@/lib/auth/reset";
import { ensureExtraColumns } from "@/lib/schema-ensure";
import { ensureMembershipColumn } from "@/lib/membership-ensure";
import { settlePayments, linkPaymentsToMember } from "@/lib/ledger";
import { siteUrl } from "@/lib/site-url";

const YEAR_MS = 365 * 86_400_000;

export async function activateMembershipPaid(
  memberId: string,
  opts: { squarePaymentId?: string; method?: "square" | "zelle" | "offline" | "comped"; verifiedBy?: string; reference?: string } = {}
): Promise<boolean> {
  const db = getDb();
  await ensureMembershipColumn();
  const [member] = await db.select().from(schema.members).where(eq(schema.members.id, memberId));
  if (!member) return false;
  if (member.membershipStatus === "active") return true; // idempotent

  // Dues-payers used to be the ONLY members who got no expiry date and no member
  // number — honor-system claims got both. Set them here so every active
  // membership has a term and an ID, and so the expiry sweep can see it.
  const now = new Date();
  const expires = new Date(now.getTime() + YEAR_MS);
  const memberNumber = member.memberNumber ?? `PGM-${member.id.slice(0, 8).toUpperCase()}`;

  await db
    .update(schema.members)
    .set({
      membershipStatus: "active",
      membershipStartedAt: member.membershipStartedAt ?? now.toISOString().slice(0, 10),
      membershipExpiresAt: expires,
      memberNumber,
      updatedAt: now,
    })
    .where(eq(schema.members.id, memberId));

  await settlePayments("membership", memberId, {
    method: opts.method ?? "square",
    squarePaymentId: opts.squarePaymentId ?? null,
    verifiedBy: opts.verifiedBy ?? null,
    reference: opts.reference ?? null,
  });

  await db.insert(schema.auditLog).values({
    userId: member.userId,
    action: "update",
    entityType: "members",
    entityId: memberId,
    changes: {
      membershipStatus: { from: member.membershipStatus, to: "active" },
      via: opts.method ?? "square_card",
      squarePaymentId: opts.squarePaymentId,
    },
  });

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, member.userId));
  if (user?.email) {
    const orgName = await getConfig<string>("org_name");
    const validUntil = expires.toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric" });
    const mail = welcomeEmail({ firstName: member.primaryFirstName, familyName: member.familyName, orgName, memberNumber, validUntil });
    await sendMail({ to: user.email, ...mail, template: "welcome", relatedUserId: user.id, priority: 1 });
  }
  return true;
}

/**
 * Honor-system member: the buyer ticked "I'm already a member" during
 * registration. There is NO database/sign-in check (see the `member_mode`
 * config — this is the "honor" path). We still save them as a real member so
 * the roster is complete and we can remind them to formalize later.
 *
 * Creates or reuses a shadow account (an unusable random password — they never
 * signed up, so they can't log in until they reset), marks the member active,
 * tags source='self_declared', and assigns a member number. Idempotent, and it
 * never sends a welcome/login email (they didn't ask for an account). If a real
 * account already exists for this email it is reused and left untouched apart
 * from being (re)activated. Best-effort: never throws into the payment path.
 */
export async function recordSelfDeclaredMember(input: {
  email: string;
  name: string;
  phone?: string | null;
}): Promise<string | null> {
  try {
    const db = getDb();
    await ensureExtraColumns();
    await ensureMembershipColumn();
    const email = input.email.trim().toLowerCase();
    if (!email) return null;

    let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    if (!user) {
      [user] = await db
        .insert(schema.users)
        .values({ email, passwordHash: hashPassword(randomUUID() + randomUUID()), role: "member" })
        .returning();
    }

    const [first, ...rest] = input.name.trim().split(" ");
    const last = rest.join(" ");
    let [member] = await db.select().from(schema.members).where(eq(schema.members.userId, user.id));
    if (!member) {
      [member] = await db
        .insert(schema.members)
        .values({
          userId: user.id,
          familyName: last ? `${last} family` : `${first || input.name} family`,
          primaryFirstName: first || input.name,
          primaryLastName: last,
          phone: input.phone ?? undefined,
          membershipStatus: "pending_payment",
          source: "self_declared",
        })
        .returning();
    }

    // Already an active, unexpired member → nothing to do.
    if (member.membershipStatus === "active" && member.membershipExpiresAt && member.membershipExpiresAt > new Date()) {
      return member.id;
    }

    const now = new Date();
    const expires = new Date(now.getTime() + YEAR_MS);
    const memberNumber = member.memberNumber ?? `PGM-${member.id.slice(0, 8).toUpperCase()}`;
    await db
      .update(schema.members)
      .set({
        membershipStatus: "active",
        membershipStartedAt: member.membershipStartedAt ?? now.toISOString().slice(0, 10),
        membershipExpiresAt: expires,
        memberNumber,
        // fill a missing phone but don't clobber an existing account's details
        phone: member.phone ?? input.phone ?? undefined,
        updatedAt: now,
      })
      .where(eq(schema.members.id, member.id));

    await db.insert(schema.auditLog).values({
      userId: user.id,
      action: "create",
      entityType: "members",
      entityId: member.id,
      changes: { via: "self_declared_registration", membershipStatus: { from: member.membershipStatus, to: "active" } },
    });
    return member.id;
  } catch {
    // The roster entry is a nicety — never block a paid registration on it.
    return null;
  }
}

/**
 * A guest opted to become a member during registration and has now paid.
 * Create / reuse their account + member, activate for one year, assign a member
 * number, pull their family in, and email a welcome with the member ID and a
 * set-password login link. Idempotent (re-running won't duplicate or re-email
 * an already-active member).
 */
export async function enrollMemberFromPaidRegistration(
  reg: typeof schema.registrations.$inferSelect
): Promise<void> {
  const db = getDb();
  await ensureExtraColumns();
  await ensureMembershipColumn();
  const email = reg.buyerEmail.toLowerCase();

  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  let isNewUser = false;
  if (!user) {
    [user] = await db
      .insert(schema.users)
      .values({ email, passwordHash: hashPassword(randomUUID() + randomUUID()), role: "member" })
      .returning();
    isNewUser = true;
  }

  const [first, ...rest] = reg.buyerName.trim().split(" ");
  const last = rest.join(" ");
  let [member] = await db.select().from(schema.members).where(eq(schema.members.userId, user.id));
  if (!member) {
    [member] = await db
      .insert(schema.members)
      .values({
        userId: user.id,
        familyName: last ? `${last} family` : `${first || reg.buyerName} family`,
        primaryFirstName: first || reg.buyerName,
        primaryLastName: last,
        phone: reg.buyerPhone ?? undefined,
        membershipStatus: "pending_payment",
      })
      .returning();
  }
  if (member.membershipStatus === "active" && member.membershipExpiresAt && member.membershipExpiresAt > new Date()) {
    // already an active member — just make sure the registration is linked
    await db.update(schema.registrations).set({ memberId: member.id }).where(eq(schema.registrations.id, reg.id));
    await linkPaymentsToMember(reg.id, member.id);
    return;
  }

  const now = new Date();
  const expires = new Date(now.getTime() + YEAR_MS);
  const memberNumber = member.memberNumber ?? `PGM-${member.id.slice(0, 8).toUpperCase()}`;
  await db
    .update(schema.members)
    .set({
      membershipStatus: "active",
      membershipStartedAt: member.membershipStartedAt ?? now.toISOString().slice(0, 10),
      membershipExpiresAt: expires,
      memberNumber,
      updatedAt: now,
    })
    .where(eq(schema.members.id, member.id));

  // bring this registration's attendees in as family (best-effort, once)
  try {
    const fam = await db.select().from(schema.familyMembers).where(eq(schema.familyMembers.memberId, member.id));
    if (fam.length === 0) {
      const tix = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id));
      const seen = new Set<string>();
      for (const t of tix) {
        const key = `${t.attendeeFirstName} ${t.attendeeLastName ?? ""}`.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        await db.insert(schema.familyMembers).values({
          memberId: member.id,
          firstName: t.attendeeFirstName,
          lastName: t.attendeeLastName ?? "",
          relationship: "family",
          foodPref: (t.foodPref as "veg" | "non_veg" | "kid" | null) ?? "non_veg",
          isMember: false,
        });
      }
    }
  } catch {
    /* family is a nicety — never block enrollment */
  }

  await db.update(schema.registrations).set({ memberId: member.id }).where(eq(schema.registrations.id, reg.id));
  // The dues row was written at checkout as a guest — attribute it now.
  await linkPaymentsToMember(reg.id, member.id);

  const orgName = await getConfig<string>("org_name");
  const validUntil = expires.toLocaleDateString("en-US", { timeZone: "America/New_York", year: "numeric", month: "long", day: "numeric" });
  // They paid dues, so they're a real account-holder: invite them to set a
  // password and use the portal (honor-system claims never reach this path).
  let loginUrl: string | undefined;
  if (isNewUser) {
    const token = await createResetToken(user.id, "invite");
    loginUrl = siteUrl(`/reset-password?token=${token}`);
  }
  const mail = welcomeEmail({ firstName: member.primaryFirstName, familyName: member.familyName, orgName, memberNumber, validUntil, loginUrl });
  await sendMail({ to: email, ...mail, template: "welcome", relatedUserId: user.id, priority: 1 });
}
