# Pragati — Database & Scripts Reference

Everything that lives in the database, every script that touches it, and the
exact steps to go from test data to a clean production launch.

The schema source of truth is `src/db/schema.ts` (Drizzle ORM).
Locally the app runs on embedded PGlite (`./.data/pglite`, zero setup);
in production it runs on real Postgres via `DATABASE_URL` — same schema,
same code path (`src/db/client.ts` picks the driver).

## Tables

### People & accounts

| Table | What it holds |
|---|---|
| `users` | Login accounts: email, password hash (bcrypt-style via `lib/auth/password`), role (`member` / `volunteer` / `admin` / `super_admin`). |
| `members` | One row per member **family**, linked 1-to-1 to a `users` row: family name, primary contact, address, `membership_status` (`pending_payment` → `active` / `inactive`). |
| `family_members` | Spouse/children/dependents of a member family — names, relationship, food preference. Feeds registration prefill. |

### Events & ticketing

| Table | What it holds |
|---|---|
| `events` | Each event: slug, name (English + Bengali), theme, venue, `days` (JSON list of event days), status (`draft`/`published`/`cancelled`/`archived`). |
| `ticket_types` | Price points per event: member/non-member prices, age band, day coverage, capacity + `sold_count`, food inclusion. |
| `promo_codes` | Percent or fixed discounts, usage caps, validity windows. |
| `registrations` | One purchase: confirmation number (`PRG-YYYY-NNNN`), buyer, totals, payment method + status state machine (`pending_payment` → `pending_zelle_verification` → `paid` / cancelled states), Square IDs, reservation expiry. |
| `tickets` | One row per attendee: name, age, food pref, day, price, **`qr_code`** (the pass), entry check-in stamp (`checked_in_at/by`). |

### Event-day scanning

| Table | What it holds |
|---|---|
| `scan_sessions` | Configured scan windows per event: kind (`checkin`/`breakfast`/`lunch`/`dinner`), event day, open/closed status. Unique per (event, kind, day). |
| `ticket_scans` | One row per successful food-line scan. **Unique index on (session, ticket)** = a pass works once per window, enforced by the DB itself. |

### Money & content

| Table | What it holds |
|---|---|
| `donations` | Donations with their own confirmation numbers (`DON-YYYY-NNNN`) and the same payment state machine. |
| `sponsors`, `team_members` | Homepage/about content rows. |
| `media_images` | Uploaded photo metadata (responsive WebP variants; files in Vercel Blob or `public/media` locally). |
| `magazines` | One row per year: title + PDF location (Vercel Blob or `public/magazines` locally). |

### Operations

| Table | What it holds |
|---|---|
| `system_config` | Runtime settings editable in Admin → Settings (org emails, Zelle recipient, prices, backup email, food colors…). Defaults seeded from `src/config/defaults.ts`. |
| `audit_log` | Who did what: check-ins, payments verified, settings changed, backups sent, restores run. |
| `email_log` | Every outbound email (recipient, template, status, provider id, error). |
| `processed_webhook_events` | Square webhook idempotency — each event id processed once. |
| `password_reset_tokens` | Hashed reset/invite tokens with expiry. |
| `counters` | Sequential confirmation-number counters (`PRG-2026`, `DON-2026`). |

Newer tables (`scan_sessions`, `ticket_scans`, `magazines`, `media_images`,
`contact_messages`) also self-create at runtime via `CREATE TABLE IF NOT
EXISTS` (`src/lib/scans/ensure.ts`, `src/lib/media/ensure.ts`), so an older
database upgrades itself without a migration step.

## Scripts

All run from `app/`. With local PGlite, **stop the dev server first**
(single-connection database). Against production, prefix with
`DATABASE_URL=postgres://…`.

| Command | What it does |
|---|---|
| `npm run db:push` | Create/sync the schema from `src/db/schema.ts` (drizzle-kit). Non-destructive for existing data. |
| `npm run seed` | Dev seed: settings defaults, super admin + volunteer + demo member accounts, Durga Pujo 2026 with 7 ticket types and an `EARLYBIRD` promo. **Dev only — don't run against production.** |
| `npx tsx scripts/smoke-seed.ts` | Adds two sample registrations (one pending-Zelle, one Square) so admin queues have data. Dev only. |
| `npm run reset:test-data -- --yes` | **The pre-launch cleanup.** Deletes all registrations, tickets, scans, donations, email/audit logs, webhook records, counters, and demo member accounts. Keeps admins, volunteers, events, ticket types (sold counts → 0), promo codes (uses → 0), scan windows, settings, photos, magazines. |
| `npm run reset:test-data -- --yes --all` | Scorched earth: additionally wipes events, ticket types, promos, scan windows, ALL users, media/magazine metadata, sponsors, team. Settings survive. |
| `node scripts/crawl-audit.mjs <url> …` | Link crawler — visits every internal link as guest/member/admin and reports broken ones. |
| `npm test` | Vitest suite (in-memory DB): checkout state machine, webhook idempotency, pricing, scan-once semantics, backup/restore round trip. |

## Backups & disaster recovery

- **Nightly** (`/api/cron/backup`, 03:00 UTC ≈ 11 PM ET, `vercel.json`):
  emails four CSVs to the `backup_email` setting (default
  pragati.management@gmail.com) — registrations+tickets (restore-grade),
  members+families (no password hashes), donations, settings.
- **Manual**: Admin → Registrations → "Email backup now".
- **Restore**: Admin → Registrations → "Restore from backup CSV"
  (super admin). Rebuilds registrations/tickets from the registrations CSV
  into any database — skip-existing, QR codes and check-in state preserved,
  missing events recreated as archived stubs. Members/donations/settings
  CSVs are for manual re-entry or spreadsheet reference.

## Going from test to production — the exact order

1. Create the production database (e.g. Neon) and run
   `DATABASE_URL=… npx drizzle-kit push`.
2. Deploy with all env vars set (see [DEPLOY.md](./DEPLOY.md)) —
   `APP_ENV=production` stops the test-mode email redirect, real recipients
   get real email.
3. Create the real super-admin account (sign up, then promote the row in
   `users.role`, or temporarily seed and change the password), then add
   organizer/volunteer accounts in Admin → Roles.
4. In Admin → Settings, replace every test value: `zelle_recipient_email`,
   `system_email_from`, `system_email_reply_to`,
   `treasurer_notification_email`, `admin_alert_email`, `backup_email`
   (pragati.management@gmail.com), `active_event_slug`.
5. Build the real event + ticket types in Admin → Events.
6. If any test purchases were made against this database:
   `DATABASE_URL=… npm run reset:test-data -- --yes`.
7. Switch `PAYMENTS_MODE=live` with real Square keys; send yourself a
   backup ("Email backup now") to confirm Resend + attachments work.
