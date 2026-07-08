# Admin Bootstrap & Reset

How the very first admin accounts get created (before any admin exists to promote them via UI), and how to tear down and re-seed for testing.

## The chicken-and-egg problem

`/admin/*` requires role = admin. Only super-admins can promote users to admin. But no super-admin exists at fresh install. Solution: a bootstrap CLI script.

## Bootstrap script (`scripts/bootstrap-admins.ts`)

Run once after fresh database migration. Reads a config file, creates users, prints their initial passwords.

### Usage

```bash
npm run bootstrap-admins -- --config=./bootstrap-config.json --env=staging
```

### Config file format

`bootstrap-config.json`:

```json
{
  "superAdmins": [
    { "email": "sayantan@example.com", "name": "Sayantan Kundu" },
    { "email": "president@example.com", "name": "Pragati President" }
  ],
  "admins": [
    { "email": "treasurer@example.com", "name": "Sudip Ghosh" },
    { "email": "secretary@example.com", "name": "Anjali Roy" }
  ],
  "systemConfig": {
    "membership_annual_price_cents": 3500,
    "member_discount_percent": 30,
    "member_discount_mode": "per_adult",
    "zelle_recipient_email": "pragati.management@gmail.com",
    "zelle_recipient_display_name": "Pragati",
    "contact_email": "pragati.management@gmail.com",
    "system_email_from": "pragati.management@gmail.com",
    "system_email_reply_to": "pragati.management@gmail.com",
    "treasurer_notification_email": "pragati.management@gmail.com",
    "org_name": "Pragati — Bengali Association of Greater Philadelphia",
    "org_address": "127 Lotus Lane, Malvern, PA 19355",
    "refund_cutoff_days": 0,
    "zelle_verification_sla_hours": 24
  }
}
```

### What it does

For each admin listed:
1. Create a `users` row with role = `admin` or `super_admin`
2. Generate a random 16-character password
3. Store as bcrypt hash
4. Print the plaintext password to the terminal (only shown once — write it down or paste into 1Password)
5. Mark email as `verified` (skip email verification for initial bootstrap)
6. Force `password_reset_required = true` — user MUST change password on first login

For system config:
1. Upsert each key/value into `system_config` table

Output looks like:

```
Bootstrapping Pragati admins for environment: staging

✓ Created super_admin: sayantan@example.com
  → Initial password: k9M2x-Qz7R-Wp4a-Bt5e
  → User must change password on first login

✓ Created super_admin: president@example.com
  → Initial password: Xf3n-P8vR-2Yq6-Hs9j
  → User must change password on first login

✓ Created admin: treasurer@example.com
  → Initial password: 7wKm-3nQ2-Xt8r-BpV4
  → User must change password on first login

✓ Created admin: secretary@example.com
  → Initial password: 5hZq-N4kM-9tPr-XwF3
  → User must change password on first login

✓ Applied system_config: 14 keys set

⚠️  These passwords are shown ONCE and never again.
    Save them in 1Password and share with each admin
    over Signal (or a secure channel).
    Each user MUST change their password on first login.

Bootstrap complete.
```

### Safety rails

- Refuses to run if any `users` row with role `admin` or `super_admin` already exists — prevents accidental double-bootstrap
- Refuses to run against production without `--force-production` flag AND typed confirmation
- Logs every action to `audit_log` with a special `bootstrap-script` actor

## Reset script (`scripts/reset-admins.ts`)

For testing: tears down all admin accounts + system config so bootstrap can be re-run.

### Usage

```bash
npm run reset-admins -- --env=staging --confirm
```

### What it does

1. Deletes all rows in `users` with role in (`admin`, `super_admin`)
2. Deletes all rows in `system_config`
3. Deletes any `audit_log` rows created by those users (optional — flag `--purge-audit`)
4. Prints confirmation

### Safety rails

- **Refuses to run against production, ever.** Only works against `staging` and `development` environments. Production reset requires manual database access.
- Requires explicit `--confirm` flag AND interactive typed confirmation (`RESET` typed by hand)
- Cannot be run within 5 minutes of previous run (prevents accidental double-execution during CI/CD)

### Why we have this

Per committee feedback: "For testing I want to remove and restart the [admin] activity which will be setup by them." This script is the answer — you can bootstrap admins, test the setup, wipe them, and re-bootstrap with different config, all from the CLI.

## Manual promotion (once bootstrapped)

After the first super-admin is created via bootstrap script, all subsequent admin changes happen through the admin UI at `/admin/super/admins`. No further CLI runs needed for day-to-day use.

## What happens if all admins are locked out

Worst case scenario: everyone forgot their password AND their 2FA. Recovery path:

1. Sayantan has direct database access (via Supabase dashboard)
2. Runs a one-off SQL: `UPDATE users SET password_hash = '<new-bcrypt>' WHERE email = '<person>'`
3. Emails the person the new password
4. They log in and change it immediately

This is the only "backdoor" — it requires direct DB access which only Sayantan and other super-admins with Supabase credentials have.

## Not exposed via UI

- Adding the very first super-admin (bootstrap only)
- Resetting all admins (script only)
- Changing certain system_config keys like `system_email_from` (requires SSH-like direct config change to prevent misconfiguration breaking email)

These are intentional friction points to prevent accidental disaster.
