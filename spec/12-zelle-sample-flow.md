# Zelle Sample Flow

A concrete walkthrough of what a Zelle payment looks like end-to-end. Written so a committee member or admin can read it and immediately understand what the buyer sees, what the treasurer sees, and what happens automatically.

Use this document as a **training aid** for admins who will verify Zelle payments daily.

## Cast of characters

- **Anita Roy** — buying tickets to Durga Pujo 2026 for her family of 4. Not a Pragati member. Prefers Zelle over cards.
- **Sudip Ghosh** — the Pragati treasurer, admin on the site. Checks the Zelle queue twice a day during Pujo season.
- **Pragati bank account** — receives Zelle transfers. Registered under email `pragati.management@gmail.com`. Display name in the Zelle app: "Pragati".

---

## Timeline

### T+0 — Anita opens the event page

Anita on her phone at `pragatiphilly.org/events/durga-pujo-2026`. She scrolls, sees ticket options, picks:
- 3-day pass with food × 2 adults (herself + husband)
- 3-day child pass × 2 kids (ages 8 and 12)

Order total: **$220** (non-member pricing).

She fills the buyer info (name, email, phone). Picks payment method: **Zelle**.

Clicks "Reserve tickets and pay via Zelle →".

### T+0 (server-side)

The server:
1. Creates a `registrations` row with:
   - `member_id` = NULL (guest)
   - `buyer_name` = "Anita Roy"
   - `buyer_email` = "anitar@example.com"
   - `buyer_phone` = "+1215..."
   - `total_cents` = 22000
   - `payment_method` = "zelle"
   - `status` = "pending_payment"
   - `confirmation_number` = "PRG-2026-4821-A7K3" (sequential + random suffix)
   - `reservation_expires_at` = NOW + 15 minutes
2. Creates 4 `tickets` rows (unconfirmed) tied to the registration
3. Reserves capacity: increments `ticket_types.sold_count` by 2 for the adult pass, 2 for the child pass
4. Returns the Zelle instruction data to the browser

### T+0.2 — Anita sees the Zelle instructions page

The page shows:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Send Zelle payment to complete your order
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Amount:            $220.00           [ 📋 Copy ]

  Send to (Zelle):   pragati.management@gmail.com
                                        [ 📋 Copy ]

  Should appear as:  "Pragati"

  Memo (required):   PRG-2026-4821-A7K3
                                        [ 📋 Copy ]

  ⚠️  You MUST include the memo above in the Zelle
      "message" or "note" field. Without it, your
      payment can't be matched to your order.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  How to complete:

  1. Open your bank's mobile app
  2. Go to Zelle → Send Money
  3. Recipient: pragati.management@gmail.com
  4. Amount: $220.00
  5. In the memo/note: PRG-2026-4821-A7K3
  6. Send
  7. Come back here and click below

  [  I've sent the Zelle payment →  ]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Your seats are reserved until:
    November 4, 2026 at 6:15 PM ET  (15 minutes)

  You'll get your tickets by email once our
  treasurer verifies the payment — usually
  within 24 hours.

  Order reference: PRG-2026-4821-A7K3
```

### T+2 minutes — Anita opens her bank app

Anita opens the Chase app on her phone. Goes to Zelle → Send Money. Types `pragati.management@gmail.com`. The Zelle app looks up the recipient and shows: **"Pragati"** as the display name. Anita recognizes this and proceeds.

She enters $220.00, taps "Memo," pastes `PRG-2026-4821-A7K3`, taps Send. Chase confirms the transfer.

### T+3 minutes — Anita clicks "I've sent it"

Back on the Pragati site, she clicks the button. The server:
1. Extends `reservation_expires_at` from NOW+15min to NOW+48hrs
2. Sends the acknowledgment email (`zelle_pending_ack` template):

> **Subject:** We've noted your Zelle payment for Durga Puja 2026
>
> Hi Anita,
>
> Thanks for your order! We've noted that you've sent a Zelle payment
> for **$220.00** for Durga Puja 2026.
>
> Your order reference is: **PRG-2026-4821-A7K3**
>
> Our treasurer will verify the deposit in the Pragati bank account
> (usually within 24 hours) and email your tickets and QR codes as
> soon as it's confirmed.
>
> If you have any questions, reply to this email or contact us at
> pragati.management@gmail.com.
>
> — Pragati

3. Adds a "buyer confirmed sent at 3:04 PM" line to the admin queue for this registration

Anita sees a success page: *"We've noted your payment. Watch for the confirmation email — usually within 24 hours."*

She closes her browser.

### T+4 minutes — Chase processes the transfer

Chase sends the $220 via Zelle. It arrives in the Pragati bank account within 1–5 minutes.

The Pragati bank shows a new incoming Zelle:
- From: Anita Roy
- Amount: $220.00
- Memo: PRG-2026-4821-A7K3
- Received: 3:07 PM

Pragati does NOT receive an automated notification about this in our system. Zelle has no merchant API. The deposit exists in the bank's records only.

### T+15 minutes — an automated admin alert

Our system sends the `admin_alert_zelle_pending` email to Sudip (treasurer):

> **Subject:** Zelle verification needed: PRG-2026-4821-A7K3
>
> A guest just clicked "I've sent it" for a Zelle payment:
>
> - Buyer: Anita Roy (anitar@example.com)
> - Amount: $220.00
> - For: Durga Puja 2026 (2 adults + 2 kids, 3-day passes with food)
> - Reference: PRG-2026-4821-A7K3
> - Submitted at: 3:04 PM
>
> Please check the Pragati bank account for a matching Zelle deposit,
> then mark this registration as paid in the admin dashboard:
>
> https://pragatiphilly.org/admin/payments/pending-zelle
>
> — Pragati Admin System

### T+6 hours — Sudip logs into the admin dashboard

Sudip opens `/admin/payments/pending-zelle`. He sees the queue:

| Reference | Buyer | Amount | Event | Submitted | Actions |
|---|---|---|---|---|---|
| PRG-2026-4821-A7K3 | Anita Roy | $220.00 | Durga Puja 2026 | 3:04 PM (6 hrs ago) | [ Verify ] [ Cancel ] |
| DON-2026-0058-M2P7 | Kunal Basu | $100.00 | Donation | 4:20 PM (5 hrs ago) | [ Verify ] [ Cancel ] |
| PRG-2026-4819-N4Q8 | Debasish Sen | $80.00 | Durga Puja 2026 | 11:30 AM (10 hrs ago) | [ Verify ] [ Cancel ] |

He clicks Anita's row and sees the detail:

```
Registration PRG-2026-4821-A7K3
Buyer:      Anita Roy  <anitar@example.com>
Phone:      +1215...
Payment:    Zelle ($220.00)
Status:     pending_zelle_verification
Submitted:  3:04 PM (Nov 4, 2026)
Expires:    3:04 PM (Nov 6, 2026) — 42 hours remaining

Line items:
  2 × 3-day pass with food (adult, non-member)     $180.00
  2 × 3-day child pass (child, non-member)         $ 40.00
  ─────────────────────────────────────────────
  Total                                            $220.00

Attendees (4 tickets):
  - Anita Roy       — 3-day pass w/food — non-veg
  - Kaushik Roy     — 3-day pass w/food — non-veg
  - Priya Roy       — 3-day child pass  — kid
  - Aniket Roy      — 3-day child pass  — kid

[ Verify payment in bank ] [ Cancel registration ]

Bank verification checklist:
  ☐ I have opened the Pragati bank account
  ☐ I see a matching Zelle deposit of $220.00
  ☐ The memo/note contains PRG-2026-4821-A7K3
```

Sudip opens Chase Business (Pragati's bank) in another tab. Filters for Zelle deposits today. Finds:

> Nov 4, 2026 · 3:07 PM · Incoming Zelle from Anita Roy · $220.00 · Memo: "PRG-2026-4821-A7K3"

It matches. He returns to the admin page and clicks "Verify payment in bank" — a confirmation dialog:

```
Confirm you've verified this in the bank

  Amount matches ($220.00):   ✓
  Memo matches:               ✓
  Received recently:          ✓

This will:
  - Mark this registration as paid
  - Generate ticket QR codes
  - Email 4 tickets to anitar@example.com
  - Notify the buyer

  [ Cancel ]  [ Yes, mark paid ]
```

Sudip clicks "Yes, mark paid." The server:
1. Updates the registration:
   - `status` = "paid"
   - `paid_at` = NOW
   - `zelle_verified_by` = Sudip's user_id
   - `zelle_verified_at` = NOW
2. Generates unique QR codes for each of the 4 tickets
3. Renders a 4-page PDF with each ticket + QR
4. Sends the `tickets_issued` email to Anita:

> **Subject:** Your tickets for Durga Puja 2026 🌼
>
> Hi Anita,
>
> Your Zelle payment for $220.00 has been confirmed. Here are your
> tickets for Durga Puja 2026, October 16–18 at the Greater
> Philadelphia Expo Center.
>
> **Order:** PRG-2026-4821-A7K3
>
> Attached is a PDF with all 4 tickets. Each has a unique QR code —
> please show yours at the entrance for check-in.
>
> - Anita Roy — 3-day pass with food
> - Kaushik Roy — 3-day pass with food
> - Priya Roy — 3-day child pass
> - Aniket Roy — 3-day child pass
>
> Bring the PDF on your phone, or print it. See you at Pujo!
>
> — Pragati
>
> [ Attachment: durga-pujo-2026-tickets-PRG-2026-4821-A7K3.pdf ]

5. Writes an entry to `audit_log`:
   `Sudip Ghosh marked registration PRG-2026-4821-A7K3 as paid via Zelle, verified $220.00 deposit in bank`

The registration disappears from the pending queue.

### T+6 hours + 1 second — Anita receives her tickets

Her phone buzzes. She opens the email, sees the PDF attached, opens it, sees 4 tickets with QR codes. She saves the PDF to her phone. Done.

---

## What happens when things go wrong

### Scenario 1 — Anita forgets the memo

The Zelle deposit arrives but has memo "Hi!" or is blank.

Sudip sees the deposit in the bank ($220 from Anita Roy) but no matching pending registration by memo. He searches the pending queue by amount + name. Finds Anita's PRG-2026-4821-A7K3 pending. He clicks Verify manually — the checklist has a note: **"⚠ Memo missing — manually verified by amount + buyer name match."** The action is logged with this note.

### Scenario 2 — Anita sends the wrong amount

Anita sends $200 instead of $220.

Sudip sees the deposit but the amount is short. He clicks Anita's row, and there's a **"Partial payment"** option. He can:
- Mark it as partial and email Anita for the remaining $20
- Cancel the registration (refund the $200 manually by Zelle)
- Contact her before doing anything

For v1: partial payment path is not automated. He emails her via the "Contact buyer" button on the row.

### Scenario 3 — Anita never sends the money

15 minutes pass and she never clicks "I've sent it." The cron job releases her seat reservation. If she clicks the button later, we tell her: "Sorry, your reservation expired. Please start again."

### Scenario 4 — Sudip doesn't check for 48 hours

Anita clicked "I've sent it" at 3:04 PM Monday. Sudip doesn't check the queue Monday or Tuesday. By 3:04 PM Wednesday, the reservation expires. Anita's registration is auto-cancelled and her tickets are released.

To prevent this: the system sends Sudip an escalating alert:
- At T+24 hours: yellow warning email
- At T+40 hours: red urgent email
- Registrations pending > 24 hours appear at top of the queue in a yellow/red row

### Scenario 5 — Someone claims to have sent but didn't

Fraudulent claim. Sudip checks the bank, sees no matching deposit, clicks Cancel. The registration is cancelled and the seat released. Audit log captures the cancellation with reason.

**Rule:** Never mark a registration paid without seeing the money in the bank. No exceptions.

---

## Rhythm during Pujo peak

During the 2 weeks before Durga Pujo (August–October 2026), Sudip should check the pending queue **twice daily** — once mid-morning and once evening. Typical daily volume estimate: 20–40 Zelle verifications in the last week before the event.

Estimated time per verification: **60–90 seconds** if the memo matches and the bank feed is quick to search.

Total daily admin workload estimate: **20–60 minutes** at peak.

---

## Summary of what makes this work

1. **Clear buyer instructions** with copy-to-clipboard for amount/recipient/memo
2. **Unique confirmation number** that doubles as the bank memo
3. **48-hour reservation** after buyer clicks "I've sent it"
4. **Daily-checkable queue** for admins with escalating alerts
5. **Visual bank verification** before marking paid — never skipped
6. **Automated tickets email** the moment admin marks paid
7. **Audit log** of every verification for treasurer reconciliation

That's the whole flow.
