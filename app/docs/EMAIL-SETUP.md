# Email Setup — Brevo + Resend, Step by Step

Follow this top to bottom and the new email system is live: 300 free
emails/day via Brevo, Resend as automatic backup, tickets always instant,
Zelle alerts every 5 minutes (adjustable in Admin → Settings).

---

## Part 1 — Create the Brevo account (~10 minutes)

1. Open **[brevo.com](https://www.brevo.com)** → click **Sign up free**.
2. Sign up with **your own email** (sayantankundu93@gmail.com) and a strong
   password. No credit card needed — stay on the **Free** plan.
3. Brevo sends a confirmation email — click the link in it to activate the
   account.
4. During onboarding it asks about your business — pick anything reasonable
   (nonprofit/community organization). **Skip** anything about importing
   contacts or marketing campaigns; you don't need them.

## Part 2 — Verify your sender address (~2 minutes)

Brevo only sends email "from" addresses you've proven you own.

1. In Brevo, click your **profile icon (top-right) → Senders, Domains &
   Dedicated IPs** (sometimes just "Senders & Domain" under Settings).
2. Open the **Senders** tab → **Add a sender**.
3. Fill in: From name `Pragati` · From email **sayantankundu93@gmail.com**
   → Save.
4. Brevo emails a 6-digit code / confirmation link to that address — open
   your inbox and confirm it. The sender must show **✓ verified**.

## Part 3 — Get the API key (~1 minute)

1. Profile icon (top-right) → **SMTP & API**.
2. Open the **API Keys** tab → **Generate a new API key**.
3. Name it `pragati-website` → Generate → **copy the key now**
   (starts with `xkeysib-…`; it's shown only once).

## Part 4 — Set the Vercel environment variables (~3 minutes)

In **Vercel → pragati-website → Settings → Environment Variables**:

| Action | Name | Value |
|---|---|---|
| **Add** | `BREVO_API_KEY` | the `xkeysib-…` key from Part 3 |
| **Add** | `EMAIL_FROM` | `Pragati <sayantankundu93@gmail.com>` — must exactly match the verified sender |
| **Edit** | `EMAIL_PROVIDER` | change from `resend` to `live` |
| **Keep** | `RESEND_API_KEY` | leave as is — it's the automatic fallback |

(All environments; exact spelling matters. `EMAIL_PROVIDER=console` would
mean "log only, send nothing" — that's for local dev.)

## Part 5 — Deploy the new code

On your Mac:

```bash
cd ~/Documents/Pragati
git add -A
git commit -m "Email: Brevo primary + Resend fallback, priority outbox, 5-min Zelle digests"
git push
```

Vercel builds and deploys automatically (~2 min). Because you set the env
vars BEFORE pushing, the new code wakes up fully configured — no extra
redeploy needed.

## Part 6 — Verify it works (~5 minutes)

1. **Provider check:** Admin → Registrations → **Email backup now** → the
   email arrives in the management inbox; in Admin → **Email log**, the
   newest entry should exist with status `sent`. (Its provider is recorded
   as `brevo:…` internally.)
2. **Digest check:** make two quick test Zelle registrations, click
   **"I've sent it"** on both → no immediate alert; within ~5 minutes ONE
   email arrives titled "⏳ 2 Zelle payments awaiting verification".
3. **Dashboard:** the health card now shows `emails: N sent / 24h` and any
   queued count.
4. In Brevo's dashboard → **Statistics → Email**, you can watch your daily
   usage against the 300/day allowance.

---

## How the system behaves (reference)

- **Tickets, receipts, Zelle instructions, password/invite emails** — always
  send instantly, budget or not. These are never delayed.
- **Zelle treasurer alerts** — batched: at most one email per
  `zelle_alert_minutes` (Admin → Settings → Emails, default **5**). A lone
  claim = one alert within ~5 min; a peak-day burst = one digest listing all
  of them. Raise to 15/30/60 if the inbox feels noisy.
- **Everything else** (backups, misc notifications) — sends immediately
  until the daily budget (`email_daily_budget`, default **280**) is nearly
  used, then waits in the outbox and goes out automatically next day —
  nothing is ever dropped.
- **If Brevo fails or is down** — the same email retries via Resend within
  the same second. If both fail, it's queued and retried every 5 minutes
  with backoff for up to 10 attempts.

## Later — switching Brevo to the management email

When you're ready to hand it to the team (no code changes):

1. In the same Brevo account: **Senders → Add a sender** →
   `pragati.management@gmail.com` → confirm the code from the management
   inbox.
2. In Vercel, edit `EMAIL_FROM` to `Pragati <pragati.management@gmail.com>`
   → Redeploy.
3. Optional, for clean ownership: also transfer the Brevo *account login*
   to the management email (Brevo → Profile → change email), or create a
   fresh Brevo account under the management email, verify the sender there,
   and swap `BREVO_API_KEY`. Either way, only env vars change.
