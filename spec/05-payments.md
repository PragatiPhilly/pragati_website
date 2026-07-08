# Payments — Square + Zelle

How money moves through the system. Pragati offers **two payment methods side by side**: Square (instant card payment) and Zelle (manual bank transfer, admin-verified).

## Why two rails, not one

- **Square** — instant confirmation, tickets emailed within seconds, no admin work per transaction. Costs 2.6% + 10¢ per online charge.
- **Zelle** — zero fees for Pragati, familiar to many members. But no API. Requires the buyer to send money via their own bank app, and requires an admin to verify the deposit in the Pragati bank account before tickets are issued.

Offering both means members who prefer Zelle get to use it (saving Pragati fees) while members who want instant tickets can pay with a card.

## Choice at checkout

On the checkout page, after the buyer configures tickets and enters contact info:

```
Payment method:
  ○ Card (Square)  — instant, tickets emailed immediately
  ○ Zelle          — no fees, tickets emailed after verification (usually within 24 hours)
```

Default preselection: **Card**. Zelle is a conscious choice.

---

## Rail 1 — Square

### Flow

```
buyer → configures order → clicks "Pay with card"
      → our server creates a Square Payment Link (or Checkout API session)
      → redirect to squareup.com hosted payment page
      → buyer enters card details
      → Square charges the card
      → Square redirects back to /checkout/success?order_id=...
      → our server verifies order via Square API
      → on success: create registration + tickets + email
      → meanwhile: Square webhook (payment.updated → COMPLETED) also fires
      → webhook is the SOURCE OF TRUTH
```

### Square account setup (treasurer)

1. Pragati already has a Square account — confirm it's active and linked to the org's bank
2. Sign in at https://squareup.com/dashboard
3. Developer → Applications → Create App
4. Note the **Application ID** and **Access Token** (production keys — keep secret)
5. Add webhook: `https://pragatiphilly.org/api/square-webhook`, subscribe to `payment.updated`, `refund.updated`
6. Note the **Webhook Signature Key**
7. Share keys with Sayantan via 1Password (not email)

### Webhook security

Same principle as any signed webhook. Square signs the payload with the webhook signature key. Verify before processing:

```ts
const sig = req.headers['x-square-hmacsha256-signature']
const body = await req.text()
const isValid = verifySquareSignature(body, sig, SQUARE_WEBHOOK_SIGNATURE_KEY, requestUrl)
if (!isValid) return new Response('Bad signature', { status: 400 })
```

Without this, anyone can forge payment-succeeded events. **Critical.**

### Webhook idempotency

Square webhooks can fire multiple times. Deduplicate by `event.event_id` in the `processed_webhook_events` table before processing.

### Capacity / overselling

Same reservation pattern as any payment rail:

1. When user clicks "Pay with card", we create the `registration` row in `pending_payment` status and increment `ticket_types.sold_count` (holding the reservation for 15 minutes)
2. If Square webhook confirms `COMPLETED` within 15 min → mark `paid`
3. If checkout abandoned → cron job releases the reservation after 15 min and decrements `sold_count`

### Square + Zelle at the same event

Both rails share the same `sold_count` and `capacity` on `ticket_types`. There's no "Square-only capacity" or "Zelle-only capacity." First-come-first-served across both rails.

### Test mode

Square provides sandbox credentials and sandbox card numbers (e.g., `4111 1111 1111 1111` for success). Local + staging use sandbox; production uses live.

---

## Rail 2 — Zelle

Zelle has no merchant API. It's a bank-to-bank transfer initiated by the buyer inside their own banking app. Our system's job is to (a) give the buyer clear instructions, (b) capture the buyer's registration in `pending_payment`, (c) let an admin mark it paid once they verify the deposit.

### Flow

```
buyer → configures order → clicks "Pay with Zelle"
      → our server creates the registration in status 'pending_zelle_verification'
      → generates a unique confirmation number (PRG-YYYY-NNNN)
      → shows the buyer:
          - Amount to send: $80.00
          - Zelle recipient: treasurer@pragatiphilly.org
          - Memo (required): PRG-2026-4821
          - Screenshot-friendly instruction card
          - "I've sent the payment" button
      → buyer opens their bank app, sends the Zelle
      → returns and clicks "I've sent it"
      → we send an ACKNOWLEDGMENT email:
          "We received your Zelle payment intent for $80.
           Your tickets will be emailed once the treasurer confirms
           the deposit — usually within 24 hours."
      → treasurer sees the pending registration in admin dashboard
      → treasurer opens their bank account, sees the Zelle deposit
      → cross-references amount + memo (PRG-2026-4821)
      → clicks "Mark as paid" in admin dashboard
      → system moves registration to 'paid'
      → tickets are generated + emailed
      → notification email sent to buyer
```

### The confirmation number

`PRG-YYYY-NNNN` format:
- `PRG` — Pragati
- `YYYY` — year (e.g., 2026)
- `NNNN` — sequential per year, starting at 0001

Displayed prominently on the Zelle instruction page. The buyer **must** put this in the Zelle memo field so the treasurer can match the deposit.

### Zelle recipient identity

Pragati sets up a Zelle recipient at the treasurer's bank account tied to the 501(c)(3):
- **Email:** `treasurer@pragatiphilly.org` (or similar)
- Registered with Pragati's bank
- Shows up in the recipient's Zelle app as "Pragati" (not a person's name — treasurer configures this)

**If the recipient shows up as an individual's name**, members will hesitate ("am I sending money to the right person?"). Confirm the bank display name looks like a legitimate org name before launch.

### Zelle capacity reservation

Same 15-minute reservation as Square when the buyer clicks "Pay with Zelle." But once the buyer clicks "I've sent it," we **extend the reservation to 48 hours** to give the treasurer time to verify without losing the buyer's ticket to someone else.

If the treasurer doesn't verify within 48 hours, the reservation expires and the registration flips to `cancelled_no_payment`. An admin can manually restore it later if the payment eventually arrives.

### Admin verification UI

`/admin/payments/pending-zelle` — a queue of pending Zelle registrations:

| Conf # | Buyer | Amount | Event | Requested at | Actions |
|---|---|---|---|---|---|
| PRG-2026-4821 | Sayantan Kundu | $80.00 | Durga Puja 2026 | 2 hrs ago | [ Mark paid ] [ Cancel ] |
| PRG-2026-4820 | Anita Roy | $35.00 | Membership | 5 hrs ago | [ Mark paid ] [ Cancel ] |

The treasurer opens their bank feed in a separate window/tab, and for each pending row:
- Verifies amount matches
- Verifies memo/confirmation number matches
- Clicks "Mark paid"

Clicking "Mark paid" → moves registration to `paid`, sends tickets email, logs the admin action to `audit_log`.

### Zelle disputes / reversals

Zelle disputes are almost impossible to win (Zelle explicitly does not offer consumer protection for authorized transfers). This actually **works in Pragati's favor** — once the money hits the account, it's very unlikely to be pulled back.

**Fraud angle:** the risk is someone claiming to have sent a Zelle payment they didn't send, hoping the admin marks it paid without checking. **Never** mark a registration paid without visual confirmation in the bank account.

### Zelle refunds

Since Pragati has said no refunds via the website, and Zelle has no refund API, any rare refund is handled by the treasurer manually sending a new Zelle transfer back. Not our system's concern.

---

## Shared: registrations table changes

The `registrations` table gets a new column:

| Column | Type | Notes |
|---|---|---|
| `payment_method` | text | enum: 'square', 'zelle' |
| `square_order_id` | text | nullable |
| `square_payment_id` | text | nullable |
| `zelle_confirmation_number` | text | nullable, unique — the PRG-YYYY-NNNN |
| `zelle_verified_by` | UUID | FK → users.id, nullable |
| `zelle_verified_at` | timestamptz | nullable |

And the `status` enum expands:
- `pending_payment` (Square, in Square Checkout)
- `pending_zelle_verification` (Zelle, awaiting admin verify)
- `paid`
- `cancelled`
- `cancelled_no_payment` (Zelle reservation expired)

**Refund-related statuses removed** since refunds aren't in this system.

---

## Shared: capacity race conditions

Reservation logic is the same for both rails:

1. On checkout submit, `SELECT ... FOR UPDATE` on `ticket_types` row
2. If `sold_count + requested_qty > capacity`, return 409 sold-out
3. Else, increment `sold_count`, insert `registration` in pending
4. Release lock

Cron job runs every 5 minutes:
- Finds `pending_payment` registrations older than 15 minutes → cancel + decrement
- Finds `pending_zelle_verification` older than 48 hours → cancel + decrement + email buyer

---

## No-refund policy — spec-level implications

Since refunds are entirely out of scope for the website:

- **Removed:** all refund UI, all refund API endpoints, all refund email templates
- **Removed:** `refunded`, `partially_refunded` from the registration status enum
- **Kept:** manual "Cancel registration" admin action (marks the registration cancelled without refund — for cases like "buyer emailed to cancel, treasurer will Zelle them back manually")

**Terms of service must be crystal clear**: "All ticket sales are final. Refund requests are considered on a case-by-case basis by the Pragati executive committee and are handled outside this website."

---

## Reconciliation

**Monthly reconciliation by treasurer:**

1. Download Square transactions report from Square Dashboard
2. Download bank statement (which shows all incoming Zelle deposits)
3. In our admin dashboard: export "All paid registrations for month X" as CSV
4. Match up:
   - Square: every Square-paid registration should have a corresponding Square transaction (with matching amount)
   - Zelle: every Zelle-paid registration should have a corresponding Zelle deposit (with matching amount + memo)
5. Investigate mismatches:
   - Registration paid in our system but no corresponding transaction → possible admin error (marked paid without verifying)
   - Transaction in bank but no corresponding registration → possible admin forgot to mark paid, or unrelated deposit

The admin dashboard provides an export at `/admin/exports/monthly-payments?month=2026-10` with columns:

`Confirmation #, Date, Buyer, Event, Payment Method, Square Order ID (or Zelle Memo), Amount, Marked Paid At, Marked Paid By`

---

## Donation payments — same rails

Donations use the exact same payment rails (Square or Zelle) but land in the `donations` table (not `registrations`). See [03-data-model.md](./03-data-model.md).

Donation confirmation numbers use `DON-YYYY-NNNN` format (distinct from `PRG-YYYY-NNNN` for tickets) so the treasurer can distinguish deposits at a glance in the Zelle feed.

---

## Fees summary

| Rail | Fee | Net on $35 dues | Net on $80 ticket | Net on $100 donation |
|---|---|---|---|---|
| Square | 2.6% + 10¢ | $33.99 | $77.82 | $97.30 |
| Zelle | $0 | $35.00 | $80.00 | $100.00 |

Encouraging Zelle for larger amounts (donations especially) saves Pragati meaningful money over the year.

---

## Things that will go wrong

In order of likelihood:

1. **Buyer forgets to include confirmation number in Zelle memo.** Treasurer sees "$80 from Sayantan Kundu" with no memo. Has to guess or reach out. Mitigation: make the memo requirement extremely prominent on the instruction page. Auto-copy-to-clipboard button.
2. **Zelle deposit arrives but treasurer forgets to mark it paid.** Buyer complains after a week. Mitigation: dashboard shows pending Zelles > 24 hours as a warning; weekly digest email.
3. **Square webhook fails to fire.** Rare but happens. Mitigation: buyer sees pending status, cron job also polls Square API every 10 min for orders in pending status.
4. **Buyer pays via Zelle but sends to wrong recipient email.** Mitigation: the Zelle recipient email is displayed prominently and can only be clicked-to-copy (no editing).
5. **Someone tries to game it — claims Zelle payment without actually sending.** Mitigation: never mark paid without visual confirmation in bank feed. Audit log captures who marked what paid.

---

## Roadmap impact

This changes Stage 4 in the roadmap:

- Add Square SDK integration (replaces Stripe SDK)
- Add Zelle instruction page + pending-verification admin queue
- Add confirmation number generator
- Add ack email + zelle-verified email templates
- Skip refund UI + refund email templates
- Add donation page + donation confirmation number generator (`DON-*`)

Rough estimate: same duration as Stripe-only would have been (~4 weeks). Zelle's admin-side UI is simpler than Stripe's refund/dispute UI, so time roughly balances out.
