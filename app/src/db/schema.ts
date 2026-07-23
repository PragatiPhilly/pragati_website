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
    membershipExpiresAt: timestamp("membership_expires_at", { withTimezone: true }), // active membership valid until
    memberNumber: text("member_number"), // friendly member ID shown to the member
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
    membershipSignup: boolean("membership_signup").notNull().default(false), // buyer opted to become a member during this registration
    promoCodeId: text("promo_code_id").references(() => promoCodes.id),
    paymentMethod: text("payment_method").notNull(), // square | zelle | offline
    status: text("status").notNull().default("pending_payment"),
    // pending_payment | pending_zelle_verification | paid | cancelled | cancelled_no_payment
    squareOrderId: text("square_order_id"),
    squarePaymentId: text("square_payment_id"),
    zelleVerifiedBy: text("zelle_verified_by"),
    zelleVerifiedAt: timestamp("zelle_verified_at", { withTimezone: true }),
    zelleSentClickedAt: timestamp("zelle_sent_clicked_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true }),
    notes: text("notes"),
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
    dayKey: text("day_key").default("all"), // which event day this ticket covers ('all' = full pass)
    priceCents: integer("price_cents").notNull().default(0),
    qrCode: text("qr_code").notNull(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    checkedInBy: text("checked_in_by"),
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
    honoreeName: text("honoree_name"),
    honoreeNotifyEmail: text("honoree_notify_email"),
    message: text("message"),
    isAnonymous: boolean("is_anonymous").notNull().default(false),
    paymentMethod: text("payment_method").notNull(),
    status: text("status").notNull().default("pending_payment"),
    squareOrderId: text("square_order_id"),
    squarePaymentId: text("square_payment_id"),
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
  ]
);

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

export const processedWebhookEvents = pgTable("processed_webhook_events", {
  eventId: text("event_id").primaryKey(),
  provider: text("provider").notNull().default("square"),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

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
