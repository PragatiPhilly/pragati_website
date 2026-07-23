# Pragati — Go-Live / Production Cutover Runbook

The single checklist for taking the site from **testing → production**. Work top to
bottom; nothing here needs a code change — it's all environment variables, dashboard
settings, and two scripts.

**Golden rules**

1. **Vercel Environment Variables are the source of truth in production.** `.env.local`
   is for your laptop only and is git-ignored — never commit it, and don't expect it to
   affect the deployed site.
2. **`NEXT_PUBLIC_SITE_URL` must have NO trailing slash** — `https://pragatiphilly.org`,
   not `…org/`. A trailing slash breaks the Square webhook signature and silently kills
   *all* card payments. (This is the bug we just fixed.)
3. Set every variable for the **Production** environment scope in Vercel, then **redeploy**
   — env-var changes don't take effect until the next deploy.

---

## 1. The complete production environment variables

Set these in **Vercel → your project → Settings → Environment Variables** (Production scope).

| Variable | Production value | Where to get it / notes |
|---|---|---|
| `APP_ENV` | `production` | **Critical.** Anything other than `production` keeps the test-mode email redirect on (all mail goes to one inbox, subjects prefixed `[TEST →]`). |
| `NEXT_PUBLIC_SITE_URL` | `https://pragatiphilly.org` | **No trailing slash.** |
| `DATABASE_URL` | `postgresql://…neon.tech/…` | Neon dashboard → your prod database → Connection string (use the **pooled** connection). |
| `SESSION_SECRET` | long random string | Generate: `openssl rand -hex 32`. Changing it logs everyone out. |
| `PAYMENTS_MODE` | `live` | Switches from the built-in simulator to the real Square API. |
| `SQUARE_ENV` | `production` | Points the app at `connect.squareup.com` (not sandbox). |
| `SQUARE_ACCESS_TOKEN` | production access token | See §2. |
| `SQUARE_LOCATION_ID` | production location id | See §2. |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | production signature key | See §2. **Must match the webhook subscription exactly.** |
| `EMAIL_PROVIDER` | `live` | Any value except `console` turns on real sending. |
| `BREVO_API_KEY` | Brevo API key | See §3. (Leave blank if you choose Resend as your one provider.) |
| `RESEND_API_KEY` | Resend API key *(optional)* | Only if you want Resend as your provider or as a fallback. |
| `EMAIL_FROM` | `Pragati <no-reply@pragatiphilly.org>` | See §3 — use a **domain** address, not `@gmail.com`. |
| `BLOB_READ_WRITE_TOKEN` | (auto) | Added automatically when you connect a Vercel Blob store (Storage → Blob). Needed for photo + magazine uploads. |
| `CRON_SECRET` | long random string | `openssl rand -hex 32`. Vercel Cron sends it as `Authorization: Bearer …` to `/api/cron/sweep` (email queue, every 5 min) and `/api/cron/backup` (daily 3 AM). |
| `TEST_EMAIL_OVERRIDE` | **delete / leave blank** | If set, and `APP_ENV≠production`, every email is redirected here. Must be empty in prod. |

Notes:
- `SQUARE_APPLICATION_ID` and `RESEND_FROM_EMAIL` appear in `.env.example` but are **not
  read by the running app** — you don't have to set them. (The app builds payment links
  with the location id, and the from-address comes from `EMAIL_FROM`.)
- `PGLITE_DIR` is local-only (the embedded dev database). Ignore it in production.

---

## 2. Square — switch from Sandbox to Live

Everything happens in the **Square Developer Dashboard** (developer.squareup.com) and your
**Square Seller Dashboard**.

**Step 1 — Switch the developer console to Production.** Open your application in the
Developer Console. At the top of the page there's a **Sandbox / Production** toggle — set it
to **Production**. The left-hand pages (Credentials, Webhooks) now show *production* values.

**Step 2 — Copy the three keys.**

| Key → env var | Where |
|---|---|
| `SQUARE_ACCESS_TOKEN` | **Credentials** page (Production mode) → **Production Access Token** box → click **Show**, copy. Keep this secret — it can move money. |
| `SQUARE_LOCATION_ID` | **Locations** tab (Seller Dashboard or the console's Locations page) → your location's ID. |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | **Webhooks** tab → your subscription → **Show Secret** next to the Signature Key. (Create the subscription first — Step 3.) |

**Step 3 — Create the production webhook subscription.** In the **Webhooks → Subscriptions**
tab (Production), add an endpoint:

- **URL:** `https://pragatiphilly.org/api/webhooks/square` (exactly — no trailing slash, https)
- **API version:** current (matches the app's `Square-Version`, `2024-11-20` or later)
- **Events:** subscribe to **`payment.updated`** (this is the event the app listens for to
  mark payments paid and activate memberships).

Then copy that subscription's **Signature Key** into `SQUARE_WEBHOOK_SIGNATURE_KEY`.

**Step 4 — Set the payment env vars** from §1: `PAYMENTS_MODE=live`, `SQUARE_ENV=production`,
plus the three keys above. Redeploy.

**Step 5 — Verify after deploy.** Make one small **real** card payment (e.g. a membership).
It should: redirect to the real Square card form → return to the success page → flip the
member to **active** within a few seconds → send the welcome email. Check
**Admin → Payments** to confirm it shows as paid. Then refund that test charge in the Square
dashboard and remove the record (see §5).

> Safety note: in `live` mode the app **refuses** any webhook if `SQUARE_WEBHOOK_SIGNATURE_KEY`
> is missing — it will not fall back to the test key. So if payments aren't being marked paid,
> the usual causes are (a) a trailing slash in `NEXT_PUBLIC_SITE_URL`, (b) the signature key not
> matching the subscription, or (c) `payment.updated` not subscribed.

---

## 3. Email — one provider, sending as the organization

You want a single provider that sends **from the organization**, with member-facing mail going
to members and management/alert mail going to `pragati.management`.

### 3a. Pick one provider and set its key
The app tries providers in order: **Brevo** (if `BREVO_API_KEY` set) → **Resend** (if
`RESEND_API_KEY` set) → console. **To use just one provider, set only that provider's key and
leave the other blank.** Brevo's free tier (300/day) is the recommended primary for this volume.

### 3b. Don't send from a raw @gmail.com address — use your domain
As of 2024, Gmail/Yahoo/Microsoft reject or spam-filter mail sent *from* free addresses like
`pragati.management@gmail.com`, and Brevo now requires domain authentication. You already own
**pragatiphilly.org**, so:

1. In Brevo → **Senders, Domains & Dedicated IPs → Domains**, add `pragatiphilly.org` and
   complete **domain authentication** (add the Brevo/DKIM/DMARC DNS records at your domain host;
   a green check appears in ~24–48h).
2. Set `EMAIL_FROM = Pragati <no-reply@pragatiphilly.org>` (or `events@pragatiphilly.org`).
3. Put `pragati.management@gmail.com` as the **reply-to** and as the management recipient
   (§4) — replies and alerts land in that Gmail inbox, but the site *sends* from your domain.

If you truly can't use a domain yet, Brevo also lets you verify a single sender address via a
6-digit code (**Senders** tab) — but deliverability will be worse. Domain auth is strongly
preferred before a big event.

### 3c. How mail is routed (already built in)
- **To the member/buyer:** tickets, receipts, welcome, password resets, invites (these are
  "critical" and always send, even if the daily budget is hit).
- **To the organization** (the addresses you set in §4): treasurer Zelle alerts, security/
  deletion alerts, the daily registrations backup CSV.

Set `APP_ENV=production` and clear `TEST_EMAIL_OVERRIDE` so mail actually reaches members
instead of being redirected.

---

## 4. Switch the org's addresses in Admin → Settings (no redeploy)

These live in the database (`system_config`), not in code, and currently default to the
personal test email used during development. After your first production login, open
**Admin → Settings** and change:

| Setting | Set to |
|---|---|
| `system_email_from` | `no-reply@pragatiphilly.org` (or your chosen sender) |
| `system_email_reply_to` | `pragati.management@gmail.com` |
| `treasurer_notification_email` | treasurer's / `pragati.management@gmail.com` |
| `admin_alert_email` | `pragati.management@gmail.com` |
| `backup_email` | `pragati.management@gmail.com` |
| `contact_email` | `pragati.management@gmail.com` |
| `zelle_recipient_email` | org Zelle address — only matters if you enable Zelle (it's OFF by default) |

> On a **brand-new** production database these seed automatically from the code defaults, but
> the defaults still point at the test email — so change them here regardless. If you reuse a
> database you already tested on, changing them in Settings is the **only** way to update them
> (code defaults don't overwrite existing rows).

---

## 5. Wipe the test data for a fresh start

Pick the scenario that matches you:

**Scenario A — brand-new production database (recommended).** If production uses a fresh Neon
database, there's nothing to wipe. Skip to §6.

**Scenario B — reuse the database you tested on.** Run the reset script against the production
`DATABASE_URL` to clear all test registrations, members, donations, etc.:

```bash
cd app
# full wipe: registrations, donations, members, events, users, media/magazine metadata…
DATABASE_URL='postgresql://…neon.tech/…' npx tsx scripts/reset-test-data.ts --yes --all
```

- `--yes --all` = scorched earth (also removes events, ticket types, users). Omit `--all` for a
  "transactional only" wipe that keeps events/settings/admins and just clears test
  registrations + demo member families.
- The script prints exactly what it cleared. `system_config` (your settings) is **kept** so you
  don't lose org emails.
- **Uploaded files are not deleted by the script** — if you want old test photos / magazine PDFs
  gone, delete them in **Vercel → Storage → Blob**.

**Create your real admin (no demo accounts).** `npm run seed` is for development only — it
creates demo admin/volunteer/member accounts with *known* passwords. For production use the
clean script instead:

```bash
cd app
DATABASE_URL='postgresql://…neon.tech/…' \
ADMIN_EMAIL='pragati.management@gmail.com' \
ADMIN_PASSWORD='a-long-random-password-you-choose' \
npx tsx scripts/create-admin.ts
```

This creates (or password-resets) a single **super-admin** with your chosen credentials and no
demo accounts. Do **not** run `npm run seed` against production.

---

## 6. Database schema / migrations

The app applies its schema automatically:
- On boot, an instrumentation hook runs the "ensure" functions (safe `ADD COLUMN IF NOT EXISTS`
  style checks), so a normal deploy self-heals the schema.
- For a clean first setup you can also run it explicitly once:
  ```bash
  DATABASE_URL='postgresql://…neon.tech/…' npm run db:push
  ```

Do this after `DATABASE_URL` points at production and before the smoke test.

---

## 7. Deploy

1. Confirm a **Vercel Blob** store is connected (Storage → Blob) — this sets
   `BLOB_READ_WRITE_TOKEN` and enables photo + magazine uploads.
2. Confirm all §1 variables are set for **Production**.
3. **Redeploy** (Deployments → Redeploy, or push to `main`).
4. Cron is already declared in `vercel.json` (`/api/cron/sweep` every 5 min, `/api/cron/backup`
   daily 3 AM). Make sure `CRON_SECRET` is set so those run authenticated.

---

## 8. Post-deploy smoke test (~10 minutes)

- [ ] Homepage + events page load; logo/theme correct.
- [ ] Log in as the new super-admin; change nothing is broken in Admin.
- [ ] **Membership by card** (small real charge) → member becomes *active*, welcome email arrives.
- [ ] **Event registration** by card → tickets email arrives, QR renders, Admin → Payments shows paid.
- [ ] Upload a **photo** and a **magazine PDF** in Admin → both display/download (this exercises Blob).
- [ ] Trigger a **password reset** → email arrives with a working link (no double slash).
- [ ] Refund the test charge(s) in Square and delete those records (rerun §5 reset or remove in Admin).

---

## 9. Safety switches & rollback

Flip these in **Admin → Settings** anytime, no redeploy:
- `registration_paused` = `yes` — stop new registrations site-wide (shows a friendly message).
- `payments_square_enabled` = `no` — hide/refuse card payments (e.g. during a Square outage).
- `payments_zelle_enabled` = `yes` — additionally offer Zelle (card is always available).

**Instant rollback:** Vercel → Deployments → pick the last known-good deployment → **Promote/Rollback**.

---

## Quick reference — what changes from test to prod

| | Test | Production |
|---|---|---|
| `APP_ENV` | `test` | `production` |
| `PAYMENTS_MODE` | `test` (simulator) | `live` |
| `SQUARE_ENV` | `sandbox` | `production` |
| Square keys | sandbox tokens | production tokens + prod webhook signature key |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | `https://pragatiphilly.org` (no trailing slash) |
| `EMAIL_PROVIDER` | `console` or `live`+test override | `live` |
| `TEST_EMAIL_OVERRIDE` | your inbox | (blank) |
| `EMAIL_FROM` | anything | `Pragati <no-reply@pragatiphilly.org>` (domain-authenticated) |
| Data | seeded demo accounts | fresh; `create-admin.ts`, no demo accounts |

**Sources for the dashboard steps above:**
- Square Developer — [Access Tokens and Other Credentials](https://developer.squareup.com/docs/build-basics/access-tokens), [Move Webhooks to Production](https://developer.squareup.com/docs/webhooks/movetoprod), [Developer Console](https://developer.squareup.com/docs/devtools/developer-dashboard)
- Brevo — [Getting started with senders and domains](https://developers.brevo.com/docs/getting-started-with-senders-and-domains), [Authenticate your domain (DKIM/DMARC)](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC), [Comply with Gmail/Yahoo/Microsoft sender requirements](https://help.brevo.com/hc/en-us/articles/14925263522578-Comply-with-Gmail-Yahoo-and-Microsoft-s-requirements-for-email-senders)
