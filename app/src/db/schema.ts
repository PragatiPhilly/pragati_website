/**
 * Drizzle schema — mirrors spec/03-data-model.md.
 * Deviations (documented in BUILD-PLAN.md):
 *  - poster/logo images are plain URL columns for now (R2 pipeline is v1.5)
 *  - ids are UUIDs generated app-side (crypto.randomUUID)
 */
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

const uuid = () => crypto.randomUUID();
const id = () => text("id").primaryKey().$defaultFn(uuid);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ── users ──────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    role: text("role").notNull().default("member"), // member | admin | super_admin
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    failedLoginCount: integer("failed_login_count").notNull().default(0), // brute-force lockout
    lastFailedLoginAt: timestamp("last_failed_login_at", { withTimezone: true }),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), index("users_role_idx").on(t.role)]
);

// ── members (one family per account) ───────────────────────────
export const members = pgTable(
  "members",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    familyName: text("family_name").notNull(),
    primaryFirstName: text("primary_first_name").notNull(),
    primaryLastName: text("primary_last_name").notNull(),
    phone: text("phone"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    country: text("country").default("US"),
    membershipStatus: text("membership_status").notNull().default("pending_payment"), // pending_payment | active | inactive
    membershipStartedAt: date("membership_started_at"),
    squareOrderId: text("square_order_id"), // set when paying dues by card; matched by the Square webhook
    squarePaymentLinkId: text("square_payment_link_id"), // so an abandoned dues checkout's link can be retired
    membershipExpiresAt: timestamp("membership_expires_at", { withTimezone: true }), // active membership valid until
    memberNumber: text("member_number"), // friendly member ID shown to the member
    // account = created via signup/join flow · self_declared = honor-system claim
    // made during registration (no DB check; see member_mode config for the backdoor)
    source: text("source").notNull().default("account"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("members_user_idx").on(t.userId),
    index("members_status_idx").on(t.membershipStatus),
  ]
);

// ── family_members ─────────────────────────────────────────────
export const familyMembers = pgTable(
  "family_members",
  {
    id: id(),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    relationship: text("relationship").notNull().default("spouse"), // spouse | child | dependent_adult
    dateOfBirth: date("date_of_birth"),
    isMember: boolean("is_member").notNull().default(true),
    foodPref: text("food_pref").default("non_veg"), // veg | non_veg | kid
    dietaryNotes: text("dietary_notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("family_members_member_idx").on(t.memberId)]
);

// ── events ─────────────────────────────────────────────────────
export const events = pgTable(
  "events",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    nameBengali: text("name_bengali"),
    theme: text("theme").notNull().default("none"), // durga | kali | saraswati | none
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    venueName: text("venue_name"),
    venueAddress: text("venue_address"),
    venueMapUrl: text("venue_map_url"),
    posterUrl: text("poster_url"),
    days: jsonb("days"), // [{ key:'fri', label:'Friday · Oct 16', date:'2026-10-16' }, ...]
    status: text("status").notNull().default("draft"), // draft | published | cancelled | archived
    publishAt: timestamp("publish_at", { withTimezone: true }),
    isMemberOnly: boolean("is_member_only").notNull().default(false),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("events_slug_idx").on(t.slug), index("events_status_idx").on(t.status)]
);

// ── ticket_types ───────────────────────────────────────────────
export const ticketTypes = pgTable(
  "ticket_types",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    pricingModel: text("pricing_model").notNull().default("per_person"), // per_person | per_family
    priceMemberCents: integer("price_member_cents").notNull(),
    priceNonmemberCents: integer("price_nonmember_cents").notNull(), // -1 = members only
    ageBand: text("age_band").notNull().default("all"), // adult | child_5_12 | child_under_5 | senior | all
    dayKeys: jsonb("day_keys"), // which event days this covers, e.g. ['sat'] or ['fri','sat','sun']
    withFood: boolean("with_food").notNull().default(true),
    checkInStart: text("check_in_start"), // "HH:MM" event-local; concert-style gate. null = check in any time
    capacity: integer("capacity"),
    soldCount: integer("sold_count").notNull().default(0),
    requiresFoodSelection: boolean("requires_food_selection").notNull().default(true),
    saleStartsAt: timestamp("sale_starts_at", { withTimezone: true }),
    saleEndsAt: timestamp("sale_ends_at", { withTimezone: true }),
    displayOrder: integer("display_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }), // removed-but-sold: hidden everywhere, kept for records
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("ticket_types_event_idx").on(t.eventId, t.displayOrder)]
);

// ── promo_codes ────────────────────────────────────────────────
export const promoCodes = pgTable(
  "promo_codes",
  {
    id: id(),
    eventId: text("event_id").references(() => events.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    discountType: text("discount_type").notNull(), // percent | fixed_amount_cents
    discountValue: integer("discount_value").notNull(),
    maxUsesTotal: integer("max_uses_total"),
    maxUsesPerMember: integer("max_uses_per_member").default(1),
    currentUses: integer("current_uses").notNull().default(0),
    validFrom: timestamp("valid_from", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    createdBy: text("created_by"),
    archivedAt: timestamp("archived_at", { withTimezone: true }), // removed-but-used: hidden, kept for records
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("promo_event_code_idx").on(t.eventId, t.code)]
);

// ── registrations ──────────────────────────────────────────────
export const registrations = pgTable(
  "registrations",
  {
    id: id(),
    confirmationNumber: text("confirmation_number").notNull(), // PRG-YYYY-NNNN
    eventId: text("event_id")
      .notNull()
      .references(() => events.id),
    memberId: text("member_id").references(() => members.id), // null = guest
    buyerEmail: text("buyer_email").notNull(),
    buyerName: text("buyer_name").notNull(),
    buyerPhone: text("buyer_phone"),
    isMemberPurchase: boolean("is_member_purchase").notNull().default(false),
    source: text("source").notNull().default("web"), // web | day_of_kiosk | admin
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    processingFeeCents: integer("processing_fee_cents").notNull().default(0), // card surcharge, added when paying by Square
    donationCents: integer("donation_cents").notNull().default(0), // optional donation added during checkout
    membershipSignup: boolean("membership_signup").notNull().default(false), // buyer opted to become a member during this registration
    selfDeclaredMember: boolean("self_declared_member").notNull().default(false), // honor-system "I'm already a member" claim (no DB check)
    promoCodeId: text("promo_code_id").references(() => promoCodes.id),
    paymentMethod: text("payment_method").notNull(), // square | zelle | offline
    status: text("status").notNull().default("pending_payment"),
    // pending_payment | pending_zelle_verification | paid | cancelled | cancelled_no_payment
    squareOrderId: text("square_order_id"),
    squarePaymentId: text("square_payment_id"),
    // Square payment links never expire on their own. Keeping the link id lets the
    // sweeper DELETE the link when it gives up on a reservation, so an abandoned
    // checkout cannot be paid hours later against a cancelled order.
    squarePaymentLinkId: text("square_payment_link_id"),
    zelleVerifiedBy: text("zelle_verified_by"),
    zelleVerifiedAt: timestamp("zelle_verified_at", { withTimezone: true }),
    zelleSentClickedAt: timestamp("zelle_sent_clicked_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true }),
    notes: text("notes"),
    // ── walk-in desk (source = 'desk'); every one of these is null on a web
    //    order, and nothing outside lib/desk reads them. See lib/desk/ensure.ts.
    deskState: text("desk_state"), // draft | open | settled | closed | voided
    deskShiftId: text("desk_shift_id"), // which till session created it
    createdByUserId: text("created_by_user_id"), // the volunteer at the desk
    idempotencyKey: text("idempotency_key"), // a double-tapped Create returns this order
    parentRegistrationId: text("parent_registration_id"), // amendment → the order it hangs off
    admittedUnsettledBy: text("admitted_unsettled_by"), // who let them in owing money
    admittedUnsettledAt: timestamp("admitted_unsettled_at", { withTimezone: true }),
    deskVersion: integer("desk_version").notNull().default(0), // optimistic lock
    voidReason: text("void_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("registrations_conf_idx").on(t.confirmationNumber),
    index("registrations_event_status_idx").on(t.eventId, t.status),
    index("registrations_member_idx").on(t.memberId),
    index("registrations_buyer_idx").on(t.buyerEmail, t.confirmationNumber),
  ]
);

// ── tickets ────────────────────────────────────────────────────
export const tickets = pgTable(
  "tickets",
  {
    id: id(),
    registrationId: text("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    ticketTypeId: text("ticket_type_id")
      .notNull()
      .references(() => ticketTypes.id),
    attendeeFirstName: text("attendee_first_name").notNull(),
    attendeeLastName: text("attendee_last_name"),
    attendeeAge: integer("attendee_age"),
    attendeeIsMember: boolean("attendee_is_member").notNull().default(false),
    foodPref: text("food_pref"), // veg | non_veg | kid | none
    dietaryNotes: text("dietary_notes"),
    studentInfo: jsonb("student_info"), // { eduEmail, university, city, gradYear } for student passes
    dayKey: text("day_key").default("all"), // which event day this ticket covers ('all' = full pass)
    priceCents: integer("price_cents").notNull().default(0),
    qrCode: text("qr_code").notNull(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedInBy: text("checked_in_by"),
    // A minor's pass hangs off an adult's — which may live on ANOTHER
    // registration (the grandparent who brought them). Set by the desk only.
    guardianTicketId: text("guardian_ticket_id"),
    issuedByUserId: text("issued_by_user_id"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("tickets_qr_idx").on(t.qrCode),
    index("tickets_registration_idx").on(t.registrationId),
  ]
);

// ── scan sessions (entry check-in + meal service windows) ──────
// Admins configure which scans an event uses (entry, breakfast, lunch,
// dinner — per event day), then open/close each window live on event day.
// A ticket can be scanned AT MOST ONCE per session (enforced by unique index).
export const scanSessions = pgTable(
  "scan_sessions",
  {
    id: id(),
    eventId: text("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // checkin | breakfast | lunch | dinner
    dayKey: text("day_key").notNull().default("all"), // which event day this window belongs to
    label: text("label").notNull(), // e.g. "Saturday · Lunch"
    status: text("status").notNull().default("closed"), // open | closed
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("scan_sessions_unique_idx").on(t.eventId, t.kind, t.dayKey),
    index("scan_sessions_event_idx").on(t.eventId, t.status),
  ]
);

export const ticketScans = pgTable(
  "ticket_scans",
  {
    id: id(),
    sessionId: text("session_id")
      .notNull()
      .references(() => scanSessions.id, { onDelete: "cascade" }),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
    scannedBy: text("scanned_by"),
  },
  (t) => [
    uniqueIndex("ticket_scans_once_idx").on(t.sessionId, t.ticketId), // one scan per window
    index("ticket_scans_ticket_idx").on(t.ticketId),
  ]
);

// ── magazines (yearly publication PDFs) ────────────────────────
export const magazines = pgTable(
  "magazines",
  {
    id: id(),
    year: integer("year").notNull(),
    title: text("title").notNull(), // e.g. "Pragati Patrika · Vol. XIII"
    fileUrl: text("file_url").notNull(), // Vercel Blob URL (or /magazines/*.pdf in local dev)
    coverUrl: text("cover_url"), // page-1 thumbnail, rendered in the browser at upload
    bytes: integer("bytes").notNull().default(0),
    uploadedBy: text("uploaded_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("magazines_year_idx").on(t.year)]
);

// ── donations ──────────────────────────────────────────────────
export const donations = pgTable(
  "donations",
  {
    id: id(),
    confirmationNumber: text("confirmation_number").notNull(), // DON-YYYY-NNNN
    memberId: text("member_id").references(() => members.id),
    donorName: text("donor_name").notNull(),
    donorEmail: text("donor_email").notNull(),
    donorPhone: text("donor_phone"),
    amountCents: integer("amount_cents").notNull(),
    inHonorOrMemory: text("in_honor_or_memory").notNull().default("none"), // none | in_honor_of | in_memory_of
    designation: text("designation"), // pujo-mode earmark: bhog | dakshina | alpona | pushpanjali | where_needed
    honoreeName: text("honoree_name"),
    honoreeNotifyEmail: text("honoree_notify_email"),
    message: text("message"),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    paymentMethod: text("payment_method").notNull(),
    status: text("status").notNull().default("pending_payment"),
    squareOrderId: text("square_order_id"),
    squarePaymentId: text("square_payment_id"),
    // Square payment links never expire on their own. Keeping the link id lets the
    // sweeper DELETE the link when it gives up on a reservation, so an abandoned
    // checkout cannot be paid hours later against a cancelled order.
    squarePaymentLinkId: text("square_payment_link_id"),
    /**
     * Set when this gift was added during a ticket checkout rather than given on
     * its own. The registration owns the payment; this row exists so the gift is
     * visible on the Donations page and countable as a donation, which it always
     * was in substance and never was in the data.
     *
     * The money still lives in ONE place — the `payments` row keyed to the
     * registration — so linked rows must never be summed as extra income.
     */
    sourceRegistrationId: text("source_registration_id"),
    zelleVerifiedBy: text("zelle_verified_by"),
    zelleVerifiedAt: timestamp("zelle_verified_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("donations_conf_idx").on(t.confirmationNumber),
    index("donations_status_idx").on(t.status),
    index("donations_source_reg_idx").on(t.sourceRegistrationId),
  ]
);

// ── payments (the money ledger) ─────────────────────────────────
/**
 * ONE ROW PER MOVEMENT OF MONEY. This is the single source of truth for
 * "what did we collect", replacing the old arrangement where payment state was
 * duplicated across registrations.status / donations.status /
 * members.membership_status with three different vocabularies — and where
 * membership dues paid by card were recorded nowhere at all.
 *
 * The owning tables keep their own status columns (they drive the ticketing and
 * membership *lifecycles*), but every financial question — totals, what's
 * outstanding, what was refunded — is answered from here.
 *
 * A single checkout can produce SEVERAL rows sharing a `groupId`: buying tickets
 * with an added donation and membership dues writes three rows (registration /
 * donation / membership), so each revenue stream sums cleanly on its own.
 * `amountCents` is the org's revenue for that component; `feeCents` is the card
 * surcharge collected on top and is deliberately NOT part of amountCents.
 */
export const payments = pgTable(
  "payments",
  {
    id: id(),
    kind: text("kind").notNull(), // registration | donation | membership
    entityId: text("entity_id").notNull(), // registrations.id | donations.id | members.id
    groupId: text("group_id"), // ties components of one checkout together
    memberId: text("member_id"), // denormalised so member revenue is queryable
    payerName: text("payer_name").notNull(),
    payerEmail: text("payer_email").notNull(),
    amountCents: integer("amount_cents").notNull(), // org revenue for this component
    feeCents: integer("fee_cents").notNull().default(0), // card surcharge collected on top
    method: text("method").notNull(), // square | zelle | offline | comped
    status: text("status").notNull().default("pending"),
    // pending | pending_verification | paid | cancelled | refunded
    squareOrderId: text("square_order_id"),
    squarePaymentId: text("square_payment_id"),
    // Stamped whenever Square itself confirmed this row (webhook read-back or the
    // reconciler), together with the amount Square says it took. A paid row with
    // no square_verified_at is money we have only our own word for.
    squareVerifiedAt: timestamp("square_verified_at", { withTimezone: true }),
    squareAmountCents: integer("square_amount_cents"),
    reference: text("reference"), // Zelle memo, cheque no., confirmation number
    verifiedBy: text("verified_by").references(() => users.id), // admin who confirmed a manual payment
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    // app = written by a live payment flow · backfill = reconstructed by
    // scripts/backfill-payments.ts (amount may be inferred, not observed)
    source: text("source").notNull().default("app"),
    note: text("note"),
    // ── walk-in desk tenders (source = 'desk'). A tender IS a payments row:
    //    the ledger stays the single source of truth for money. These say who
    //    physically took it, which drawer it belongs to, and — the whole point
    //    — WHERE THE MONEY IS NOW, which is a different question from whether
    //    the guest has settled. See lib/desk/constants.ts.
    tenderSeq: integer("tender_seq"), // 1, 2, 3… within one order (split tender)
    shiftId: text("shift_id"),
    collectedBy: text("collected_by"), // distinct from verified_by
    custody: text("custody"), // org_account | in_drawer | undeposited_check | held_by_person | n_a
    custodyClearedAt: timestamp("custody_cleared_at", { withTimezone: true }),
    custodyClearedBy: text("custody_cleared_by"),
    depositRef: text("deposit_ref"),
    instrument: jsonb("instrument"), // cheque number, Zelle recipient, Square link…
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversalReason: text("reversal_reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("payments_entity_idx").on(t.kind, t.entityId),
    index("payments_status_idx").on(t.status),
    index("payments_group_idx").on(t.groupId),
    index("payments_member_idx").on(t.memberId),
  ]
);

// ── data migrations (one-time backfills) ───────────────────────
/**
 * Bookkeeping for one-time data fixes that must run exactly once against a
 * database — the data equivalent of the lazy schema "ensures". A job claims its
 * row by inserting it; because `key` is the primary key, only one server
 * instance can win that race, so concurrent cold starts can't double-run a
 * backfill. Completed rows are never removed: their presence is what stops the
 * job running again on the next deploy.
 */
export const dataMigrations = pgTable("data_migrations", {
  key: text("key").primaryKey(),
  status: text("status").notNull().default("running"), // running | done | failed
  detail: text("detail"), // human-readable result, or the error if it failed
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

// ── sponsors / team ────────────────────────────────────────────
export const sponsors = pgTable("sponsors", {
  id: id(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  websiteUrl: text("website_url"),
  tier: text("tier").notNull().default("community"), // platinum | gold | silver | community
  displayOrder: integer("display_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const teamMembers = pgTable("team_members", {
  id: id(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  group: text("group").notNull().default("executive"), // executive | trustee | advisor
  photoUrl: text("photo_url"),
  email: text("email"),
  displayOrder: integer("display_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  year: integer("year"),
  createdAt: createdAt(),
});

// ── ops tables ─────────────────────────────────────────────────
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    userId: text("user_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    changes: jsonb("changes"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_user_idx").on(t.userId, t.createdAt),
    index("audit_entity_idx").on(t.entityType, t.entityId),
  ]
);

export const emailLog = pgTable(
  "email_log",
  {
    id: id(),
    toEmail: text("to_email").notNull(),
    originalToEmail: text("original_to_email"), // pre-override recipient in test mode
    template: text("template").notNull(),
    subject: text("subject").notNull(),
    bodyText: text("body_text"),
    status: text("status").notNull().default("queued"), // queued | sent | failed
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    relatedUserId: text("related_user_id"),
    relatedRegistrationId: text("related_registration_id"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("email_to_idx").on(t.toEmail, t.sentAt)]
);

// ── email outbox (priority queue — see src/lib/email/outbox.ts) ─
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: id(),
    priority: integer("priority").notNull().default(2), // 1 critical · 2 normal · 3 digestable
    digestKey: text("digest_key"), // alerts sharing a key get combined into one email
    payload: jsonb("payload").notNull(), // the Mail object
    status: text("status").notNull().default("queued"), // queued | sent | failed
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("email_outbox_drain_idx").on(t.status, t.nextAttemptAt, t.priority)]
);

export const systemConfig = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: jsonb("value"),
  updatedAt: updatedAt(),
  updatedBy: text("updated_by"),
});

/**
 * Webhook de-duplication — and, just as importantly, webhook RETRYABILITY.
 *
 * A row is claimed BEFORE the work runs and only flipped to `done` once the work
 * has actually succeeded. Previously the row was written first and never
 * revisited, so a delivery that crashed half-way was remembered as "already
 * handled" and Square's retry was answered with a cheerful 200 — the payment was
 * then lost with no trace anywhere. `status` + `attempts` + `last_error` make a
 * stuck event visible instead.
 */
export const processedWebhookEvents = pgTable("processed_webhook_events", {
  eventId: text("event_id").primaryKey(),
  provider: text("provider").notNull().default("square"),
  status: text("status").notNull().default("done"), // processing | done | failed
  attempts: integer("attempts").notNull().default(1),
  eventType: text("event_type"),
  squarePaymentId: text("square_payment_id"),
  lastError: text("last_error"),
  payload: jsonb("payload"), // kept so a failed delivery can be replayed by hand
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── reconciliation (Square audits our books) ───────────────────
export const reconciliationRuns = pgTable("reconciliation_runs", {
  id: id(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  windowDays: integer("window_days").notNull().default(7),
  autoSettle: boolean("auto_settle").notNull().default(false),
  squarePayments: integer("square_payments").notNull().default(0),
  falseNegatives: integer("false_negatives").notNull().default(0),
  falsePositives: integer("false_positives").notNull().default(0),
  amountMismatches: integer("amount_mismatches").notNull().default(0),
  orphans: integer("orphans").notNull().default(0),
  repaired: integer("repaired").notNull().default(0),
  status: text("status").notNull().default("ok"), // ok | error
  error: text("error"),
});

export const reconciliationFindings = pgTable(
  "reconciliation_findings",
  {
    id: id(),
    runId: text("run_id"),
    kind: text("kind").notNull(), // false_negative | false_positive | amount_mismatch | orphan
    severity: text("severity").notNull().default("warning"), // warning | critical
    reference: text("reference"), // our confirmation number
    entityKind: text("entity_kind"),
    entityId: text("entity_id"),
    squarePaymentId: text("square_payment_id"),
    squareOrderId: text("square_order_id"),
    squareAmountCents: integer("square_amount_cents"),
    ledgerAmountCents: integer("ledger_amount_cents"),
    detail: text("detail"),
    /**
     * open | approved | dismissed.
     * Nothing in this table is ever acted on automatically. A finding is a
     * QUESTION put to a person — "Square and our books disagree here" — and it
     * stays open until an admin approves the correction or dismisses it, with
     * their name and reason recorded either way.
     */
    status: text("status").notNull().default("open"),
    resolutionNote: text("resolution_note"),
    /** Stops the nightly scan re-raising the same open question every night. */
    dedupeKey: text("dedupe_key"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: text("resolved_by"),
    createdAt: createdAt(),
  },
  (t) => [index("recon_findings_open_idx").on(t.status, t.createdAt)]
);

// ── media library (admin-uploaded photos) ──────────────────────
export const mediaImages = pgTable(
  "media_images",
  {
    id: id(),
    fileBase: text("file_base").notNull(), // e.g. "a1b2c3" → a1b2c3-480.webp / -1024 / -1920
    width: integer("width").notNull(), // original dims (after EXIF rotation)
    height: integer("height").notNull(),
    variants: jsonb("variants").notNull(), // widths actually generated, e.g. [480,1024,1920]
    blurDataUrl: text("blur_data_url").notNull(), // tiny inline placeholder
    bytes: integer("bytes").notNull(),
    originalName: text("original_name"),
    inCarousel: boolean("in_carousel").notNull().default(false), // "by the numbers" photo garland
    inSlideshow: boolean("in_slideshow").notNull().default(false), // mission/community panel
    inPoster: boolean("in_poster").notNull().default(false), // homepage two-panel poster slideshow
    eventSlug: text("event_slug"), // featured image on that event's page
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("media_base_idx").on(t.fileBase)]
);

// ── contact messages ────────────────────────────────────────────
export const contactMessages = pgTable("contact_messages", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  topic: text("topic").notNull().default("general"),
  message: text("message").notNull(),
  handledAt: timestamp("handled_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ── password reset / invite tokens ─────────────────────────────
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(), // sha256 of the emailed token
    purpose: text("purpose").notNull().default("reset"), // reset | invite
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("prt_hash_idx").on(t.tokenHash), index("prt_user_idx").on(t.userId)]
);

// ── counters for confirmation numbers ──────────────────────────
export const counters = pgTable("counters", {
  key: text("key").primaryKey(), // e.g. 'PRG-2026', 'DON-2026'
  value: integer("value").notNull().default(0),
});

// ── walk-in desk ───────────────────────────────────────────────
/**
 * The desk is its own module (routes under /admin/desk, logic in lib/desk),
 * but its orders ARE registrations and its passes ARE tickets — that is what
 * lets the scan desk, the kitchen counts, the gate sheet and the Payments log
 * keep working on day one with no new plumbing. These four tables hold the
 * things a till needs that a web checkout never did.
 */
export const deskShifts = pgTable(
  "desk_shifts",
  {
    id: id(),
    eventId: text("event_id").notNull(),
    dayKey: text("day_key").notNull().default("all"),
    station: text("station").notNull().default("desk-1"),
    status: text("status").notNull().default("open"), // open | closed
    openedBy: text("opened_by").notNull(),
    openedByEmail: text("opened_by_email"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    openingFloatCents: integer("opening_float_cents").notNull().default(0),
    dropsCents: integer("drops_cents").notNull().default(0), // cash handed to the treasurer mid-shift
    closedBy: text("closed_by"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    countedCashCents: integer("counted_cash_cents"),
    expectedCashCents: integer("expected_cash_cents"),
    varianceCents: integer("variance_cents"),
    varianceNote: text("variance_note"),
    note: text("note"),
  },
  (t) => [index("desk_shifts_event_idx").on(t.eventId, t.status)]
);

/** Every cent NOT collected, and why. `amountCents` is always the amount taken
 *  OFF what the guest owes, so a surcharge is stored negative. */
export const deskAdjustments = pgTable(
  "desk_adjustments",
  {
    id: id(),
    registrationId: text("registration_id").notNull(),
    kind: text("kind").notNull(), // comp | discount | writeoff | surcharge
    amountCents: integer("amount_cents").notNull(),
    reasonCode: text("reason_code").notNull(),
    note: text("note"),
    requestedBy: text("requested_by"),
    approvedBy: text("approved_by").notNull(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: text("voided_by"),
    createdAt: createdAt(),
  },
  (t) => [index("desk_adjustments_reg_idx").on(t.registrationId)]
);

/** Typed gaps and chases. Incomplete information is a STATE here, never an
 *  error and never a placeholder written into a real field. */
export const deskFollowups = pgTable(
  "desk_followups",
  {
    id: id(),
    registrationId: text("registration_id"),
    paymentId: text("payment_id"),
    kind: text("kind").notNull(),
    detail: text("detail"),
    status: text("status").notNull().default("open"), // open | resolved | waived
    dedupeKey: text("dedupe_key"),
    assignedTo: text("assigned_to"),
    createdBy: text("created_by"),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolutionNote: text("resolution_note"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("desk_followups_status_idx").on(t.status, t.kind),
    index("desk_followups_reg_idx").on(t.registrationId),
  ]
);

/** Append-only per-order timeline: what the volunteer sees, and what an audit
 *  reads. Money-affecting actions ALSO write to audit_log. */
export const deskOrderEvents = pgTable(
  "desk_order_events",
  {
    id: id(),
    registrationId: text("registration_id").notNull(),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    actorUserId: text("actor_user_id"),
    actorEmail: text("actor_email"),
    shiftId: text("shift_id"),
    payload: jsonb("payload"),
    createdAt: createdAt(),
  },
  (t) => [index("desk_order_events_reg_idx").on(t.registrationId, t.createdAt)]
);
