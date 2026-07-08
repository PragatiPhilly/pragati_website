# Roadmap

Week-by-week plan from October 2026 to Durga Pujo 2026 launch (October 16–18, 2026). All dates are *target* not commitment — slippage is expected.

## Phases at a glance

| Phase | Weeks | Deliverable |
|---|---|---|
| Stage 0: Foundations | 2 weeks | Decisions, accounts, project scaffold |
| Stage 1: Public site | 2 weeks | Pragati visitor site in Next.js, themes working |
| Stage 2: Admin foundation | 2 weeks | Admin login, content management |
| Stage 3: Members | 3 weeks | Member registration, profile, directory |
| Stage 4: Events & tickets | 4 weeks | Event configurator, Stripe checkout, tickets, emails |
| Stage 5: Polish & ops | 2 weeks | Refunds, check-in, audit log, backups |
| Stage 6: Hardening | 2 weeks | Load test, security review, accessibility audit |
| Buffer | 2 weeks | Whatever's behind |
| **Soft launch (Saraswati Pujo)** | February 2026 | Member registration goes live with real users |
| **Public launch** | August 2026 | Durga Pujo 2026 registration opens |
| **Durga Pujo** | October 16–18, 2026 | Live event, check-in works |

## Stage 0: Foundations (Oct 28 – Nov 11, 2026)

**Goal:** decisions locked, accounts created, project scaffolded.

Tasks:
- [ ] Executive committee approves spec ([00-executive-summary.md](./00-executive-summary.md))
- [ ] Treasurer confirms existing Square account is active + 501(c)(3) status; shares API keys via 1Password
- [ ] Treasurer confirms Zelle recipient `pragati.management@gmail.com` shows as "Pragati" in the Zelle app — test with a $1 send from another bank
- [ ] Pragati buys a domain (recommended `pragatiphilly.org`) — used for the site URL. Sending email deferred to v1.5.
- [ ] Sayantan creates GitHub repo (private)
- [ ] Sayantan creates Vercel project, links repo, deploys hello-world Next.js
- [ ] Sayantan creates Supabase project (free tier to start), runs initial migration with schema from [03-data-model.md](./03-data-model.md)
- [ ] Sayantan creates Resend account, uses Gmail SMTP relay for launch (verified domain deferred to v1.5)
- [ ] Sayantan creates Cloudflare R2 bucket for image storage
- [ ] All API keys stored in Vercel environment variables (never in git)
- [ ] Set up Sentry (or similar) for error monitoring
- [ ] Answer all questions in [11-open-questions.md](./11-open-questions.md)

**Exit criteria:** A deploy-on-push pipeline from GitHub → Vercel works. Database is reachable. **Square sandbox works end-to-end** (test card succeeds, webhook fires). Zelle recipient tested with a real $1 send that appears with correct display name. Test email sends and lands in inbox.

## Stage 1: Public site (Nov 12 – Nov 25, 2026)

**Goal:** the existing HTML prototype is now a real Next.js site.

Tasks:
- [ ] Port `pragati.html` into Next.js as `app/page.tsx`
- [ ] Move CSS to Tailwind + CSS modules where needed; preserve theme system
- [ ] Three themes (Durga / Kali / Saraswati) work via React context + cookies (no more localStorage)
- [ ] All SVG illustrations ported as React components for reusability
- [ ] About / Sponsors / Team / Magazine (static message + cover gallery) / Contact pages built as static routes
- [ ] Lighthouse mobile + desktop scores ≥ 90
- [ ] Cloudflare in front of Vercel for DDoS protection
- [ ] Site deployed to staging at `staging.pragatiphilly.org`
- [ ] Old static `.html` files archived

**Exit criteria:** Anyone with the URL can browse the site. Looks identical to the prototype. Theme switching via URL query param (`?theme=kali`) for testing.

## Stage 2: Admin foundation (Nov 26 – Dec 9, 2026)

**Goal:** real admin login. Admins can change the active theme + edit content.

Tasks:
- [ ] User authentication wired up (Supabase Auth: email + password)
- [ ] "Forgot password" flow (email reset link)
- [ ] Role-based middleware (`requireRole('admin')`)
- [ ] Admin layout at `/admin/*` (different navbar, different design language)
- [ ] Admin dashboard home page with summary metrics
- [ ] Admin → Site Settings: theme toggle (replaces the prototype's localStorage admin)
- [ ] Admin → Team Members: CRUD with photo upload
- [ ] Admin → Sponsors: CRUD with logo upload
- [ ] Admin → Magazine covers: upload historical magazine cover images for the gallery (no PDF distribution in v1)
- [ ] Audit log writes on every admin write
- [ ] First admin account created manually via Supabase SQL editor (Sayantan, super-admin)
- [ ] Sayantan invites 1 committee member as test admin

**Exit criteria:** Committee member can log in, change the theme, upload a sponsor, see the change live on the public site within seconds.

## Stage 3: Members (Dec 10, 2026 – Jan 5, 2026)

**Goal:** members can register, pay annual dues, manage their profile.

Tasks:
- [ ] Member signup form with all fields from [03-data-model.md](./03-data-model.md)
- [ ] Stripe Checkout integration for annual dues
- [ ] Stripe webhook handling (payment_intent.succeeded creates member)
- [ ] Welcome email after successful signup with password-setup link
- [ ] Password setup flow
- [ ] Member login + member dashboard at `/m/*`
- [ ] Profile management: edit contact, add/remove family members
- [ ] Food preferences UI
- [ ] Member directory (opt-in)
- [ ] Membership renewal flow (manual click — auto-renewal v2)
- [ ] Admin → Members list with search, filter, CSV export
- [ ] Admin → Add Member manually (for offline payments)
- [ ] Admin → Edit any member
- [ ] Admin → Mark member as expired / lifetime
- [ ] Soft delete + GDPR data-deletion flow
- [ ] Member can change own email (with verification)

**Exit criteria:** A new family can register from scratch, pay $35, get a welcome email, set password, log in, add family details, see themselves in the directory. An admin can see them in the admin list.

## Stage 4: Events & tickets (Jan 6 – Feb 9, 2026)

**Goal:** the big one. Events configured, tickets sold, payments collected, receipts emailed.

Tasks:
- [ ] Admin → Events list
- [ ] Admin → Create / edit event with full configurator (see [01-roles-and-scope.md](./01-roles-and-scope.md))
- [ ] Admin → Configure ticket types (multiple per event)
- [ ] Admin → Create promo codes
- [ ] Admin → Upload event poster (with auto-resize via Sharp)
- [ ] Public event page renders configured event
- [ ] Visitor / member can register and select tickets
- [ ] Family ticket selector: pick which family members attend, age-based pricing applied
- [ ] Cart with subtotal / promo discount / total
- [ ] Stripe Checkout for tickets
- [ ] Webhook creates registration + tickets + QR codes
- [ ] Email: receipt + tickets (PDF attachment with QR codes)
- [ ] Email: admin alert ("new registration for Durga Pujo")
- [ ] Capacity tracking: prevent overselling
- [ ] "Sold out" UI when capacity reached
- [ ] Member sees own ticket history at `/m/tickets`
- [ ] Admin sees per-event registration list with status

**Exit criteria:** Saraswati Pujo 2026 can be configured by an admin and sold to members and non-members. End-to-end test: a real person buys a ticket with a real test card.

## Soft launch: Saraswati Pujo (Feb 14, 2026)

This is the **first real-world test** with low stakes. Saraswati Pujo is small (maybe 50–100 attendees), warmly attended by existing members. Use this to:

- Surface UX issues
- Validate the payment + ticket flow with real members
- Build confidence with the committee
- Collect feedback before Durga Pujo

## Stage 5: Polish & ops (Feb 15 – Feb 28, 2026)

**Goal:** the operational features that aren't critical but make life much easier.

Tasks:
- [ ] Refund flow: admin can full/partial refund a registration; Stripe refund + email
- [ ] Cancel registration (with optional refund)
- [ ] Admin → Bulk email to event attendees / all members
- [ ] Audit log viewer for super-admins
- [ ] Check-in mode: admin scans QR codes on a phone/tablet, marks attendees present
- [ ] Real-time check-in counts dashboard
- [ ] Member can download tickets as PDF or Apple/Google Wallet pass
- [ ] Admin can reprint a ticket
- [ ] Daily automated DB backup tested with restore

## Stage 5.5: Email domain upgrade (Feb 28 – Mar 3, 2026) — recommended

**Goal:** move system email off `pragati.management@gmail.com` and onto `noreply@pragatiphilly.org` for reliable Durga Pujo bulk-email deliverability.

Tasks:
- [ ] Confirm domain purchased in Stage 0 is `pragatiphilly.org` (or chosen alternative)
- [ ] Add DKIM record to DNS (Resend provides the value)
- [ ] Add SPF record to DNS
- [ ] Add DMARC record to DNS (start with `p=none` for monitoring)
- [ ] Verify domain in Resend dashboard
- [ ] Change `system_config.system_email_from` to `noreply@pragatiphilly.org`
- [ ] Keep `system_email_reply_to` as `pragati.management@gmail.com`
- [ ] Send a batch of 20 test emails to a mix of Gmail/Outlook/Yahoo inboxes; verify none land in spam
- [ ] Update DMARC to `p=quarantine` after 30 days of monitoring

**Exit criteria:** test emails to Gmail, Outlook, Yahoo all land in Primary/Inbox (not spam/Promotions). Bounce rate on a 20-email test batch is 0.

This stage is *technically optional* (v1 launches with Gmail sending), but strongly recommended before public Durga Pujo ticket sales begin. Estimated effort: half a day.

## Stage 6: Hardening (Mar 1 – Mar 14, 2026)

**Goal:** ready for 500+ people hitting it at once.

Tasks:
- [ ] Load test: simulate 200 concurrent registrations
- [ ] Security review with checklist from [08-security-and-privacy.md](./08-security-and-privacy.md)
- [ ] Accessibility audit (WCAG AA)
- [ ] Mobile UX testing on iOS Safari + Android Chrome
- [ ] Cross-browser smoke test
- [ ] Performance: every page < 2s on 3G
- [ ] Cloudflare Turnstile on public forms
- [ ] Rate limiting on auth endpoints
- [ ] Penetration test (consider hiring a one-day pen-tester from Cobalt or similar)

## Buffer (Mar 15 – Mar 28, 2026)

Whatever's behind goes here. Always behind.

## Stage 7: Member ops & content (Apr – Aug 2026)

Quieter months. Use them for:
- Importing existing member data (the "Life Members" list from the old site, current members from spreadsheets)
- Recording past-event galleries
- Uploading historical magazine **cover images** for the gallery (no PDFs in v1)
- Training the executive committee on the admin dashboard
- Writing help docs / FAQs

## Public launch: Durga Pujo 2026 registration (Aug 1, 2026)

The big announcement. Newsletter goes out, social media posts, member-only early-bird period, then public sales.

## During Durga Pujo (Oct 16–18, 2026)

Sayantan on-call. Volunteers staffing check-in tablets. Watch dashboards.

## Post-event (Oct 21, 2026)

- Thank-you email to attendees
- Gallery upload
- Finance reconciliation with Pragati treasurer
- Retrospective: what to improve for 2026

## Critical path

The single most schedule-sensitive item is **confirming Square + Zelle payment plumbing**. Square account should already exist — the risk is that the account is POS-only, has stale bank linkage, or its API is disabled. Verify in Stage 0. Zelle setup is quick but the display-name check requires a real bank transfer to test.

The second-most sensitive item is **getting the executive committee to make the open-question decisions** in [11-open-questions.md](./11-open-questions.md), especially event pricing tiers. If those drag past December, Stage 4 starts late.

The third is **committee training on the Zelle verification workflow**. Unlike Stripe, this is a real daily task — treasurers need to be comfortable with the pending queue and the "mark paid" flow.

## Out of scope for v1

Saved for v2 / future:
- Auto-renewal of memberships (v1 has no expiry concept at all)
- Membership expiry visibility for members + renewal reminders
- Member directory + opt-in privacy
- Self-serve payment history for members
- Recurring donations
- Donor tiers, annual giving statements, donor recognition on the website
- Refund handling via the website (v1: all refunds offline by exec committee)
- Two-adult logins per family (spouse gets their own login)
- Native iOS/Android app
- Forum / chat
- Bengali UI
- Volunteer scheduling
- Vendor management
- Seating chart

## In v1 (added on committee feedback in Nov 2026)

- Square + Zelle dual payment rails
- Guest checkout for tickets (no account required)
- Guest lookup page (email + confirmation number)
- Donations page with "in honor / in memory of"
- Mixed ticket types per family on one order
