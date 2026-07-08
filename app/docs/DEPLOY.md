# Deploying Pragati to Vercel

The app builds clean and is production-ready once the environment below is set.
Everything falls back to safe dev behavior locally (PGlite, console email,
simulated payments, files in `public/`).

## 1. Required environment variables (Vercel → Settings → Environment Variables)

| Variable | What / why |
|---|---|
| `DATABASE_URL` | Postgres connection string (Neon / Supabase / Vercel Postgres). **The app refuses to boot on Vercel without it** — the embedded PGlite DB is dev-only. Use the *pooled* connection string if the provider offers one. |
| `SESSION_SECRET` | `openssl rand -base64 32`. The app hard-fails in production without it (the dev fallback would let anyone forge admin sessions). |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.org` — used in emails, QR links, Square redirects, webhook signature checks. |
| `APP_ENV` | `production` (turns off the test email override). |
| `RESEND_API_KEY` + `RESEND_FROM_EMAIL` | Emails silently log to console without it. Verify the org domain in Resend so mail isn't sent from `onboarding@resend.dev`. |
| `BLOB_READ_WRITE_TOKEN` | Vercel dashboard → Storage → Blob → connect store to the project (token is injected automatically). Needed for photo uploads and magazine PDFs — the Vercel filesystem is read-only. |
| `PAYMENTS_MODE` | `live` for real payments. Keep `test` on preview deployments; the simulator page 404s automatically in live mode. |
| `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENV=production` | Live Square Payment Links. |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | From the Square webhook subscription. In live mode webhooks are **rejected** if this is missing (prevents forged "paid" events). |
| `CRON_SECRET` | Optional but recommended — protects `/api/cron/sweep`. Vercel Cron sends it automatically. |

## 2. Database setup

Tables are created from `src/db/schema.ts`:

```bash
DATABASE_URL=postgres://… npx drizzle-kit push
```

(The newer tables — `scan_sessions`, `ticket_scans`, `magazines`, media/contact —
also self-create at runtime, so a plain `drizzle-kit push` of the older schema
is enough to get started.)

Seed an admin user + active event, or insert them manually — `src/db/seed.ts`
is written for dev and seeds demo data; don't run it as-is against production.

## 3. Square webhook

Square Developer dashboard → Webhooks → subscribe `payment.updated` to
`https://your-domain.org/api/webhooks/square`, then copy the signature key
into `SQUARE_WEBHOOK_SIGNATURE_KEY`.

## 4. Cron

`vercel.json` schedules two jobs (nothing to do beyond setting `CRON_SECRET`):

- `/api/cron/sweep` every 15 minutes — releases expired Zelle/Square reservations.
- `/api/cron/backup` at 03:00 UTC (11 PM Eastern in summer, 10 PM in winter —
  Vercel crons run in UTC) — emails the full registration dataset as a CSV to
  the `backup_email` address (Admin → Settings; default
  pragati.management@gmail.com). Disaster recovery: Admin → Registrations →
  "Restore from backup CSV" (super admin) re-imports that file into a fresh
  database without touching existing rows.

## 5. After first deploy — Admin → Settings

These defaults ship pointing at test values; change them in the UI (no redeploy):

- `zelle_recipient_email` — currently a personal test address
- `system_email_from` / `system_email_reply_to` / `treasurer_notification_email` / `admin_alert_email`
- `active_event_slug`

## 6. Event-day features

- **Admin → Scan setup**: enable breakfast/lunch/dinner windows per event day,
  open/close them live, set veg / non-veg / kid color codes.
- **Admin → Scan desk**: one screen for entry check-in + food scans. Each QR
  works once per window; repeats get a full-width red flag.
- **Admin → Magazines**: upload each year's PDF; the homepage magazine section
  opens a year-picker popup for visitors to download.
