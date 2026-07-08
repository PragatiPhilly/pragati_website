# Pragati Event Platform — Specification

This folder contains the complete written specification for the Pragati event platform — a real, production-ready web application for the Bengali Association of Greater Philadelphia.

Read these in order. Each document is self-contained but assumes you've read the earlier ones.

## Documents

| # | Document | Audience | Purpose |
|---|---|---|---|
| 00 | [Executive Summary](./00-executive-summary.md) | Board / Exec Committee | One-pager: what, why, cost, timeline, risks |
| 01 | [Roles & Scope](./01-roles-and-scope.md) | All | Who uses the site and what they can do |
| 02 | [Product Flows](./02-product-flows.md) | Developer | Every screen, every form, every user journey |
| 03 | [Data Model](./03-data-model.md) | Developer | Postgres schema, every table, every column |
| 04 | [API Design](./04-api-design.md) | Developer | Every endpoint with request/response shape |
| 05 | [Payments (Square + Zelle)](./05-payments.md) | Developer + Treasurer | Two payment rails, admin verification for Zelle, no refunds |
| 06 | [Emails & Notifications](./06-emails-and-notifications.md) | Developer | Every email sent, when, to whom, template |
| 07 | [Image Pipeline](./07-image-pipeline.md) | Developer | Upload, resize, store, serve |
| 08 | [Security & Privacy](./08-security-and-privacy.md) | All | Auth, RBAC, PII, backups, ToS, GDPR |
| 09 | [Architecture & Stack](./09-architecture-and-stack.md) | Developer | Next.js / Supabase / Stripe / Resend / R2 |
| 10 | [Roadmap](./10-roadmap.md) | All | Week-by-week from today to Durga Pujo 2026 |
| 11 | [Open Questions](./11-open-questions.md) | Decision-makers | Things only Pragati can decide |
| 12 | [Zelle Sample Flow](./12-zelle-sample-flow.md) | All | Concrete end-to-end walkthrough of a Zelle payment — training aid for admins |
| 13 | [Admin Bootstrap & Reset](./13-admin-bootstrap.md) | Developer | Bootstrap script for first admins + reset script for testing |

## Status

This specification is the **product of conversation between Sayantan and Claude** in October 2026. Decisions captured here:

- Builder: Sayantan (with Claude as pair)
- Timeline: Spring/Summer 2026 internal v1, public launch Durga Pujo 2026 (Oct 16–18)
- Approach: Full spec & design first, then build
- Org liability: Pragati 501(c)(3) takes on Stripe, ToS, PII
- Login: email + password
- Family model: one account per family
- Ticketing: both per-person and per-family supported, admin picks per event
- Payments: **Square (existing) + Zelle** side by side. No Stripe.
- Zelle recipient email: `pragati.management@gmail.com` (display name "Pragati")
- Refunds: **not handled by the website** — case-by-case by executive committee, offline, no cutoff
- Guest checkout: **login not required** to buy tickets or donate
- Guest lookup: email + confirmation number on a public /lookup page
- Membership expiry: **no expiry concept in v1** — admin manages membership offline
- Community features (member directory, opt-in): **removed from v1**
- Renewal features (self-serve renewal, expiry visibility, payment history): **removed from v1**
- Family ticketing: buyer can mix ticket types per family member (dad 3-day, mom Saturday only, kid child pass)
- Family composition: persistent on account + per-event override at checkout
- Member discount: **30%, configurable per_adult or whole_family mode** (default per_adult)
- Adult age: 18+
- Donations page: **in v1**, with "in honor / in memory of" honoree fields, no anonymous, no tax receipts
- Magazine: sold physically at Pujo counter — no digital PDF distribution in v1
- Sending email: `pragati.management@gmail.com` for launch — v1.5 upgrade to domain-based sending recommended before public Durga Pujo launch
- Food prefs: `veg` / `non_veg` / `kid` only
- Admin roles: bootstrap script for initial setup + reset script for testing (staging only)
- ToS / Privacy Policy: deferred; basic "Data handling" note in footer instead
- Domain: `pragatiphilly.org` recommended (to be purchased in Stage 0)

## How to use this spec

1. **Read 00** first — share with the board for approval.
2. **Read 01–02** to understand what we're building.
3. **Read 03–07** to understand how it works under the hood.
4. **Read 08–09** to understand operations and stack.
5. **Read 10** to understand sequencing.
6. **Read 11** and answer the open questions.
7. When all open questions in 11 are resolved, this spec is "ready to build."

## How to give feedback

This is a living document. Suggested workflow:

- Read a doc end-to-end before commenting (don't react to the first paragraph).
- Disagreements go in comments / chat — we'll discuss before changing the spec.
- Resolved questions move from "Open Questions" into the relevant doc.
- Once a doc is "final" we tag it `[FINAL]` at the top.

## What this spec does *not* cover

Out of scope intentionally:

- Marketing strategy / outreach to members
- Bank account setup beyond Stripe linkage
- Insurance for the organization
- Venue contracts
- Content writing (the actual text on the website beyond placeholder copy)
- Visual design beyond what's already in the prototype (`pragati.html`)

These are real concerns — but they belong to the org's operations, not the software spec.
