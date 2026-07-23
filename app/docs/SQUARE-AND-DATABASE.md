# Square Payments + Database — Setup & Scaling

Two things, plain and clear: (1) exactly which Square values go where, sandbox
then production; (2) whether your Neon database will hold up and how to keep it
free.

---

## Part A — Square, step by step

### How the app thinks about payments (two switches)

The app has two environment variables that decide the payment behaviour:

| Variable | Values | Meaning |
|---|---|---|
| `PAYMENTS_MODE` | `test` / `live` | `test` = the built-in fake checkout (no Square at all, what you've been using). `live` = call the **real Square API**. |
| `SQUARE_ENV` | `sandbox` / `production` | Only matters when `PAYMENTS_MODE=live`. `sandbox` = Square's test world (no real money). `production` = real cards, real money. |

So the safe order is: **`live` + `sandbox`** first (real Square, fake money),
then **`live` + `production`** when you're confident.

### Which credential is which (this is the confusing part)

On your Square Developer dashboard → your app **Pragati_New_Website** → **Credentials**, on the **Sandbox** tab you see two things:

- **Sandbox Application ID** (`sandbox-sq0idb-…`) — identifies your app to Square's browser SDKs. **You do NOT need this** for our checkout. Ignore it.
- **Sandbox Access token** (hidden dots, click to reveal) — this is the secret key the server uses to create payment links. **This is the one you need.**

You also need two more values:

- **Location ID** — Developer dashboard → your app → **Locations** (left menu). Copy the sandbox location's ID (looks like `L…`).
- **Webhook signature key** — created in the next step.

### Step 1 — Create the webhook (so payments confirm themselves)

Square tells our site when a payment completes. In the Developer dashboard → your app → **Webhooks → Subscriptions** (make sure you're on **Sandbox**) → **Add endpoint**:

- **URL**: `https://YOUR-VERCEL-DOMAIN/api/webhooks/square`
- **Events**: check **`payment.updated`**
- Save, then copy the **Signature key** it shows.

### Step 2 — Set the Vercel environment variables (Sandbox test)

In **Vercel → your project → Settings → Environment Variables**, set:

| Variable | Value |
|---|---|
| `PAYMENTS_MODE` | `live` |
| `SQUARE_ENV` | `sandbox` |
| `SQUARE_ACCESS_TOKEN` | the **Sandbox Access token** |
| `SQUARE_LOCATION_ID` | the sandbox **Location ID** (`L…`) |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | the webhook **Signature key** from Step 1 |
| `NEXT_PUBLIC_SITE_URL` | your real site URL, e.g. `https://YOUR-VERCEL-DOMAIN` (used for the return redirect) |

Redeploy. Do NOT paste these anywhere public — only into Vercel.

### Step 3 — Test in sandbox

Buy a ticket / donate / pay membership dues by card. On Square's sandbox
checkout, use test card **`4111 1111 1111 1111`**, any future expiry, any CVV,
any ZIP. The payment should complete, the webhook should mark it paid, and:
tickets/receipt/welcome email should send. Check **Admin → Registrations /
Members** to confirm it flipped to paid/active.

### Step 4 — Go to production (real money)

When sandbox works end to end:

1. In the Square dashboard, switch to the **Production** tab and get the
   **Production Access token** and **Production Location ID**.
2. Create a **Production** webhook subscription (same URL, same `payment.updated`
   event) and copy its **Production signature key**.
3. In Vercel, change **only these**:
   - `SQUARE_ENV` → `production`
   - `SQUARE_ACCESS_TOKEN` → production token
   - `SQUARE_LOCATION_ID` → production location
   - `SQUARE_WEBHOOK_SIGNATURE_KEY` → production signature key
   - keep `PAYMENTS_MODE` = `live`
4. Redeploy. Real cards now charge real money. Do one small real test and refund it.

> To pause card payments anytime without touching Square, use **Admin →
> Settings → Payments — methods** (the toggle I added earlier).

**Membership card note:** membership dues now confirm by Square's order ID (I
just wired this), so card membership activates correctly in sandbox **and**
production — not only in the fake simulator.

---

## Part B — Neon database: will it hold up, and how to keep it free

**Short answer: yes, the free tier is fine — storage is not your bottleneck.**

Your database stores *text rows* (registrations, members, tickets, events).
Images and magazine PDFs live in Vercel Blob, **not** in the database. Some
sizing:

- A registration with a family + tickets is roughly a few KB.
- **1,000 registrations ≈ ~5–15 MB. Even 6,000 ≈ tens of MB.**
- Neon's free tier is **0.5 GB** — that's 10–30× more than a peak Durga Pujo needs.

So you will not fill it with real data. The only things that grow *without
bound* are **log tables** (email log, audit log, webhook records). I've added an
automatic **hourly cleanup** (`src/lib/log-retention.ts`, run from the sweep
cron) that trims those on a sensible schedule and never touches real data:

| Table | Kept for |
|---|---|
| processed webhook events | 30 days |
| drained email outbox rows | 30 days |
| email log | 180 days |
| audit log | 365 days |

With that in place, the database stays flat and free indefinitely.

### Backups (you already have one, plus options)

- **Nightly CSV backup** already exists (`src/lib/backup.ts`) — it emails a full
  export of registrations/members to the backup address. That's your restore-grade
  safety net.
- **Neon** keeps point-in-time history on the free tier (you can restore to a
  recent moment from their dashboard).
- If you ever want a second copy, add a weekly job that pushes the CSV to Vercel
  Blob or emails it to a second address — say the word and I'll wire it.

### If it ever did get tight (it won't, but options that cost nothing)

1. **Archive old events** — after an event is long past, its detailed rows can be
   exported to CSV (you already have the export) and deleted. One button; I can add it.
2. **Switch providers, still free** — Supabase (0.5 GB free) or Turso are drop-in
   Postgres/SQLite alternatives; the app is standard Postgres so moving is low effort.
3. **Do NOT move registrations to files** — you'd lose querying, the admin views,
   scan lookups, and consistency. Postgres + log cleanup is the right call.

**Recommendation:** stay on Neon free, keep the log cleanup on, rely on the
nightly CSV backup. Revisit only if a season ever pushes you past ~300 MB, which
your numbers won't.
