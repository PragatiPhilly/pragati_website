# Data Model

This is the Postgres schema. Tables, columns, relationships, indexes, and the reasoning for each choice.

## Conventions

- All tables have `id` (UUID, primary key), `created_at`, `updated_at` (timestamps).
- Soft-delete via `deleted_at` (nullable timestamp) on tables where deletion needs to be reversible.
- Money stored as **integer cents** (not floats). `$35.00` = `3500`.
- Timestamps in UTC. Display tier converts to user's timezone.
- All foreign keys have `ON DELETE` rules specified explicitly.
- All user-facing IDs in URLs use short readable slugs, not UUIDs (e.g., `/events/durga-pujo-2026`).

## Tables

### `users`

The login identity. One row per login.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| email | citext | unique, indexed, case-insensitive |
| password_hash | text | bcrypt, never returned in API |
| email_verified_at | timestamptz | null until verified |
| role | text | enum: 'member', 'admin', 'super_admin' |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| last_login_at | timestamptz | |
| deleted_at | timestamptz | soft delete |

Index: `(email)` unique, `(role)`.

### `members`

The member family record. 1:1 with `users` where role='member'.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users.id, unique |
| family_name | text | e.g. "Kundu family" |
| primary_first_name | text | account-holder's first name |
| primary_last_name | text | account-holder's last name |
| phone | text | E.164 format |
| address_line1 | text | |
| address_line2 | text | |
| city | text | |
| state | text | |
| zip | text | |
| country | text | default 'US' |
| membership_status | text | enum: 'pending_payment', 'active', 'inactive' |
| membership_started_at | date | when they first paid dues |
| notes | text | admin-only notes |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| deleted_at | timestamptz | |

Index: `(membership_status)`, `(family_name, primary_last_name)`.

**Changes from earlier draft (v1 scope reduction):**
- Removed `in_directory` (no member directory in v1)
- Removed `membership_expires_at` and `expired` / `lapsed` / `lifetime` statuses (admin manages annually offline)
- Simplified status enum to just `pending_payment / active / inactive`

### `family_members`

Spouse, children, dependent adults attached to a member family.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| member_id | UUID | FK → members.id, cascade on delete |
| first_name | text | |
| last_name | text | |
| relationship | text | enum: 'spouse', 'child', 'dependent_adult' |
| date_of_birth | date | for age-based ticket pricing; adult = 18+ on event date |
| is_member | boolean | for adults: whether this adult individually gets the member discount under Mode A. Ignored for children (kids always get member pricing on paid family). Ignored under Mode B (all adults get member pricing). |
| food_pref | text | enum: 'veg', 'non_veg', 'kid' — kept simple per committee decision |
| dietary_notes | text | freeform (allergies, restrictions, etc.) |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Index: `(member_id)`.

**Changes from earlier draft:**
- Added `is_member` boolean for per-adult member flagging (Mode A)
- Simplified `food_pref` to just `veg` / `non_veg` / `kid` — removed jain, vegan, and structured allergies (committee decision)
- Removed `allergies` array — folded into `dietary_notes` freeform field

### `events`

A Pragati event — Durga Pujo, Kali Pujo, Saraswati Pujo, summer picnic, etc.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| slug | text | unique, URL-safe (e.g. 'durga-pujo-2026') |
| name | text | display name |
| name_bengali | text | optional Bengali display name |
| theme | text | enum: 'durga', 'kali', 'saraswati', 'none' — drives site theme when this event is active |
| description | text | markdown |
| starts_at | timestamptz | event start |
| ends_at | timestamptz | event end |
| venue_name | text | |
| venue_address | text | |
| venue_map_url | text | optional Google Maps link |
| poster_image_id | UUID | FK → images.id |
| status | text | enum: 'draft', 'published', 'cancelled', 'archived' |
| publish_at | timestamptz | scheduled publish time |
| is_member_only | boolean | restrict registration to active members |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| created_by | UUID | FK → users.id |

Index: `(status, publish_at)`, `(slug)` unique.

### `ticket_types`

Per-event ticket configuration. An event has many ticket types.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| event_id | UUID | FK → events.id, cascade |
| name | text | e.g. "3-day pass with food" |
| description | text | |
| pricing_model | text | enum: 'per_person', 'per_family' |
| price_member_cents | integer | in cents, member price |
| price_nonmember_cents | integer | in cents, non-member price; -1 = not available to non-members |
| age_band | text | enum: 'adult', 'child_5_12', 'child_under_5', 'senior', 'all' |
| capacity | integer | total available; null = unlimited |
| sold_count | integer | derived; cached for fast availability checks |
| requires_food_selection | boolean | |
| sale_starts_at | timestamptz | when it goes on sale |
| sale_ends_at | timestamptz | when it stops being sold |
| display_order | integer | for sorting on the page |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Index: `(event_id, display_order)`.

### `promo_codes`

Discount codes.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| event_id | UUID | FK → events.id, cascade; null = applies to any event |
| code | text | uppercase unique within event |
| discount_type | text | enum: 'percent', 'fixed_amount_cents' |
| discount_value | integer | e.g. 10 for 10%, or 500 for $5 |
| applies_to_ticket_type_ids | UUID[] | empty = applies to all ticket types in the event |
| max_uses_total | integer | null = unlimited |
| max_uses_per_member | integer | default 1 |
| current_uses | integer | derived count |
| valid_from | timestamptz | |
| valid_until | timestamptz | |
| created_at | timestamptz | |
| created_by | UUID | FK → users.id |

Index: `(event_id, code)` unique.

### `registrations`

A registration is one purchase by one member or guest. May contain multiple tickets (mixed types per family member).

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| confirmation_number | text | unique, format `PRG-YYYY-NNNN` — shown to buyer, used for lookup |
| event_id | UUID | FK → events.id |
| member_id | UUID | FK → members.id, **nullable** (guests register without login) |
| buyer_email | text | required — receipt + lookup key |
| buyer_name | text | required |
| buyer_phone | text | required |
| is_member_purchase | boolean | snapshot of whether buyer was a member at time of purchase (affects pricing) |
| subtotal_cents | integer | before discount |
| discount_cents | integer | promo code amount |
| total_cents | integer | what they paid |
| promo_code_id | UUID | FK → promo_codes.id, nullable |
| payment_method | text | enum: 'square', 'zelle', 'offline' |
| status | text | enum: 'pending_payment', 'pending_zelle_verification', 'paid', 'cancelled', 'cancelled_no_payment' |
| square_order_id | text | nullable — set when payment_method='square' |
| square_payment_id | text | nullable — used for lookup/reconciliation |
| zelle_verified_by | UUID | FK → users.id, nullable — admin who confirmed Zelle deposit |
| zelle_verified_at | timestamptz | when the admin marked it paid |
| created_at | timestamptz | |
| paid_at | timestamptz | |
| cancelled_at | timestamptz | |
| reservation_expires_at | timestamptz | 15 min for Square, 48 hours for Zelle after "I've sent it" click |
| notes | text | admin notes |

Index: `(event_id, status)`, `(member_id)`, `(square_payment_id)`, `(confirmation_number)` unique, `(buyer_email, confirmation_number)` for guest lookup.

**Changes from earlier draft:**
- Added `confirmation_number` (unique, human-readable, used for guest lookup)
- Added `payment_method` (square / zelle / offline)
- Added Square fields (replacing Stripe)
- Added Zelle verification fields
- Added `pending_zelle_verification` and `cancelled_no_payment` statuses
- Removed `refunded`, `partially_refunded` statuses (no refunds in v1)
- Removed Stripe columns
- `member_id` explicitly nullable for guest purchases

### `tickets`

Individual tickets within a registration. One row per attendee (or per family for per-family model).

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| registration_id | UUID | FK → registrations.id, cascade |
| ticket_type_id | UUID | FK → ticket_types.id |
| attendee_first_name | text | |
| attendee_last_name | text | |
| attendee_age | integer | derived from family_member at purchase time, frozen |
| attendee_is_member | boolean | snapshot — whether this attendee was flagged as a member at purchase time (drives pricing at time of sale) |
| food_pref | text | enum snapshot: 'veg' / 'non_veg' / 'kid' |
| dietary_notes | text | freeform snapshot |
| qr_code | text | unique, used at door |
| checked_in_at | timestamptz | nullable |
| checked_in_by | UUID | FK → users.id |
| created_at | timestamptz | |

Index: `(qr_code)` unique, `(registration_id)`, `(ticket_type_id, checked_in_at)`.

### `images`

Uploaded images (event posters, sponsor logos, gallery photos).

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| filename | text | original |
| mime_type | text | |
| size_bytes | bigint | |
| width | integer | |
| height | integer | |
| storage_key | text | R2/S3 key |
| public_url | text | CDN URL |
| variants | jsonb | { thumb: url, medium: url, large: url, original: url } |
| uploaded_by | UUID | FK → users.id |
| created_at | timestamptz | |
| purpose | text | enum: 'event_poster', 'sponsor_logo', 'gallery', 'team_photo', 'magazine_cover', 'other' |
| metadata | jsonb | freeform tags |

### `sponsors`

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | text | |
| logo_image_id | UUID | FK → images.id |
| website_url | text | |
| tier | text | enum: 'platinum', 'gold', 'silver', 'community' |
| display_order | integer | |
| active | boolean | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `team_members`

Executive committee + trustees.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | text | |
| role | text | e.g. 'President', 'Treasurer' |
| group | text | enum: 'executive', 'trustee', 'advisor' |
| photo_image_id | UUID | FK → images.id, nullable |
| email | text | optional, for "contact" links |
| display_order | integer | |
| active | boolean | |
| year | integer | which year's committee (executive turns over annually) |
| created_at | timestamptz | |

### `audit_log`

Every admin action.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| user_id | UUID | FK → users.id; who did it |
| action | text | enum: 'create', 'update', 'delete', 'login', 'export', 'refund', etc. |
| entity_type | text | which table (e.g. 'members', 'events') |
| entity_id | UUID | the record affected |
| changes | jsonb | before/after diff |
| ip_address | inet | |
| user_agent | text | |
| created_at | timestamptz | |

Index: `(user_id, created_at)`, `(entity_type, entity_id)`, `(created_at)`.

### `email_log`

Every email sent.

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| to_email | text | |
| template | text | enum: 'welcome', 'receipt', 'ticket', 'admin_alert', 'password_reset', etc. |
| subject | text | |
| body_text | text | rendered text version |
| sent_at | timestamptz | |
| status | text | enum: 'queued', 'sent', 'failed', 'bounced' |
| provider_message_id | text | Resend message ID |
| error | text | if failed |
| related_user_id | UUID | nullable |
| related_registration_id | UUID | nullable |

Index: `(to_email, sent_at)`, `(status, sent_at)`.

### `system_config`

Global settings only super-admins can change.

| Column | Type | Notes |
|---|---|---|
| key | text | PK |
| value | jsonb | |
| updated_at | timestamptz | |
| updated_by | UUID | |

Example keys and their launch values:

| Key | Type | Launch value | Purpose |
|---|---|---|---|
| `membership_annual_price_cents` | integer | `3500` | $35/family/year |
| `member_discount_percent` | integer | `30` | Percent off ticket price for members |
| `member_discount_mode` | text | `per_adult` | Enum: `per_adult` (uses family_members.is_member) or `whole_family` (all adults on paid family) |
| `active_event_id` | UUID | (set when active) | Which event's theme drives the site |
| `org_name` | text | `Pragati — Bengali Association of Greater Philadelphia` | Display in footers, receipts |
| `org_address` | text | `127 Lotus Lane, Malvern, PA 19355` | Display in receipts, footers |
| `contact_email` | text | `pragati.management@gmail.com` | Public contact address |
| `zelle_recipient_email` | text | `pragati.management@gmail.com` | Displayed on Zelle instruction pages |
| `zelle_recipient_display_name` | text | `Pragati` | What buyers should see in their Zelle app |
| `zelle_verification_sla_hours` | integer | `24` | What we promise buyers ("within 24 hours") |
| `square_location_id` | text | (from Square) | Which Pragati Square location receives payments |
| `square_account_status` | text | (auto) | 'sandbox' or 'live' — safety check |
| `system_email_from` | text | `pragati.management@gmail.com` | See sending-email note below |
| `system_email_reply_to` | text | `pragati.management@gmail.com` | |
| `treasurer_notification_email` | text | `pragati.management@gmail.com` | Where admin alerts go |
| `refund_cutoff_days` | integer | `0` (no cutoff) | Zero means refund window has no cutoff; requests accepted anytime |
| `magazine_purchase_note` | text | `Magazines are sold at the Pujo event counter — not available online.` | Public message on /magazine |

**Deferred keys (not needed in v1):** `membership_cycle_start_month`, `default_refund_policy_days` (folded into refund_cutoff_days), `stripe_account_status`, `donor_recognition_tiers`.

### ⚠️ Sending email deliverability note

Setting `system_email_from` to `pragati.management@gmail.com` is what the committee requested and what we'll ship with. **Deliverability degrades sharply when Gmail sees > 50 outbound transactional emails per day** from a personal Gmail account. Around Durga Pujo we'll send 400+ ticket emails plus admin alerts in bursts.

Mitigations in code:
- Send in batches with 5-second delay between batches
- Retry on soft-bounce with exponential backoff
- Alert admins if bounce rate > 5% during a batch

Recommended for v1.5 (before Durga Pujo public launch): purchase `pragatiphilly.org` domain, add DKIM + SPF + DMARC records via Resend, switch `system_email_from` to `noreply@pragatiphilly.org`. Keep `pragati.management@gmail.com` as `reply_to`. This is a config change only, no code change.

### `donations`

Standalone donations to Pragati (separate from membership dues and event tickets).

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| confirmation_number | text | unique, format `DON-YYYY-NNNN` — distinguishes from ticket confirmations in bank feed |
| member_id | UUID | FK → members.id, nullable (guests can donate) |
| donor_name | text | required — as they want it displayed on receipt |
| donor_email | text | required — receipt goes here |
| donor_phone | text | optional |
| amount_cents | integer | donation amount |
| in_honor_or_memory | text | enum: 'none', 'in_honor_of', 'in_memory_of' |
| honoree_name | text | e.g. "Prof. Debesh Chatterjee" |
| honoree_notify_email | text | optional — if set, an email is sent to this person informing them of the donation |
| message | text | optional freeform message from donor to Pragati |
| is_anonymous | boolean | if true, name is hidden from any public/private donor lists (name still stored for treasurer / tax purposes) |
| payment_method | text | enum: 'square', 'zelle', 'offline' |
| status | text | enum: 'pending_payment', 'pending_zelle_verification', 'paid', 'cancelled', 'cancelled_no_payment' |
| square_order_id | text | nullable |
| square_payment_id | text | nullable |
| zelle_verified_by | UUID | FK → users.id, nullable |
| zelle_verified_at | timestamptz | nullable |
| created_at | timestamptz | |
| paid_at | timestamptz | |
| cancelled_at | timestamptz | |
| reservation_expires_at | timestamptz | |
| notes | text | admin notes |

Index: `(status)`, `(donor_email)`, `(confirmation_number)` unique, `(member_id)`, `(square_payment_id)`.

### `magazines`

| Column | Type | Notes |
|---|---|---|
| id | UUID | PK |
| year | integer | unique |
| volume | text | e.g. "Vol. XIII" |
| title | text | |
| cover_image_id | UUID | FK → images.id |
| pdf_url | text | direct R2 URL |
| pdf_size_bytes | bigint | |
| published_at | date | |
| created_at | timestamptz | |

## Relationships diagram (text)

```
users (1) ─── (1) members
                  │
                  ├──── (many) family_members
                  ├──── (many) registrations     (also created by guests, member_id nullable)
                  │             │
                  │             └──── (many) tickets
                  └──── (many) donations         (also created by guests, member_id nullable)

events ──── (many) ticket_types ──── (many) tickets
       └──── (many) promo_codes
       └──── (many) registrations
       └──── (1) images (poster)

images used by: events, sponsors, team_members, magazines

users (admin) ──── (many) audit_log
```

## Important constraints / business rules enforced in DB

1. **One member per email** — `users.email` is unique.
2. **One member account per family** — `members.user_id` is unique.
3. **Promo code uniqueness** — `(event_id, code)` unique per event.
4. **QR code uniqueness** — `tickets.qr_code` globally unique to prevent ticket duplication.
5. **Capacity tracking** — `ticket_types.sold_count` updated via trigger when registration becomes 'paid' or 'refunded', so we can fast-check availability without summing tickets.
6. **Soft delete propagation** — soft-deleting a member doesn't delete their family_members or registrations (we need them for accounting/audit) but they become inaccessible via normal queries.

## What I'm NOT doing

- No separate `addresses` table — addresses are small enough to live denormalized on members.
- No separate `phone_numbers` table — one phone per member is enough.
- No `tags` table for members. Admin notes field is good enough.
- No event-day seating chart / seat assignments. Out of scope for v1.

## Migrations strategy

Use a real migration tool (e.g., `node-pg-migrate`, Supabase migrations, or Prisma migrate). Every schema change is a versioned migration in git. Never edit production schema by hand. Always test migrations on a staging copy of production before applying.
