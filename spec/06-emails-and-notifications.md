# Emails & Notifications

Every transactional email the system sends. Built with **React Email** templates, sent via **Resend**.

## Sending domain — LAUNCH configuration

Per committee decision (Nov 2026):

- From address: `Pragati <pragati.management@gmail.com>`
- Reply-to: `pragati.management@gmail.com`

**⚠️ Deliverability warning.** Personal Gmail addresses are heavily rate-limited by Google when used to send bulk transactional email. Gmail also does not support SPF/DKIM/DMARC verification for personal addresses, which means our emails will land in spam for many recipients on Gmail, Outlook, and Yahoo — especially in bursts around Durga Pujo when we send 400+ ticket emails in a day.

**Code-side mitigations we'll ship in v1:**
- Send in batches of 20 with a 5-second delay between batches (rate-limit friendly)
- Retry on soft-bounce with exponential backoff (up to 3 retries)
- Alert admins if bounce rate > 5% during any batch
- Set `List-Unsubscribe` header on promotional emails to reduce spam scoring
- Include plain-text version of every email (helps spam scoring)

**Strongly recommended v1.5 upgrade** (before Durga Pujo public launch, target July 2026):
1. Pragati buys a domain (`pragatiphilly.org` recommended, ~$15/year)
2. Sayantan adds DKIM + SPF + DMARC DNS records via Resend
3. Change `system_email_from` config value to `noreply@pragatiphilly.org`
4. Keep `system_email_reply_to` as `pragati.management@gmail.com` so replies still land in the Gmail inbox

This is a config change only — no code required. Deliverability improves by roughly 100x.

## Sending provider

Regardless of sending domain, we use **Resend** to actually send the emails. Resend can send FROM verified domains (recommended path) or from generic Gmail SMTP relay (fallback for v1 launch). Both are supported; we swap by changing the `system_email_from` config.

## Templates

| Template | Trigger | Recipient | Subject |
|---|---|---|---|
| `welcome` | Member payment succeeded | New member | "Welcome to Pragati 🌼" |
| `email_verify` | Signup or email change | The address being verified | "Verify your Pragati email" |
| `password_reset` | Forgot password | User | "Reset your Pragati password" |
| `payment_receipt` | Any successful payment | Buyer | "Your Pragati receipt — $XYZ" |
| `tickets_issued` | Event registration succeeded (Square instant OR Zelle verified) | Buyer | "Your tickets for {event}" (with PDF attachment) |
| `zelle_pending_ack` | Buyer clicked "I've sent Zelle" | Buyer | "We've noted your Zelle payment for {event}" |
| `zelle_reservation_expiring` | 24 hours after "I've sent it" if not yet verified | Buyer | "Reminder: Zelle payment still pending" |
| `donation_receipt` | Donation payment confirmed | Donor | "Thank you for your gift to Pragati" (with tax receipt language) |
| `donation_honoree_notify` | Donation made in honor/memory + notify email provided | Honoree (or family) | "A gift has been made in honor of {honoree}" |
| `event_reminder` | 2 days before event (cron) | All attendees | "{Event} is in 2 days 🎉" |
| `event_cancelled` | Admin cancels event | All attendees | "{Event} has been cancelled" |
| `event_changed` | Admin edits date/venue of upcoming event | All attendees | "Important update: {event}" |
| `admin_alert_new_registration` | Any new paid registration | `treasurer_notification_email` | "New {event} registration: {buyer}" |
| `admin_alert_new_donation` | Any new donation | Admin + treasurer | "New donation: {donor} — ${amount}" |
| `admin_alert_zelle_pending` | New Zelle "I've sent it" click | Treasurer | "Zelle verification needed: PRG-YYYY-NNNN" |
| `admin_alert_zelle_stale` | Zelle pending > 24 hours | Treasurer | "⚠️ Zelle pending verification for 24+ hours" |
| `admin_alert_signup` | New member signed up | Admin email | "New member: {family}" |
| `admin_digest_weekly` | Weekly Monday (cron) | Admin email | "Pragati weekly digest" |
| `contact_form_submission` | Contact form filled | Admin email | "Contact form: {name}" |

**Removed from earlier draft (v1 scope):**
- ~~`refund_processed`~~ — no refunds via website
- ~~`membership_expiring`~~ / ~~`membership_expired`~~ — no expiry concept in v1
- ~~`admin_alert_refund`~~ — no refunds
- ~~`admin_alert_dispute`~~ — Stripe-specific (Square disputes handled in Square dashboard)

## Template structure

All templates share:
- Pragati logo header
- Marigold + sindoor color accents
- Plain-text version (auto-generated)
- Footer with org address, contact email, unsubscribe link (only on non-critical emails)
- Bengali wordmark "প্রগতি"

Tickets include:
- QR code embedded
- PDF attachment with full ticket
- Add-to-Apple-Wallet + Add-to-Google-Wallet links (v2)

## Critical vs. promotional

**Critical (no unsubscribe):**
- welcome, email_verify, password_reset, payment_receipt, tickets_issued, zelle_pending_ack, zelle_reservation_expiring, donation_receipt, event_cancelled, event_changed, admin alerts

**Promotional (with unsubscribe):**
- event_reminder, admin_digest_weekly, donation_honoree_notify

Members and guest buyers can opt out of promotional emails via the unsubscribe link. They cannot opt out of critical transactional emails.

## Email log

Every email tracked in `email_log` table. Admin can re-send any email from there.

## Delivery monitoring

- Resend dashboard for bounces / opens / clicks
- Alert if bounce rate > 5% (suggests sender-domain issue)
- Alert if any critical email fails to send (Sentry capture)

## Rate limits

Resend free tier: 100 emails/day, 3000/month. Plenty for v1.
Resend Pro tier: $20/mo for 50,000/month. Upgrade when membership > 200 active.

## Bulk emails

When admin sends "email all attendees of event X":
- Queued for sending (not blocking the request)
- Sent in batches of 100/minute (Resend rate limit)
- Status reported back to admin (sent / failed counts)

## Things we will NOT send

- Marketing newsletters (would need separate sending domain + ESP)
- Promotional event announcements to non-members (out of scope)
- Birthday emails / "we miss you" emails (creepy)
- Tracking pixels in transactional emails
