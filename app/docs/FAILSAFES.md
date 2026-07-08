# Pragati — Fail-safes & Emergency Runbook

What admins can do **without code changes, redeploys, or database surgery**
when something breaks. Print this (or keep it in the backup email inbox) —
it's most needed exactly when the site is down.

---

## Know about problems before guests do

Point a free uptime monitor (UptimeRobot, Better Stack, or cron-job.org) at:

```
https://<your-domain>/api/health
```

It returns 200 when the app **and database** are healthy, 503 when the DB is
unreachable — you get an email/SMS within minutes of an outage. The admin
dashboard also shows a **System health** card on every load: registration
pause state, disabled payment rails, email/payment mode, last backup status,
and failed-email count.

---

## Scenario playbook

### 🗓 Event day: app, database, or venue internet goes down at the gate

**Fail-safe: the offline gate sheet.** Every event morning, someone downloads
it from Admin → Scan desk ("Download offline gate sheet") onto 1–2 phones or
a laptop. It's a single HTML file with every paid attendee embedded —
search by name/phone/confirmation, food color dots, tap-to-mark check-in —
and it works with **zero internet** once downloaded.

If the outage happens mid-event: switch to the gate sheet, mark arrivals
there, and reconcile in the admin later (check people in by name search).
Attendees' QR emails still show their names + confirmation numbers even if
`/t/...` links are down — match against the sheet.

### 💳 Square (card payments) is down or misbehaving

Admin → Settings → set `payments_square_enabled` to `no`. The card button
disappears from registration and donations instantly (and the server refuses
card submissions from already-open tabs). Zelle keeps selling tickets.
Flip back to `yes` when Square recovers.

### 🏦 Zelle needs to be turned off (e.g. account issue)

Same switch, other rail: `payments_zelle_enabled` → `no`.

### 🚦 Registration needs to stop NOW (wrong prices, oversold, suspected abuse)

Admin → Settings → `registration_paused` → `yes`. The register page shows a
friendly pause note (editable via `registration_pause_message`), and the
server rejects submissions from open tabs. Nothing is deleted; flip back
when ready. Already-paid tickets are unaffected.

### 📧 Emails aren't sending (Resend outage / quota hit)

1. Nothing is lost: every email is stored in **Admin → Email log** with a
   `failed` status and the full text.
2. Registrations and payments **keep working** — email failure never blocks
   a purchase.
3. When the provider recovers, open Email log → expand the failed entry →
   **↻ Re-send**. For a failed nightly backup, use "Email backup now" on the
   Registrations page instead (attachments aren't stored in the log).
4. Meanwhile, an admin can read any confirmation from the log to a caller,
   and the Lookup page (`/lookup`) still shows guests their tickets.

### 🗄 Database is down (Neon outage / connection failure)

- Visitors see a friendly "we hit a snag" page with the org contact — not a
  stack trace — and a reassurance that issued tickets remain valid.
- `/api/health` returns 503 → your uptime monitor alerts you.
- **Nothing to do but wait** for the provider in most cases (Neon outages
  are typically minutes). Guests' QR emails and the downloaded gate sheet
  keep the event running meanwhile.

### 💥 Database is LOST (deleted project, corrupted, migration disaster)

This is what the nightly backup email exists for:

1. Create a fresh Postgres database; point `DATABASE_URL` at it;
   run `npx drizzle-kit push`.
2. Sign up, promote yourself to super admin (one SQL update on `users.role`).
3. Admin → Registrations → **Restore from backup CSV** with the newest
   backup email's registrations attachment. All confirmations, tickets, QR
   codes, and check-in states return; original QR emails keep working.
4. Re-enter settings from the settings CSV; re-invite members (they reset
   passwords by email); donations CSV is the treasurer's record.

Worst case you lose registrations made **after** the last 11 PM backup —
send a manual "Email backup now" before risky moments (e.g. the morning
registration opens, before a deploy).

### 🔑 Super admin locked out (lost password + email down)

Password reset needs email. If email is also down, fix via one SQL statement
on the database (Neon console → SQL editor):

```sql
-- temporarily promote another working account:
UPDATE users SET role = 'super_admin' WHERE email = 'other-admin@example.org';
```

There is deliberately no backdoor login — this is the intended recovery path.

### 🧾 A guest's ticket email is lost/deleted

No failure at all: `/lookup` re-shows all passes by email + confirmation
number, admins can search by name/phone at the scan desk, and the Email log
can re-send the original confirmation.

---

## The switches at a glance (Admin → Settings)

| Setting | Values | Effect |
|---|---|---|
| `registration_paused` | yes / no | Stops all new registrations, shows pause message |
| `registration_pause_message` | text | What visitors see while paused |
| `payments_square_enabled` | yes / no | Show/refuse card payments (register + donate) |
| `payments_zelle_enabled` | yes / no | Show/refuse Zelle (register + donate) |
| `backup_email` | email | Where nightly backup CSVs go |
| `backup_enabled` | yes / no | Nightly backup on/off |

All take effect immediately — no redeploy, and server-side enforcement means
open browser tabs can't bypass them.

## Built-in resilience (nothing to operate)

- Email failures never block payments (send errors are logged, not thrown).
- Square webhooks are signature-verified and idempotent — replays/dupes can't
  double-mark or forge payments.
- Expired unpaid reservations auto-release every 15 minutes (cron + on
  dashboard loads), so a payment-rail outage doesn't strand inventory.
- Meal scans are enforced by a database unique index — two volunteers
  scanning the same QR at the same instant still serve one plate.
- Every scan, payment verification, settings change, backup, restore, and
  re-send lands in the audit log.
