# Go-Live — step by step (the easy version)

Follow these in order. Each variable name is EXACT — type it as shown. All of this
is done in the **Vercel dashboard** (except the email DNS records, which you add at
your domain host).

Where to put every variable:
**Vercel → your project → Settings → Environment Variables.** For each one, set
**Key** and **Value**, choose the **Production** environment, and Save. After you've
added them all, do one **Redeploy** (Step 7).

---

## Step 1 — The ones you already have ✅

You generated these already — just make sure they're in Vercel for **Production**:

| Key | Value |
|---|---|
| `SESSION_SECRET` | (your long random string — keep it) |
| `CRON_SECRET` | (your long random string — keep it) |

Nothing to regenerate. Done.

---

## Step 2 — Site address + mode

Add these three exactly:

| Key | Value | Note |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://pragatiphilly.org` | **No slash at the end.** This one is critical. |
| `APP_ENV` | `production` | Turns OFF the test-email redirect. |
| `TEST_EMAIL_OVERRIDE` | *(leave empty / delete it)* | If set, ALL email goes to one test inbox. Must be blank. |

---

## Step 3 — Database (Neon)

1. In **Neon → your project → Dashboard**, click **Connect**.
2. Copy the **pooled** connection string (it contains `-pooler`). It looks like
   `postgresql://user:pass@ep-xxxx-pooler.us-east-1.aws.neon.tech/db?sslmode=require`.
3. In Vercel add:

| Key | Value |
|---|---|
| `DATABASE_URL` | (paste the pooled connection string) |

4. **Upgrade Neon to the Launch plan** (Neon → Settings/Billing → Upgrade). The free
   plan's compute cap can suspend the database mid-event and break registrations.
   Launch is usage-based (~$15–19/mo) and removes that cliff.

---

## Step 4 — Email (set up BOTH Brevo and Resend)

Goal: both providers can send from `no-reply@pragatiphilly.org`. The app uses **Brevo
first**, and automatically falls back to **Resend** if Brevo ever fails.

You'll do the same thing in each dashboard: **add the domain → copy the DNS records it
gives you → paste those records at your domain host → click Verify.**

> **Where your DNS lives:** wherever `pragatiphilly.org` is managed — your registrar
> (GoDaddy, Namecheap, etc.), Cloudflare, or Vercel if you added the domain there. You
> add "DNS records" there. Keep that tab open.

### 4a. Brevo
1. Brevo → **Senders, Domains & Dedicated IPs → Domains → Add a domain** → type
   `pragatiphilly.org`.
2. Brevo shows a few **DNS records** (a "brevo-code" TXT record + DKIM records). Leave
   this open.
3. In your DNS host, **add each record** exactly (Type, Name/Host, Value). Save.
4. Back in Brevo, click **Authenticate / Verify**. It can take a few minutes to 24–48h
   to turn green.  *(You've done this — domain is authenticated ✅.)*
5. **Switch the sender off Gmail.** The old `sayantankundu93@gmail.com` sender is a
   freemail address Google/Yahoo now reject. Brevo → **Senders → Add a sender** →
   Name `Pragati`, Email `no-reply@pragatiphilly.org`. Because the domain is
   authenticated, Brevo marks it verified automatically (no mailbox / code needed). You
   can delete the Gmail sender.
6. Get the key: top-right **account menu → SMTP & API → API Keys → Generate a new API
   key** (v3). Copy it → this is `BREVO_API_KEY`.

### 4b. Resend
1. Resend → **Domains → Add Domain** → type `pragatiphilly.org`.
2. Resend shows **DNS records** (usually an MX + TXT records for SPF, DKIM, DMARC).
   Leave open.
3. In your DNS host, **add each record** exactly. Save.
4. Back in Resend, click **Verify**. Wait for "Verified."
5. Resend → **API Keys → Create API Key.** Copy it.

### 4c. One SPF gotcha
You may only have **one** SPF record per hostname. If Brevo and Resend both ask for an
SPF TXT record on the *same* name, don't add two — **merge** them into one:
```
v=spf1 include:spf.brevo.com include:_spf.resend.com ~all
```
(DKIM records don't conflict — each provider uses its own name, so add both.)

### 4d. Email variables in Vercel

| Key | Value |
|---|---|
| `EMAIL_PROVIDER` | `live` |
| `EMAIL_FROM` | `Pragati <no-reply@pragatiphilly.org>` |
| `BREVO_API_KEY` | (the Brevo key from 4a) |
| `RESEND_API_KEY` | (the Resend key from 4b) |

You can ignore `RESEND_FROM_EMAIL` — both providers use `EMAIL_FROM`.

**Replies:** the From is `no-reply@` (no mailbox), so the app now stamps a **Reply-To**
header on every email using `system_email_reply_to` from **Admin → Settings** (Step 8).
Set that to `pragati.management@gmail.com` so member replies land in your Gmail.

### 4e. Add a DMARC record (recommended — fixes the Brevo "not compliant" warning)
At your DNS host, add ONE TXT record:
- **Name:** `_dmarc`
- **Value:** `v=DMARC1; p=none; rua=mailto:pragati.management@gmail.com`

`p=none` just monitors (safe). This satisfies Gmail/Yahoo's sender rules and improves
inbox placement.

---

## Step 5 — Square (switch from sandbox to real payments)

Do everything in the **Square Developer Dashboard** (developer.squareup.com).

1. Open your application. At the **top of the page, flip the toggle to "Production."**
   (The credentials below now show your *live* values.)
2. **Credentials** page → **Production Access Token** → click Show → copy.
3. **Locations** (in the Square Dashboard) → copy your **Location ID**.
4. **Webhooks → Subscriptions → Add endpoint:**
   - **URL:** `https://pragatiphilly.org/api/webhooks/square` (exactly, https, no trailing slash)
   - **Events:** tick **`payment.updated`**
   - Save, then click **Show** on the subscription's **Signature Key** → copy.

### Square variables in Vercel

| Key | Value |
|---|---|
| `PAYMENTS_MODE` | `live` |
| `SQUARE_ENV` | `production` |
| `SQUARE_ACCESS_TOKEN` | (Production access token from step 2) |
| `SQUARE_LOCATION_ID` | (Location ID from step 3) |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | (Signature key from step 4) |

---

## Step 6 — File uploads (photos & magazines)

In **Vercel → Storage → Blob**, connect a Blob store to the project (if not already).
That auto-adds:

| Key | Value |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | (added automatically) |

---

## Step 7 — Redeploy

Environment variables only take effect on the next deploy.
**Vercel → Deployments → Redeploy** (or push to `main`).

---

## Step 8 — After it's live (2 minutes in Admin → Settings)

Log in as your admin and set the org email fields (they currently default to a test
address): `system_email_reply_to`, `treasurer_notification_email`, `admin_alert_email`,
`backup_email`, `contact_email` → your real addresses (e.g. `pragati.management@gmail.com`).

---

## Step 9 — Quick smoke test (do these once, for real)

- [ ] Homepage and Events page load.
- [ ] Buy one membership by card (small real charge) → it flips to **active** and a welcome email arrives (check spam once).
- [ ] Register for the event by card → tickets email arrives with a working QR.
- [ ] Then refund that test charge in Square.

---

## The full checklist (all variables in one place)

```
NEXT_PUBLIC_SITE_URL   = https://pragatiphilly.org
APP_ENV                = production
TEST_EMAIL_OVERRIDE    = (empty)
SESSION_SECRET         = (already set)
CRON_SECRET            = (already set)
DATABASE_URL           = (Neon pooled connection string)
EMAIL_PROVIDER         = live
EMAIL_FROM             = Pragati <no-reply@pragatiphilly.org>
BREVO_API_KEY          = (Brevo API key)
RESEND_API_KEY         = (Resend API key)
PAYMENTS_MODE          = live
SQUARE_ENV             = production
SQUARE_ACCESS_TOKEN    = (Square production access token)
SQUARE_LOCATION_ID     = (Square location id)
SQUARE_WEBHOOK_SIGNATURE_KEY = (Square webhook signature key)
BLOB_READ_WRITE_TOKEN  = (auto from Vercel Blob)
```
