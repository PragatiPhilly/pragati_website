# Executive Summary

**For:** Pragati Executive Committee
**About:** A new Pragati event platform — production website + member system + event registration + Stripe payments
**Prepared:** October 2026

## What we're building

A modern, secure web platform that does five things:

1. **The public Pragati website** — a beautiful homepage celebrating Bengali culture, with theme support for Durga Pujo, Kali Pujo, and Saraswati Pujo.
2. **Member management** — families register, pay annual dues, manage their profile (family members, food preferences, contact info). No community/directory features in v1.
3. **Event registration with online payment** — admins configure events (Durga Pujo 2026, Saraswati Pujo, etc.) with custom ticket structures, prices, capacity, and promo codes. Members and non-members register (**no account required for non-members**), pay via **Square or Zelle**, and receive emailed tickets with QR codes.
4. **Donations page** — one-time donations with "in honor / in memory of" fields. Same Square + Zelle payment rails.
5. **Admin dashboard** — executive committee members log in to manage members, configure events, upload posters, monitor registrations and payments, verify Zelle deposits against bank feed, and check people in at events.

**Refunds are intentionally out of scope for the website.** All refund requests are handled offline by the executive committee, case by case. Terms of Service will state that all sales are final.

## Why this matters

Today, Pragati operates with a static 2012-era website, paper or PDF forms, and offline payment collection. As Pragati has grown to 80+ families and 200+ active members, this manual approach is breaking down. The risks today:

- **Lost registrations** — paper forms get misplaced
- **Payment friction** — members write checks, call the treasurer, mail money. Many give up.
- **No member directory** — no way to look up who's a member or contact them
- **No event capacity tracking** — sold-out situations handled informally
- **Manual admin work** — every registration requires a human to enter data
- **No reach beyond the existing community** — the website doesn't attract new families

This platform fixes all of that while preserving the warmth and cultural identity Pragati is known for.

## What it will cost

**Software cost (recurring):** $25–$75/month for hosting, database, email, and image storage.

**Payment fees:**
- **Square (card):** 2.6% + 10¢ per transaction. A $35 family membership becomes ~$33.99 net. A $80 Durga Pujo ticket becomes ~$77.82 net.
- **Zelle (bank transfer):** **$0** — no fees. Members paying by Zelle donate 100% of the transaction to Pragati.

Encouraging Zelle for larger amounts (dues renewals, donations) meaningfully reduces annual fee expense.

**Development cost:** Sayantan is building it. No external developer fees.

**Domain & SSL:** $15/year for a domain (e.g., `pragatiphilly.org`), SSL is free via Vercel.

**Total annual operational cost:** approximately $400–$1,000 depending on traffic, email volume, and Square-vs-Zelle payment mix. Well within the operating budget of a 200-member non-profit.

## What we need from the executive committee

1. **Approval to proceed** with the architecture and rough cost outlined above.
2. **Square account confirmation** — treasurer confirms the existing account is active and shares API keys with Sayantan securely.
3. **Zelle recipient setup** — treasurer confirms Pragati's Zelle recipient email (`treasurer@pragatiphilly.org` recommended) and that its display name in the Zelle app shows as "Pragati" (not an individual's name).
4. **A domain name** purchased under Pragati (likely `pragatiphilly.org` or similar).
5. **Decisions on policy questions** documented in [Open Questions](./11-open-questions.md) — pricing tiers, member benefits, refund handling policy (offline), etc.
6. **Two admin volunteers** from the committee who will be trained on the dashboard and serve as primary admins, including for **daily Zelle verification duty**.

## What this is *not*

- **Not a financial accounting system.** Pragati's existing accounting (QuickBooks or similar) remains the system of record for finances. This platform produces transaction reports that the treasurer reconciles monthly.
- **Not a CRM.** We're not building customer-relationship-management features. No member directory in v1.
- **Not a community discussion forum.** No comments, no chat. If members want a Slack/WhatsApp group, that lives outside this platform.
- **Not an event-day operational tool** beyond QR check-in. Vendor management, volunteer coordination, food ordering all stay in spreadsheets/email/WhatsApp.
- **Not a refund system.** All refund requests are handled offline by the executive committee. Terms of Service state all sales are final.
- **Not a membership renewal reminder system in v1.** Membership status is `active` or `inactive`, managed manually by admin. Future v2 may add expiry + renewal reminders.

## Timeline

| Milestone | Target |
|---|---|
| Spec approved by board | Late October 2026 |
| Stripe + domain set up | Early November 2026 |
| Static site + admin login live (Stage 1–2) | December 2026 |
| Member registration live (Stage 3) | February 2026 — Saraswati Pujo as soft launch |
| Event registration + payments live (Stage 4) | April–May 2026 |
| Full rehearsal with executive committee | July 2026 |
| **Public launch for Durga Pujo 2026 registration** | August 2026 |
| **Durga Pujo 2026** | October 16–18, 2026 |

## Risks

| Risk | Mitigation |
|---|---|
| Zelle deposit arrives but admin forgets to mark it paid | Dashboard highlights pending > 24 hours. Automated email nudge to treasurer daily if any pending. |
| Buyer forgets to include confirmation number in Zelle memo | Prominent copy button + warning. Treasurer contacts them if orphaned deposit appears. |
| Attacker claims to have sent Zelle payment without doing so | Admin visual-verifies in bank feed before marking paid. Audit log captures who marked what. |
| Square chargeback | Clear terms + email receipts + Square dispute tools |
| Database loss | Daily automated backups + tested restore procedure |
| Single developer (Sayantan) burnout or unavailability | Code in a private repo shared with super-admins. Managed services with no manual ops. |
| Members confused by new system | Soft-launch at Saraswati Pujo with low stakes. Provide email + phone support during Durga Pujo launch week. |
| Payment failure during peak registration | Square is a top-tier processor. Webhooks + polling ensures no double-charges. Zelle is bank-native so no processor risk. |
| PII breach | No card data ever stored by us (Square handles). Member PII stored in encrypted DB with row-level security. Guest data anonymized after 3 years. |
| Spam/bot registration attacks | Rate limiting + Cloudflare Turnstile on all public forms including lookup + donation. |
| Guest lookup enumeration | Confirmation numbers include random suffix. Rate-limited per email + per IP. |
| Site goes down during Pujo | Vercel + Supabase have 99.99% uptime SLAs. Static pages cached globally. |

## Decision needed

After reading this and the [Open Questions](./11-open-questions.md), the executive committee should make a single decision:

**Approve / Approve with changes / Defer**

If approved, the next concrete action is the treasurer setting up Stripe under Pragati's 501(c)(3) and Sayantan beginning Stage 1 development.
