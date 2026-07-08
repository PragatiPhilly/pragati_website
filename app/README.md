# Pragati — Event Platform

Public site + admin for Pragati (Bengali Association of Greater Philadelphia).
Spec lives in `../spec/`; all guides in [`docs/`](./docs/); build history in `../archive/BUILD-PLAN.md`.

**👉 New here? [docs/TESTING.md](./docs/TESTING.md) is the complete local setup + step-by-step testing walkthrough.**

## Run it

```bash
npm install                       # then `npm audit` → 0 vulnerabilities
cp .env.example .env.local        # already done if you see .env.local
npm run db:push                   # create the database schema (embedded PGlite)
npm run seed                      # config defaults + demo data + Durga Pujo 2026
npm run dev                       # → http://localhost:3000
```

Do NOT run `npm audit fix --force` — deps are already pinned to zero-vulnerability versions and forcing "fixes" installs broken major versions. If you did: `rm -rf node_modules package-lock.json .next && npm install`.

Optional: `npx tsx scripts/smoke-seed.ts` creates two sample registrations (one pending Zelle, one Square) so the admin queue has something in it. Run it while the dev server is **stopped** — the embedded DB is single-connection.

## Test accounts (seeded)

| Who | Email | Password |
|---|---|---|
| Super admin | sayantankundu93@gmail.com | pragati-admin-2026 |
| Demo member family | member.demo@example.com | member-demo-2026 |

## The important URLs

- `/` — animated homepage: painterly Durga-family scene (parallax, petals, fireflies), ritual vignettes, countdown
- `/register` — the conversational registration flow (guest + member, live promo codes)
- `/register?mode=dayof` — day-of walk-in kiosk (big buttons, pay-at-counter, idle auto-reset)
- `/donate`, `/lookup` (scannable QRs + print), `/signup`, `/events/durga-pujo-2026`
- `/m` — member area: dashboard, family manager (feeds registration prefill), tickets, profile
- `/admin` — dashboard · **Zelle queue** · registrations (CSV export, nightly email backup + super-admin restore) · donations · members · event editor · **scan desk & scan setup** (entry check-in + once-per-window food scans with color codes) · kitchen · photos · **magazines** (yearly PDF uploads) · email log · audit log · settings
- `/pay/square-simulator` — test-mode stand-in for Square's hosted checkout
- `/api/cron/sweep` — releases expired seat holds (also runs on admin dashboard loads)

## How test mode works

`.env.local` ships with `APP_ENV=test` and `PAYMENTS_MODE=test`:

- **Email** — logged to the server console + `email_log` table; every recipient is redirected to `TEST_EMAIL_OVERRIDE` (currently Sayantan's email). Set `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` for real sending.
- **Zelle** — fully real flow (it's manual by nature). Recipient email/display name come from **Admin → Settings** — currently the test address; change it there when the org account is ready. No redeploy.
- **Square** — checkout redirects to our sandbox simulator, which fires a **signature-verified webhook** at the same endpoint production Square will use. Flip `PAYMENTS_MODE=live` + add `SQUARE_*` keys to go real; no code changes.

## Tests

```bash
npm test    # 16 tests: pricing engine, webhook signatures, full checkout state machine
```

## Going to production (v1.5 checklist)

1. Supabase Postgres → set `DATABASE_URL` (schema is plain Postgres; `drizzle-kit push` against it)
2. Real Square keys + webhook registration, `PAYMENTS_MODE=live`
3. Resend + `pragatiphilly.org` domain (DKIM/SPF), `EMAIL_PROVIDER=resend`, `APP_ENV=production`
4. Change Zelle recipient + treasurer emails in Admin → Settings
5. Rotate `SESSION_SECRET` and the seeded admin password
6. Reservation-expiry cron (release stale holds) + R2 image pipeline + PDF tickets with QR images
