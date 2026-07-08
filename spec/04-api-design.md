# API Design

Every endpoint in the application. REST-style with Next.js API routes (or React Server Actions where appropriate).

## Conventions

- All routes under `/api/`
- JSON request/response bodies
- Auth via session cookie (set by Supabase Auth)
- Role check in middleware (`withAuth({ role: 'admin' })`)
- Standard error shape:
  ```json
  { "error": "human-readable message", "code": "machine_code", "details": { ... } }
  ```
- HTTP status codes used correctly: 200 ok, 201 created, 400 bad request, 401 unauth, 403 forbidden, 404 not found, 409 conflict, 429 rate limit, 500 server error
- All write endpoints require CSRF protection (Next.js handles this automatically with the cookie strategy + same-site policy)

## Public endpoints (no auth)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/events` | List published events |
| `GET` | `/api/events/:slug` | Get one event with ticket types |
| `GET` | `/api/sponsors` | List active sponsors |
| `GET` | `/api/team` | List active team members |
| `GET` | `/api/magazines` | List published magazines |
| `GET` | `/api/site-config` | Active theme, contact info |
| `POST` | `/api/contact` | Submit contact form (rate-limited, Turnstile-protected) |
| `POST` | `/api/auth/signup` | Start member signup |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/logout` | Logout |
| `POST` | `/api/auth/forgot-password` | Request reset link |
| `POST` | `/api/auth/reset-password` | Set new password from reset link |
| `POST` | `/api/auth/verify-email` | Verify email from link |
| `POST` | `/api/square-webhook` | Square events (signature-verified, no session) |
| `POST` | `/api/checkout/membership` | Start membership checkout (Square OR Zelle path) |
| `POST` | `/api/checkout/event` | Start event ticket checkout (Square OR Zelle path) as member or guest |
| `POST` | `/api/checkout/donation` | Start donation checkout (Square OR Zelle path) as member or guest |
| `POST` | `/api/checkout/validate-promo` | Validate a promo code without checkout |
| `POST` | `/api/checkout/zelle/mark-sent` | Buyer clicks "I've sent Zelle" — moves reservation from 15-min to 48-hour window |
| `POST` | `/api/lookup` | Guest ticket lookup: `{ email, confirmationNumber }` → tickets |
| `GET` | `/api/lookup/:conf/tickets/:id/pdf` | Download ticket PDF (auth: confirmation number as ownership proof, signed URL) |

## Member endpoints (role: member)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/me` | Own profile (no expiry/renewal fields in v1) |
| `PATCH` | `/api/me` | Update own profile |
| `POST` | `/api/me/change-password` | Change own password |
| `POST` | `/api/me/change-email` | Request email change (with verification) |
| `DELETE` | `/api/me` | Soft-delete own account (30-day grace period) |
| `GET` | `/api/me/family` | List family members |
| `POST` | `/api/me/family` | Add family member |
| `PATCH` | `/api/me/family/:id` | Update family member |
| `DELETE` | `/api/me/family/:id` | Remove family member |
| `GET` | `/api/me/tickets` | List own registrations + tickets (upcoming events only) |
| `GET` | `/api/me/tickets/:id` | Get ticket detail with QR |
| `GET` | `/api/me/tickets/:id/pdf` | Download ticket PDF |
| `GET` | `/api/me/data-export` | Download all own data as JSON (CCPA/GDPR) |

**Removed from v1 (see [01-roles-and-scope.md](./01-roles-and-scope.md)):**
- ~~`POST /api/me/tickets/:id/refund-request`~~ — no refunds via website
- ~~`GET /api/me/payments`~~ — no payment history dashboard
- ~~`POST /api/me/renewal`~~ — no self-serve renewal
- ~~`GET /api/directory`~~ — no member directory
- ~~`PATCH /api/me/directory-preference`~~ — no opt-in toggle

## Admin endpoints (role: admin)

### Members
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/members` | List with search/filter/pagination |
| `POST` | `/api/admin/members` | Create member manually |
| `GET` | `/api/admin/members/:id` | Full detail |
| `PATCH` | `/api/admin/members/:id` | Edit |
| `POST` | `/api/admin/members/:id/mark-paid` | Mark dues as paid (offline) |
| `POST` | `/api/admin/members/:id/extend` | Extend membership expiry |
| `POST` | `/api/admin/members/:id/lapse` | Mark lapsed |
| `DELETE` | `/api/admin/members/:id` | Soft-delete |
| `GET` | `/api/admin/members/export` | CSV download |

### Events
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/events` | List all events incl. drafts |
| `POST` | `/api/admin/events` | Create event |
| `GET` | `/api/admin/events/:id` | Event detail |
| `PATCH` | `/api/admin/events/:id` | Edit |
| `DELETE` | `/api/admin/events/:id` | Archive (no hard delete) |
| `POST` | `/api/admin/events/:id/publish` | Publish (or schedule) |
| `POST` | `/api/admin/events/:id/unpublish` | Unpublish |
| `POST` | `/api/admin/events/:id/cancel` | Cancel event (triggers refunds) |
| `GET` | `/api/admin/events/:id/registrations` | List registrations |
| `GET` | `/api/admin/events/:id/registrations/export` | CSV |
| `POST` | `/api/admin/events/:id/email-attendees` | Send bulk email |
| `POST` | `/api/admin/events/:id/set-active-theme` | Make this event's theme the site-wide theme |

### Ticket types
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/events/:id/ticket-types` | Add ticket type |
| `PATCH` | `/api/admin/ticket-types/:id` | Edit |
| `DELETE` | `/api/admin/ticket-types/:id` | Delete (if no sales) |

### Promo codes
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/events/:id/promo-codes` | List |
| `POST` | `/api/admin/events/:id/promo-codes` | Create |
| `PATCH` | `/api/admin/promo-codes/:id` | Edit |
| `DELETE` | `/api/admin/promo-codes/:id` | Delete |

### Registrations
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/registrations/:id` | Detail |
| `POST` | `/api/admin/registrations/:id/cancel` | Cancel (no refund — offline) |
| `POST` | `/api/admin/registrations/:id/resend-tickets` | Re-email tickets |
| `POST` | `/api/admin/registrations/manual` | Create manually (offline / cash / check payment) |
| `POST` | `/api/admin/registrations/:id/mark-paid` | Mark a pending Zelle registration as paid after visual bank verification. Triggers tickets email. |
| `GET` | `/api/admin/registrations/pending-zelle` | Queue of pending Zelle registrations awaiting admin verification |

**Removed:** `POST /api/admin/registrations/:id/refund` — all refunds handled offline.

### Donations
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/donations` | List with search/filter/pagination |
| `GET` | `/api/admin/donations/:id` | Detail |
| `POST` | `/api/admin/donations/:id/mark-paid` | Same as registrations — Zelle verification |
| `POST` | `/api/admin/donations/:id/cancel` | Cancel |
| `POST` | `/api/admin/donations/:id/resend-receipt` | Re-email receipt |
| `POST` | `/api/admin/donations/manual` | Enter an offline donation (someone handed cash to treasurer) |
| `GET` | `/api/admin/donations/pending-zelle` | Queue |
| `GET` | `/api/admin/donations/export` | CSV for treasurer's 501(c)(3) reporting |

### Check-in
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/checkin/:qr` | Scan QR, mark ticket as checked in |
| `GET` | `/api/admin/checkin/event/:eventId/stats` | Real-time counts |
| `POST` | `/api/admin/tickets/:id/manual-checkin` | Without QR (forgot ticket) |

### Sponsors / Team / Magazine
| Method | Path | Purpose |
|---|---|---|
| `GET/POST` | `/api/admin/sponsors` | List / create |
| `PATCH/DELETE` | `/api/admin/sponsors/:id` | |
| `GET/POST` | `/api/admin/team` | List / create |
| `PATCH/DELETE` | `/api/admin/team/:id` | |
| `GET/POST` | `/api/admin/magazines` | List / create |
| `PATCH/DELETE` | `/api/admin/magazines/:id` | |

### Images
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/upload-image` | Upload (multipart). Resize, store, return URL+variants |
| `DELETE` | `/api/admin/images/:id` | Delete if not referenced |

### Site config
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/config` | All settings |
| `PATCH` | `/api/admin/config` | Update setting (some are super-admin only) |
| `POST` | `/api/admin/config/active-theme` | Switch active theme |

## Super-admin endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/super-admin/admins` | List admin users |
| `POST` | `/api/super-admin/admins` | Promote a user to admin |
| `DELETE` | `/api/super-admin/admins/:id` | Demote to member |
| `GET` | `/api/super-admin/audit-log` | Query audit log |
| `DELETE` | `/api/super-admin/members/:id/hard-delete` | Permanent delete |
| `POST` | `/api/super-admin/backup-now` | Trigger manual backup |
| `GET` | `/api/super-admin/system-config` | All system config |
| `PATCH` | `/api/super-admin/system-config` | Update (includes Stripe keys, etc.) |

## Notable request/response shapes

### `POST /api/auth/signup`
Request:
```json
{
  "email": "kundu@example.com",
  "password": "minimum-10-chars",
  "primaryFirstName": "Sayantan",
  "primaryLastName": "Kundu",
  "familyName": "Kundu",
  "phone": "+12155551234",
  "address": { "line1": "...", "city": "...", "state": "...", "zip": "..." },
  "paymentMethod": "square"
}
```
Response (201) if `paymentMethod` = 'square':
```json
{
  "paymentMethod": "square",
  "checkoutUrl": "https://squareup.com/pay/...",
  "memberId": "uuid",
  "confirmationNumber": "PRG-2026-0001"
}
```
Response (201) if `paymentMethod` = 'zelle':
```json
{
  "paymentMethod": "zelle",
  "memberId": "uuid",
  "confirmationNumber": "PRG-2026-0001",
  "zelle": {
    "recipientEmail": "treasurer@pragatiphilly.org",
    "recipientDisplayName": "Pragati",
    "amountCents": 3500,
    "memoRequired": "PRG-2026-0001",
    "reservationExpiresAt": "2026-11-04T18:15:00Z"
  }
}
```
The member is created in `pending_payment` (Square) or `pending_zelle_verification` (Zelle) status. Ticket / welcome email fires on successful payment webhook (Square) or admin verification (Zelle).

### `POST /api/checkout/event`
Request (mixed family tickets, member buyer):
```json
{
  "eventId": "uuid",
  "items": [
    { "ticketTypeId": "3day-full-food-uuid", "qty": 1, "attendee": { "familyMemberId": "sayantan-uuid" } },
    { "ticketTypeId": "saturday-only-uuid", "qty": 1, "attendee": { "familyMemberId": "anita-uuid" } },
    { "ticketTypeId": "child-3day-uuid", "qty": 1, "attendee": { "familyMemberId": "rohan-uuid" } },
    { "ticketTypeId": "sunday-only-uuid", "qty": 1, "attendee": { "name": "Grandma", "foodPref": "veg" } }
  ],
  "promoCode": "EARLYBIRD",
  "buyerEmail": "kundu@example.com",
  "buyerName": "Sayantan Kundu",
  "buyerPhone": "+12155551234",
  "paymentMethod": "square"
}
```
Response:
```json
{
  "paymentMethod": "square",
  "checkoutUrl": "https://squareup.com/pay/...",
  "registrationId": "uuid",
  "confirmationNumber": "PRG-2026-4821",
  "subtotalCents": 19000,
  "discountCents": 2000,
  "totalCents": 17000
}
```

### `POST /api/checkout/donation`
Request:
```json
{
  "amountCents": 10000,
  "donorEmail": "friend@example.com",
  "donorName": "Anjali Roy",
  "donorPhone": "+12155551234",
  "inHonorOrMemory": "in_memory_of",
  "honoreeName": "Prof. Debesh Chatterjee",
  "honoreeNotifyEmail": "family@example.com",
  "message": "In loving memory of our dear teacher.",
  "isAnonymous": false,
  "paymentMethod": "zelle"
}
```
Response (Zelle path):
```json
{
  "paymentMethod": "zelle",
  "donationId": "uuid",
  "confirmationNumber": "DON-2026-0132",
  "zelle": { "recipientEmail": "...", "amountCents": 10000, "memoRequired": "DON-2026-0132", "reservationExpiresAt": "..." }
}
```

### `POST /api/lookup`
Request:
```json
{ "email": "kundu@example.com", "confirmationNumber": "PRG-2026-4821" }
```
Response:
```json
{
  "confirmationNumber": "PRG-2026-4821",
  "buyerName": "Sayantan Kundu",
  "event": { "name": "Durga Puja 2026", "starts": "...", "venue": "..." },
  "tickets": [
    { "id": "uuid", "type": "3-day pass with food", "attendeeName": "Sayantan Kundu", "qrCode": "..." },
    { "id": "uuid", "type": "Saturday only", "attendeeName": "Anita Kundu", "qrCode": "..." }
  ],
  "status": "paid",
  "pdfUrl": "/api/lookup/PRG-2026-4821/tickets/all/pdf?sig=..."
}
```
Rate limit: 5 requests per email per hour (prevents enumeration).

### `POST /api/checkout/zelle/mark-sent`
Called when the buyer clicks "I've sent the Zelle payment" on the pending page.
Request: `{ "confirmationNumber": "PRG-2026-4821", "email": "kundu@example.com" }`
Effect: extends `reservation_expires_at` from now-plus-15-min to now-plus-48-hours, sends the acknowledgment email, adds a "Marked sent by buyer" line to the admin queue.

### `POST /api/square-webhook`
Square-signed JSON event. We handle:
- `payment.updated` (status COMPLETED) → mark registration/donation paid + issue tickets/receipt + send emails
- `payment.updated` (status FAILED) → mark cancelled, release capacity reservation

### `POST /api/admin/registrations/:id/mark-paid`
Admin visual-verified the Zelle deposit against bank feed. Effect: registration → `paid`, tickets generated, emails sent, audit log entry.
Request body: `{ "note": "verified in bank feed at 10:32am" }` (optional)

## Pagination

All list endpoints support:
```
?page=1&pageSize=50&sort=created_at&order=desc&q=searchterm
```
Response includes:
```json
{
  "items": [...],
  "page": 1,
  "pageSize": 50,
  "totalCount": 312,
  "totalPages": 7
}
```

Max `pageSize` = 100. For exports, use the dedicated `/export` endpoints (CSV streaming).

## Error codes (machine-readable)

```
auth/invalid_credentials
auth/email_taken
auth/email_not_verified
auth/rate_limited
auth/2fa_required
auth/2fa_invalid

validation/missing_field
validation/invalid_format

square/checkout_failed
square/webhook_signature_invalid
zelle/verification_pending
zelle/reservation_expired
lookup/not_found
lookup/rate_limited

capacity/sold_out
capacity/insufficient_for_request

promo/not_found
promo/expired
promo/max_uses_reached
promo/not_applicable

permission/forbidden
permission/admin_required
permission/super_admin_required

resource/not_found
resource/conflict
```

Front-end maps machine codes to localized user-facing messages.

## Idempotency

Mutating endpoints accept an optional `Idempotency-Key` header. If two requests come in with the same key within 24 hours, the second returns the cached response of the first. Critical for checkout (prevent double-charges if user clicks twice).

## Webhooks out

We don't expose webhooks to third parties in v1. Future: Slack notification webhook for admin alerts.

## API versioning

Don't version yet. We control the only client (our own frontend). If we ever expose an external API, prefix with `/api/v1/`.
