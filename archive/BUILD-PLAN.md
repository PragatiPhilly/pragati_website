# Pragati Platform — Build Plan

**Date:** July 1, 2026 · **Status:** ✅ Phases 0–6 BUILT + Milestone 2 complete — app lives in `app/`, see `app/README.md` to run it
**Verified:** 16 unit/flow tests green · production build green · authenticated smoke: every public, member, and admin page 200 · webhook signature + idempotency + payment confirmation verified end-to-end

**Milestone 2 (Jul 1) added:**
painterly animated Durga-with-children hero scene (dusk sky, parallax, petals, fireflies, diyas) + ported Kali/Saraswati scenes and ritual vignettes · member area `/m` (dashboard, family CRUD that feeds registration prefill, ticket history, profile + password) · admin event editor (create/edit with auto-generated days, ticket types, promo codes) · scannable QR codes (`/api/qr/…`) + printable ticket sheets · live promo validation in the register flow · day-of kiosk idle auto-reset · expired-reservation sweeper (admin-load + `/api/cron/sweep`) · admin email-log & audit-log viewers · page transitions + themed 404

**Known v1 simplifications:** membership dues shown as Zelle instructions + admin "Activate" (no payment record row) · password reset via admin (no self-serve email flow yet) · image uploads (posters/logos) are URL fields until the R2 pipeline lands
**Source of truth:** `spec/` folder (00–13). This file is the execution plan.

---

## What we're building

One Next.js app, two faces:

1. **Public site** — themed (Durga / Kali / Saraswati), animated, warm. Home, events, donate, guest lookup, membership signup.
2. **Registration experience** — NOT a form. A conversational, one-question-at-a-time flow with smooth transitions. Works for **members** (prefilled), **non-members/guests**, and **impromptu day-of walk-ins** (kiosk mode at the venue).
3. **Admin site** (`/admin`) — genuinely powerful: dashboard with live metrics, pending-Zelle verification queue, event + ticket-type builder, registrations, members, check-in, and a settings screen where nearly everything is configurable.

## Key decisions (deltas from spec, made for buildability)

| Area | Spec said | We're doing | Why |
|---|---|---|---|
| DB | Supabase Postgres | **Drizzle ORM + Postgres schema, PGlite (embedded Postgres) for dev/test** | Runs anywhere with zero setup; `DATABASE_URL` swap to Supabase for prod — same schema, same queries |
| Auth | Supabase Auth | **Own email+password (scrypt) + signed session cookies** | Portable, no vendor dependency; swap later if desired |
| Payments | Square + Zelle | Same, but **both in test mode**: Square sandbox stub + simulated Zelle | User asked for sample test flows first |
| Email | Resend | **Provider abstraction**: console-log in dev, Resend when key set; test mode redirects ALL mail to `TEST_EMAIL_OVERRIDE` | Test with Sayantan's email now, reconfigure later |

## Config-first principle

Everything an org officer might change lives in config, not code:

- **`.env` / `.env.example`** — secrets + environment switches (`PAYMENTS_MODE=test`, `TEST_EMAIL_OVERRIDE=sayantankundu93@gmail.com`)
- **`src/config/site.ts`** — org name, contact, nav, socials, theme default
- **`system_config` DB table** — runtime-editable from Admin → Settings: Zelle recipient email + display name, membership price, member discount % and mode, active event/theme, SLA hours, email from/reply-to, treasurer alert email
- Zelle recipient starts as `sayantankundu93@gmail.com` → later changed to the org email in Admin Settings, no deploy needed.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 · Drizzle ORM · PGlite→Postgres · Framer Motion (registration + page animations) · Zod · React Hook Form · Vitest · custom auth (scrypt + jose sessions)

Design system lifted from `pragati.html` prototype: Fraunces / Cormorant Garamond / Inter / Tiro Bangla, marigold–sindoor–terracotta palette, three theme variants driven by `data-theme` on `<html>`.

---

## The registration experience (Phase 3 — the centerpiece)

A guided conversation, one card at a time, progress petals at top, smooth slide/fade transitions, back always possible, state kept in a client store and synced to a draft registration server-side.

```
Step 0  Entry     "Welcome! Are you a Pragati member?"  [I'm a member] [I'm new] — or kiosk auto-mode on /register/day-of
Step 1  You       Name + phone (member: prefilled, confirm & go)
Step 2  Party     "Bringing family or friends?" → add people one by one, chips shown as they're added, each with name + adult/kid(+age)
Step 3  Days      Per person (or "same for everyone" shortcut): which days — Fri / Sat / Sun / all three
Step 4  Food      Per person: with food / without food; veg / non-veg; kids auto-suggest kid meal
Step 5  Review    Animated summary card, per-person line items, member discount applied live, promo code
Step 6  Pay       Zelle (instructions + memo + "I've sent it") or Card/Square (sandbox)
Step 7  Done      Confirmation number, tickets on the way, add-to-calendar
```

- Each answer determines the next question (kids → kid meal; "just me" skips party customization; day-of mode skips payment to "pay at counter" + optional Zelle-on-the-spot with QR).
- Members get "Rohan turned 8 — still a kid ticket" style smartness from stored family data.
- Day-of kiosk (`/register/day-of`): large touch targets, auto-reset after idle, only today's tickets.

## Phases

**Phase 0 — Scaffold + config + theme** ✅ when: app boots, themes switch, config loads
**Phase 1 — Data + auth**: full Drizzle schema (spec 03), migrations, seed script (Durga Pujo 2026 event + ticket types + admin + sample member), signup/login/session, RBAC middleware
**Phase 2 — Public site**: animated themed home (hero, countdown, events strip), events list + detail, donate flow, guest lookup, about
**Phase 3 — Registration experience** (above)
**Phase 4 — Payments (test)**: payment provider abstraction; Zelle rail complete (confirmation numbers PRG-YYYY-NNNN / DON-, reservation windows, ack emails); Square rail in sandbox-stub mode (fake hosted page in test, real Square SDK path behind config); webhook endpoint with signature verification + idempotency table
**Phase 5 — Admin**: dashboard metrics, **pending-Zelle queue** (the daily-ops screen: mark paid / cancel, oldest first), events CRUD + ticket-type builder + promo codes, registrations with CSV export, members, donations, check-in page (manual lookup + QR value entry), settings editor for `system_config`, audit log
**Phase 6 — Tests + verification**: Vitest — pricing engine (member discount modes, age bands), Zelle flow state machine, Square webhook idempotency; `next build` green; manual smoke of the full buy path

## Where things live

```
Pragati/
├── spec/            ← unchanged, source of truth
├── BUILD-PLAN.md    ← this file
└── app/             ← the Next.js project
    ├── src/config/          site.ts, defaults for system_config
    ├── src/db/              schema.ts, client.ts (PGlite|pg switch), seed.ts
    ├── src/lib/             auth/, payments/ (square.ts, zelle.ts, provider.ts),
    │                        email/ (console.ts, resend.ts), pricing.ts, confirmation.ts
    ├── src/app/(public)/    home, events, donate, lookup, login, signup
    ├── src/app/register/    the conversational flow (+ /day-of kiosk)
    ├── src/app/admin/       the admin site
    ├── src/app/api/         checkout, webhooks, admin actions
    └── tests/               vitest
```

## Later (not this build)

Real Square production keys · Resend + domain (`pragatiphilly.org`) DKIM/SPF · Supabase prod DB · R2 image pipeline · Sentry/Plausible · PDF tickets with QR images (v1 ships QR codes rendered on lookup page + email; PDF attachment in v1.5)
