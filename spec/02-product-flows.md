# Product Flows

Every screen and the user journey through it. This document will be expanded into wireframes when we get to Stage 2, but here is the structural inventory.

## Visitor / guest flows

### Landing
- Hero with active theme (theme set by admin via `system_config.active_event_id`)
- Eyebrow shows next event with date
- Two CTAs: "Become a member" + "See upcoming events"
- Countdown to next event
- Prominent "Donate" link in the header + footer
- Animations per theme (Durga / Kali / Saraswati)

### About Pragati
- Mission, history, executive committee photos

### Events list (`/events`)
- Grid of published events sorted by date (upcoming first)
- Each card: poster, name, dates, "Buy tickets" or "Sold out" badge
- Past events at bottom, collapsed

### Event detail (`/events/[slug]`)
- Full poster
- Date, venue, map
- Description (markdown)
- Lineup / performers (if entered)
- **Ticket selector** — see "Ticket flow (guest or member)" below
- "Sign in for member pricing" prompt if not logged in (with a nearby "or continue as guest" link)

### Signup (`/signup`)
- Multi-step:
  1. Account: email + password
  2. Family: family name, primary first/last
  3. Contact: phone, address
  4. Add family members (optional, can skip)
  5. Choose payment method → Square (card) or Zelle
  6. Pay $35
- After payment:
   - Square: redirect to `/signup/success` (polling for webhook)
   - Zelle: redirect to `/signup/pending-zelle` (shows Zelle instructions + confirmation number)
- On confirmed payment: welcome email + auto-login

### Login (`/login`)
- Email + password
- "Forgot password" link
- After: redirect to original requested page or `/m`

### Guest ticket lookup (`/lookup`)
- Form: enter your email + confirmation number
- Shows: event info + all tickets in the registration + QR codes + PDF download
- No login required; the combination of email + confirmation number is the auth proof
- Rate-limited server-side (5/hour per email) to prevent enumeration

### Donation (`/donate`)
- Amount picker: `$25 · $50 · $100 · $500 · Custom` chips
- Optional: "This donation is..." dropdown → `Just a gift` / `In honor of...` / `In memory of...`
- If honor/memory: honoree name (required) + honoree notify email (optional, sends them a nice email letting them know)
- Optional: message to Pragati (textarea)
- Optional: "Make this donation anonymous" checkbox (name still stored for treasurer records but hidden from any public display)
- Buyer info: name, email, phone
- Payment method: Square or Zelle
- Submit → same success / pending-Zelle flow as ticket purchases
- Confirmation number format: `DON-2026-NNNN`
- Tax receipt language in the email

---

## Ticket flow (guest or member) — the important one

### Step 1: Select tickets
On the event detail page, the buyer sees a **per-family-member ticket picker**. If they're a member, their family_members are pre-loaded as rows. If they're a guest, they start with one empty row and can add more with "+ Add another person".

Each row lets them:
- Pick which family member (dropdown if member, or type a name if guest)
- Pick which ticket type from the event's available types
- See the price for that type (member vs non-member)
- Optionally set food preference (auto-filled for known family members)

Example UI (Durga Pujo 2026):
```
Ticket order

┌────────────────────────────────────────────────────────────┐
│ Sayantan (you)      [3-day pass with food ▾]     $80.00   │
│ Anita (spouse)      [Saturday only + food  ▾]    $35.00   │
│ Rohan (child, 8)    [3-day child, no food  ▾]    $20.00   │
│ Grandma (add name)  [Sunday only + lunch   ▾]    $25.00   │
│ [+ Add another person]                                     │
├────────────────────────────────────────────────────────────┤
│ Subtotal:                                       $160.00    │
│ Promo (EARLYBIRD):                              −$20.00    │
│ Total:                                          $140.00    │
└────────────────────────────────────────────────────────────┘

[  Apply promo code  ]     [  Continue to payment →  ]
```

### Step 2: Buyer info
- Buyer's name, email, phone (pre-filled for logged-in members)
- Terms of Service acceptance checkbox (required first time)

### Step 3: Payment method
- Choose Square or Zelle
- **Square path:** button says "Pay $140.00 with card →"
- **Zelle path:** button says "Reserve tickets and pay via Zelle →"

### Step 4a: Square checkout
- Redirect to Square-hosted payment page
- On success → redirect to `/checkout/success?conf=PRG-2026-4821`
- Success page polls for webhook confirmation (usually < 5 sec)
- Once confirmed → shows tickets, sends email

### Step 4b: Zelle instructions page
Full page (not a modal) with:
```
Send Zelle payment to complete your order

Amount:        $140.00       [ 📋 copy ]
Recipient:     treasurer@pragatiphilly.org       [ 📋 copy ]
Memo (required): PRG-2026-4821       [ 📋 copy ]

⚠️  You MUST include the memo above so we can match your payment.

Steps:
  1. Open your bank app
  2. Send $140.00 to treasurer@pragatiphilly.org via Zelle
  3. IMPORTANT: put "PRG-2026-4821" in the memo/note field
  4. Come back here and click below

  [  I've sent the Zelle payment →  ]

Your seats are reserved until [Nov 4, 6:15 PM ET].
You'll get your tickets by email as soon as our treasurer
verifies the payment (usually within 24 hours).
```

After clicking "I've sent it":
- Acknowledgment email sent immediately
- Reservation extended to 48 hours
- Buyer sees "We've noted your payment. Watch for the confirmation email."

### Step 5: Tickets email
Once payment is confirmed (Square webhook or admin verification for Zelle):
- Email with all tickets in one PDF attachment
- Each ticket has its own QR code
- Confirmation number prominent
- Instructions: bring the PDF or your phone to the event; anyone with the QR can check in

---

## Member flows (`/m/*`)

### Dashboard
- Recent ticket purchases
- Upcoming events with quick "Buy tickets"
- Family list at a glance

**Removed from earlier draft (v1 scope):**
- ~~Membership status / expiry~~
- ~~Renewal CTA~~
- ~~Payment history~~

### Profile (`/m/profile`)
- Edit contact, address, password
- Change email (with verification)
- Delete account (with 30-day grace)

### Family (`/m/family`)
- List family members
- Add: relationship, name, DOB (used for age-based ticket pricing), food pref, allergies
- Edit / remove

### Ticket history (`/m/tickets`)
- List own registrations (past and upcoming)
- Each: event, date, ticket types, QR codes, "Download PDF"
- **No refund request button** (removed from v1)

**Removed from earlier draft:**
- ~~Member directory (`/m/directory`)~~
- ~~Renewal page (`/m/renewal`)~~

---

## Admin flows (`/admin/*`)

### Dashboard
- Metrics: members count, registrations for the active event, pending Zelle count, recent activity
- Quick actions: switch theme, view next event, view Zelle queue

### Members
- List with search, filter (status, city, family size)
- Edit, add manually, mark as inactive, export CSV
- **No "extend expiry" or "membership expiry" fields** (admin manages status as `active` / `inactive` only)

### Events
- List incl. drafts
- Create new event wizard:
  1. Basics: name, theme, dates, venue, description
  2. Upload poster
  3. Configure ticket types (with pricing model per-person or per-family)
  4. Configure promo codes
  5. Preview
  6. Publish (now or scheduled)
- Per event: registrations list, attendee export, bulk email, cancel (no refund)

### Pending Zelle verification queue (`/admin/payments/pending-zelle`)
- The single most important admin screen for daily ops
- Two tabs: tickets + donations
- Each row shows: confirmation number, buyer name, amount, event/donation, when the buyer clicked "I've sent it"
- Actions: [ Mark paid ] [ Cancel ]
- Marking paid → confirmation dialog → triggers ticket/receipt email
- Sortable by time; oldest first by default

### Donations (`/admin/donations`)
- Same UX as registrations list
- Filter: with honoree, anonymous, by month
- Export CSV for treasurer's 501(c)(3) annual reporting

### Content
- Edit static pages (About, Mission)
- Team members CRUD
- Sponsors CRUD
- Magazine upload

### Settings (super-admin only)
- System config: annual membership price, Zelle recipient email/display name, Square location ID, contact info
- Active event / theme
- Audit log viewer
- Admin user management

### Check-in (`/admin/checkin/[eventId]`)
- Optimized for phone/tablet
- Camera-based QR scanner
- Manual lookup by name or confirmation number (for forgotten tickets)
- Real-time count of checked-in attendees

---

This document will be expanded with wireframe sketches and per-screen detailed specs at the start of each implementation stage. For now, it serves as the inventory of what exists.
