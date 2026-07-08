# Roles & Scope

This document defines the four user roles in the system and what each can do. Every feature in the rest of the spec ties back to one of these roles.

## The four roles

| Role | Who | Can log in? | Special access |
|---|---|---|---|
| Visitor / Guest | Anyone with the URL — no account needed | No | Public pages + **guest checkout for tickets & donations** |
| Member | Family that has paid annual dues | Yes (email + password) | Own profile + member-priced tickets |
| Admin | Executive committee members | Yes + 2FA recommended | All admin dashboards |
| Super-admin | 1–2 trusted committee members | Yes + 2FA required | Add/remove other admins, view audit log |

**Important:** logging in is **never required** to buy a ticket or donate. Anyone can complete a purchase as a guest, receive tickets via email, and look them up later with their email + confirmation number. Members log in only to get member pricing and to have their profile pre-fill the buyer form.

Permissions are **additive** — every admin can do everything a member can do, and super-admins can do everything admins can.

---

## Visitor / Guest

A visitor is anyone who lands on the site without logging in. This includes prospective members, sponsors, community members from other cities, search engines, and — importantly — **anyone buying a ticket or making a donation without creating an account**.

### What a visitor can do

- Read the homepage with the active theme (Durga / Kali / Saraswati)
- See upcoming events with public details (dates, venue, ticket prices)
- See past events with photo galleries (where the event was marked "public archive")
- Read about Pragati (mission, history, executive committee)
- See current sponsors
- Browse the magazine archive (read-only PDF viewer)
- Submit the "Contact us" form
- Register as a new member (this triggers the membership flow)
- **Buy event tickets as a guest** — no account required. Provide name + email + phone; receive tickets by email.
- **Make a donation** as a guest, with optional "in honor / in memory of" note
- **Look up prior guest purchases** on `/lookup` by entering email + confirmation number

### What a visitor cannot do

- See any internal data (registration lists, payment records, member directory)
- Access any admin page
- Download member contact info
- Upload anything
- Get member pricing on tickets (that requires logging in as a member)

---

## Member

A member is the primary account-holder for a family. One email per family.

### Becoming a member

A visitor becomes a member by:
1. Clicking "Become a member" anywhere on the site
2. Filling the registration form (see [Product Flows](./02-product-flows.md))
3. Paying the annual dues via Stripe
4. Receiving the welcome email with login instructions

After step 4, they can set their password and log in.

### What a member can do

**Profile management:**
- Edit own contact info (name, email, phone, mailing address)
- Add/edit family members (spouse, children with age) — see "Family model" below
- Set food preferences for each family member (vegetarian / non-vegetarian / Jain / vegan / allergies)
- Change password / request password reset
- Delete own account (triggers data-deletion flow — see [Security](./08-security-and-privacy.md))

**Event interactions:**
- See member-priced tickets for all events (guests see non-member prices)
- Register and pay for events for self + family, with the ability to mix ticket types per family member (see "Mixed family tickets" below)
- View own ticket history with QR codes
- Download tickets as PDF or add to Apple/Google Wallet (v2)

### What a member cannot do (in v1)

- See any other member's information (no directory in v1)
- See own membership expiry date or renewal status (removed from v1)
- See own payment history in a self-serve report (removed from v1 — treasurer handles offline)
- Request a refund via the website (all refunds handled offline by executive committee)
- Access admin pages
- Configure events, prices, or promo codes
- Upload site content

**Deferred to v2** (was previously in v1 scope, removed on committee feedback):
- Member directory + opt-in privacy toggle
- Member-only view of sponsors
- Self-serve membership renewal
- Membership expiry visible to member
- Payment history dashboard for members
- Any auto-renewal reminders

**How membership expiry is handled in v1:** Admin manages membership status entirely offline. Once a family pays their $35 annual dues, they are marked `active` in the system and stay that way until an admin manually changes their status. Annual reconciliation (who's still a member) happens outside this platform.

### Family model

One member account = one family. The account-holder is the **primary member**. They can add:

- Their **spouse/partner** (one optional)
- **Children** (zero or more, with name and age — needed for kids' ticket pricing)
- **Dependent adults** living in the household (e.g., elderly parents, an au pair) — counted differently from kids for ticket pricing

### Persistent family + per-event override

The family list is **saved on the account**. When the primary member buys tickets, their family is pre-loaded as checkbox rows in the ticket picker so they don't have to re-type names every event. At checkout they can:

- Uncheck any family member who isn't attending this specific event
- Add extra guests who aren't in the persistent family (typed name only, not saved)
- Change food preferences for this event only (without changing the persistent family record)

### Discount rules — configurable by admin

Pragati has chosen to make the member-discount logic **configurable via system config**, so the executive committee can switch modes without a code change:

**Mode A — "Per-adult member counting"** *(default for launch)*
Each adult in the family has an `is_member` flag. Only adults with `is_member = true` get the 30% discount on their ticket. Kids under a family-membership always get member pricing (regardless of adult flags). If both spouses are flagged as members, both get discounts.

Example — Kundu family with only Sayantan flagged as member:
- Sayantan (member adult): $80 ticket → $56 after 30% off
- Anita (non-member adult): $80 ticket → $80
- Rohan (child, covered by family): $40 child ticket → $28 after 30% off

**Mode B — "Whole-family member pricing"**
If the family has paid dues (member is `active`), *all* adults on that family account get 30% off. Kids also get member pricing.

Example — same Kundu family under Mode B:
- Sayantan: $56
- Anita: $56
- Rohan: $28

Setting: `system_config.member_discount_mode` = `per_adult` | `whole_family`. Admins can flip this in the settings dashboard; change takes effect for future purchases only (existing tickets are already priced).

### Kids' member pricing rule (both modes)

Anyone marked as a child (family_member.relationship = 'child', or age < 18) on a paid family's account always gets member-priced tickets. This is intentional — kids don't have separate "membership" status.

### Guest attendees

If a family adds a guest (e.g., visiting cousin, friend) to their order at checkout, that guest **always pays non-member price** regardless of the family's membership status.

### Mixed family tickets (important design)

When the primary member (or a guest) buys tickets for a multi-day event, **each family member can have a different ticket type on the same order**. Example for Durga Pujo 2026:

| Attendee | Ticket type | Price |
|---|---|---|
| Sayantan (dad) | 3-day pass with all meals | $80 |
| Anita (mom) | Saturday only + lunch + dinner | $35 |
| Rohan (child, 8) | 3-day child pass, no food | $20 |
| Grandma | Sunday only + lunch (vegetarian) | $25 |
| Guest friend | Saturday only, no food | $30 |
| **Total** | | **$190** |

One buyer, one checkout, one payment, five different tickets. Each ticket gets its own QR code and its own food preference on file. The checkout UI is designed around this — a per-family-member row where the buyer picks which ticket type applies to each person.

### Ticket-buyer independence

The person who buys the tickets is not necessarily the person who attends. A member can buy tickets for extended family and friends who aren't in their household. In that case:

- Each ticket has an `attendee_name` field (freeform if the attendee isn't in the buyer's family)
- Each ticket has its own food preference and allergies
- The buyer receives all tickets in one email; they forward as needed

### Edge cases (deferred to v2)

- Two adults in one family with separate email logins (v1: only the primary email logs in)
- Splitting a family into two accounts on admin request (v1: admin handles offline via support email)
- Adult child moving out and creating own account (v1: they just create a new account; admin cleans up old family record offline)

### Adult age threshold

An adult is defined as **18+**. Used for:
- Whether they can be flagged as a "member adult" (only adults can)
- Whether they get adult-priced or child-priced tickets

Age is derived from `family_members.date_of_birth` on the day of the event.

---

## Admin

An admin is an executive committee member with full operational access.

### What an admin can do

**Member management:**
- View the full member list (with contact info, family details, food prefs, membership status, payment history)
- Search and filter members
- Manually add a new member (for offline registrations — someone who paid by check)
- Edit any member's profile
- Mark a member as expired / lapsed / lifetime
- Export the member list as CSV (audit-logged)
- Send bulk emails to all members or filtered subsets

**Event configuration:**
- Create a new event (Durga Pujo 2026, Kali Pujo 2026, Saraswati Pujo, Summer Picnic, etc.)
- Set the active theme for the active event (which switches the public site to Durga / Kali / Saraswati mode)
- Configure ticket types per event — see "Ticket configurator" below
- Set capacity limits (overall, or per ticket type)
- Create promo codes (percentage off, fixed off, single-use or multi-use, expiry date)
- Upload event poster (auto-resized, see [Image Pipeline](./07-image-pipeline.md))
- Edit event copy (title, description, dates, venue)
- Schedule the event "publish" date (when it appears publicly)

**Registration & payment management:**
- View live list of registered attendees per event (members + guests together)
- See payment status per registration (paid / pending Zelle / pending Square / cancelled)
- Verify Zelle payments: match pending registrations against bank feed, mark paid → triggers ticket email
- Manually mark someone as paid (for other offline scenarios: check, cash at door, etc.)
- Cancel a registration (no auto-refund — refunds handled offline)
- Resend tickets to a buyer
- Send custom email to all attendees of an event

**Donation management:**
- View list of donations (member + guest)
- See "in honor / in memory of" details per donation
- Same Zelle-verification workflow as tickets
- Export donations report for treasurer's 501(c)(3) reporting

**Content management:**
- Edit "About Pragati", "Mission", and similar static pages
- Add/edit/remove team members (committee + trustees)
- Add/edit/remove sponsors with logos
- Upload yearly magazine PDFs

**Event-day operations:**
- Open the "Check-in" mode on a tablet/phone — scan ticket QR codes to mark attendees as checked in
- Reprint a ticket for a member who forgot theirs
- See real-time check-in counts

### What an admin cannot do

- Add/remove other admins (super-admin only)
- See the audit log (super-admin only)
- Change system-level settings (Stripe keys, email keys, etc. — super-admin only)
- Delete a member's account permanently (super-admin only — soft-delete is okay)

### Ticket configurator (detailed)

The most complex admin feature. Per event, admin chooses:

**Step 1 — Pricing model:**
- **Per-person tickets** — every attendee gets a numbered ticket. Used for Durga Pujo cultural shows.
- **Per-family tickets** — one ticket per family, declares headcount. Used for Saraswati Pujo lunch.

**Step 2 — Ticket types** (admin can add multiple per event):
Each ticket type has:
- Name (e.g., "Full 3-day pass with food")
- Description (optional, shown to buyer)
- Price for members
- Price for non-members (or "not available to non-members")
- Optional: price for children (with age range), seniors, etc.
- Quantity available (overall capacity)
- Sale start date/time
- Sale end date/time
- Whether it requires food selection
- Whether it requires a seat selection (low priority — out of scope for v1)

Example for Durga Pujo 2026:

| Type | Member | Non-member | Cap | Food |
|---|---|---|---|---|
| 3-day pass + all meals | $80 | $120 | 400 | Yes |
| 3-day pass, no food | $40 | $70 | 400 | No |
| Single day (Saturday) + lunch + dinner | $35 | $55 | 200 | Yes |
| Single day (Sunday) + lunch | $25 | $40 | 150 | Yes |
| Child (5–12) | $20 | $30 | — | Yes |
| Child (under 5) | Free | Free | — | Yes |

**Step 3 — Promo codes:**
- Code string (e.g., `EARLYBIRD`)
- Discount type (% off or $ off)
- Amount
- Applies to: all tickets / specific types
- Max uses (overall, or per member)
- Valid from / until

---

## Super-admin

A super-admin is a small group (1–2 people, e.g., the president + IT lead) with the highest trust level.

### What a super-admin can do (beyond admin)

- Add or remove other admins
- View the full audit log (every admin action with timestamp, IP, what was changed)
- Configure system-level settings: Stripe keys, email API keys, domain
- Permanently delete a member account (vs. soft-delete)
- Restore from backup (in coordination with the developer)
- Set the org-level configuration: membership annual price, annual cycle dates, default refund policy

### What a super-admin cannot do

- View any member's *password* (passwords are hashed, irrecoverable)
- See raw Stripe card data (Stripe doesn't expose this to anyone)

### Recommendation

The super-admin role should be held by **exactly two people** for redundancy. Both must have 2FA enabled. Losing both super-admin accounts means recovering via Sayantan with direct database access.

---

## What's intentionally out of scope (v1)

- **Website-managed refunds.** No refund UI or API. All refunds handled offline by executive committee, case-by-case. Terms of service state clearly that all sales are final.
- **Member directory + community features.** No browsing other members. No opt-in privacy toggle.
- **Membership expiry visible to members.** No "your membership expires on X" display. No renewal button. Admin manages status offline.
- **Self-serve payment history for members.** No dashboard of past dues + tickets purchased.
- **Recurring donations or memberships.** All payments are one-time.
- **Volunteer scheduling.** Pragati uses sign-up sheets or WhatsApp.
- **Vendor management.** Catering, decoration, AV — these stay in spreadsheets/email.
- **Multi-language UI.** The current site is English with Bengali decorative accents. Full Bengali UI out of scope.
- **Mobile app.** The web app is mobile-responsive. Native iOS/Android apps out of scope.
- **Forum / chat / comments.** No community discussion features.
- **Two-adult logins per family** (spouse gets separate login). V2.
- **Donor tiers, recognition levels, annual giving statements.** V2.

## What IS in v1 scope (added on committee feedback)

- **Guest checkout** for tickets and donations — no account needed
- **Guest lookup** page — retrieve tickets by email + confirmation number
- **Zelle payments** with admin verification queue (side by side with Square)
- **Donation page** with "in honor / in memory of" honoree fields
- **Mixed ticket types per family** — buyer can pick different types per family member on one order
