# Open Questions — Resolved Log

Most of the original open questions have been resolved by the executive committee. This document now serves as:

1. **Decisions log** — what was decided and why (for future reference)
2. **To confirm before public launch** — a shortlist of items that need one more sanity check with the committee before Durga Pujo 2026 registration goes live
3. **Deferred to v2** — items intentionally set aside

---

## ✅ Decisions log

### Membership & pricing

- ✅ Annual membership: **$35 per family** (unchanged)
- ✅ No lifetime membership (deferred to v2)
- ✅ **Configurable member-discount model** — admin sets `member_discount_mode` in system config:
  - `per_adult` (default): each adult in the family individually flagged as member gets 30% off; kids always get member pricing on paid family
  - `whole_family`: if the family is paid, all adults get 30% off
- ✅ Member discount: **30%** off ticket prices
- ✅ Adult age threshold: **18+**
- ✅ Family composition: persistent on account, with per-event override at checkout
- ✅ No separate spouse login in v1
- ✅ No membership expiry concept in v1; admin manages `active` / `inactive` manually

### Pricing tiers (placeholder for Durga Pujo 2026)

Placeholder pricing per committee direction ($100–$300 range). Real prices to be finalized by cultural committee before ticket sales open. Admin can edit any of these in the dashboard.

| Ticket type | Non-member | Member (30% off) |
|---|---|---|
| 3-day pass with food (adult) | $180 | $126 |
| 3-day pass without food (adult) | $120 | $84 |
| Single day + meals (adult) | $80 | $56 |
| Single day without food (adult) | $60 | $42 |
| 3-day pass (child, 5–17) | $80 | $56 |
| 3-day pass (child under 5) | Free | Free |
| Senior discount | Not offered in v1 | — |

- ✅ Saraswati Pujo: same ticket-type structure as Durga Pujo (per-family + per-person supported)
- ✅ Kali Pujo: same structure; revisit specifics later
- ✅ All events open to everyone (no member-only events in v1)
- ✅ No early-bird / member-head-start window

### Payments

- ✅ **Square + Zelle side by side** — buyer picks at checkout
- ✅ Zelle recipient: `pragati.management@gmail.com` (display name "Pragati")
- ✅ Zelle SLA: 24 hours from "I've sent it" to tickets emailed
- ✅ No online refunds — all refunds offline via committee discretion
- ✅ No hard refund cutoff — committee can approve at any time
- ✅ Refund decisions: family/committee decides who signs off
- ✅ Refund policy statement in ToS: "All sales are final. Refund requests are considered case-by-case by the Pragati executive committee."

### Donations

- ✅ Donation page **in v1**
- ✅ Any amount accepted (no cap, no minimum)
- ✅ Preset amount picker: $25 / $50 / $100 / $500 / Custom
- ✅ No anonymous donations
- ✅ No restricted / earmarked donations (all go to general fund)
- ✅ "In honor / in memory of" honoree feature with optional notify-email
- ✅ No tax receipts (committee decision — deferred)
- ✅ No recurring donations in v1
- ✅ No donor tiers, no public donor recognition

### Emails

- ✅ Sending from: `pragati.management@gmail.com` (Gmail — with deliverability caveat)
- ✅ Reply-to: `pragati.management@gmail.com`
- ✅ Contact email publicly: `pragati.management@gmail.com`
- ✅ Treasurer notification: `pragati.management@gmail.com` (same address; specific routing to be considered later)
- ✅ **Recommended v1.5 upgrade:** move to `noreply@pragatiphilly.org` for deliverability before Durga Pujo public launch (see [10-roadmap.md](./10-roadmap.md) Stage 5.5)

### Features scope

- ✅ Guest checkout (no login needed) — YES
- ✅ Guest ticket lookup via email + confirmation number — YES
- ✅ Member directory — NO (v2)
- ✅ Self-serve membership renewal — NO (v2)
- ✅ Member payment history dashboard — NO (v2)
- ✅ Magazine PDF distribution — NO (magazines sold at physical Pujo counter only in v1)
- ✅ Food preferences: `veg` / `non_veg` / `kid` only — no jain, vegan, or structured allergy list
- ✅ Mixed ticket types per family (dad 3-day, mom Saturday, kid child pass) — YES

### Admin operations

- ✅ Admins configured via bootstrap script (see [13-admin-bootstrap.md](./13-admin-bootstrap.md))
- ✅ **Reset script** for testing — tears down + rebuilds admin config (staging/dev only, refuses to run in prod)
- ✅ Admin roles: super_admin + admin (2 tiers)
- ✅ Placeholder super-admins: to be decided by committee (recommend Sayantan + 1 committee member)
- ✅ Placeholder admins: whoever the committee assigns as treasurer + secretary
- ✅ Zelle verification cadence: recommend twice daily during Pujo peak, once daily otherwise

### Content

- ✅ Team members list, sponsors list, executive committee list — all to be provided by admin via dashboard (placeholder data during dev)
- ✅ Founding history, mission statement — placeholder in v1, admin edits later

### Legal / privacy

- ✅ No formal Terms of Service / Privacy Policy in v1 (committee decision — close-knit community)
- ✅ Basic "Data handling" footer link with plain-language summary
- ✅ Tax receipt language: not needed in v1
- ✅ Background checks on admins: not required
- ✅ Data retention: default 3 years for guest PII, 7 years for donation records (technical default, revisitable)

### Domain & branding

- ✅ Domain: `pragatiphilly.org` recommended — needs to be purchased in Stage 0
- ✅ Logo: use existing SVG from prototype until an official file is provided
- ✅ Brand colors: use existing agreed palette (marigold, sindoor, indigo, cream)

---

## 🟡 To confirm before public launch (Aug 2026)

A shortlist that Sayantan will walk the committee through one more time before turning on public Durga Pujo ticket sales:

1. **Final Durga Pujo 2026 ticket prices** — replace the placeholder numbers above with cultural-committee-approved figures
2. **Which member-discount mode is active** — per_adult or whole_family — before members buy their first tickets
3. **Zelle recipient display name test** — treasurer sends themselves a $1 Zelle from a different bank; confirms the display says "Pragati" not their personal name
4. **Square account sanity check** — a $1 sandbox purchase completes end-to-end successfully
5. **Email deliverability test** — send 20 test emails from Gmail to a mix of Gmail/Outlook/Yahoo addresses; confirm inbox delivery (if any land in spam, execute the v1.5 domain upgrade before launch)
6. **Two admin volunteers named** — the two people who will verify Zelle payments daily during Pujo weeks
7. **Refund policy text approved** — the exact one-paragraph statement that will appear at checkout and in the ToS footer
8. **Executive committee 2026 photos + roles** — collected and ready to upload
9. **Sponsors 2026 list confirmed** — logos + tiers + website URLs ready

---

## ⏳ Deferred to v2

Explicitly out of scope for v1, to be revisited after Durga Pujo 2026:

- Member directory + opt-in privacy toggle
- Self-serve membership renewal + expiry visibility
- Member payment history dashboard
- Lifetime membership tier
- Auto-renewal of memberships
- Recurring donations
- Donor tiers, donor recognition on the website, annual giving statements
- Tax receipt generation
- Website-managed refunds
- Two-adult separate logins in one family
- Digital magazine sales / PDF distribution
- Native iOS/Android app
- Bengali UI translation
- Volunteer scheduling
- Vendor management
- Seating chart / seat assignment
- Community forum / member chat
- Formal Terms of Service and Privacy Policy (defer until org grows or legal need arises)
- Newsletter / marketing email
- SMS notifications
- Background checks on admin volunteers
- Multi-currency support
- Multi-org / white-label
