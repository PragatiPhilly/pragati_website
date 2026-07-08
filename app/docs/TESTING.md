# Pragati — Local Setup & Complete Testing Guide

Everything you need to run the platform on your machine and test every flow, public and admin.
No page requires typing a URL by hand except `/admin` (which is intentionally unlisted).

---

## 1. Prerequisites

- **Node.js 20+** (`node -v` to check) — install from https://nodejs.org if needed
- A terminal, and any modern browser
- Nothing else. No database install, no Docker — the app ships with an embedded Postgres (PGlite) that lives in a local folder.

## 2. First-time setup (run once)

```bash
cd app                      # this folder
npm install                 # ~1 minute
npm audit                   # should print: found 0 vulnerabilities
cp .env.example .env.local  # skip if .env.local already exists
npm run db:push             # creates all database tables in ./.data/pglite
npm run seed                # config defaults + accounts + Durga Pujo 2026 + promo code
```

> **Never run `npm audit fix --force`.** It "fixes" by installing wildly different major versions
> (it will happily downgrade Next.js to v9 from 2020) and breaks the app. All dependencies are already
> pinned to versions with **zero known vulnerabilities** — `npm audit` confirms it after install.
> The two `overrides` in package.json exist to keep transitive deps (postcss inside Next, esbuild
> inside drizzle-kit's config loader) on patched versions.

**Already ran `npm audit fix --force` and now nothing works?** Reset cleanly:

```bash
rm -rf node_modules package-lock.json .next .data
npm install && npm audit    # 0 vulnerabilities
npm run db:push && npm run seed
npm run dev
```

What the seed gives you:

| Thing | Value |
|---|---|
| Super admin login | `sayantankundu93@gmail.com` / `pragati-admin-2026` |
| Demo member login | `member.demo@example.com` / `member-demo-2026` (Arjun, with Mira + Rohan age 7 in the family) |
| Event | Durga Pujo 2026, Oct 16–18, published, 7 ticket types |
| Promo code | `EARLYBIRD` — 10% off, valid until Sep 15, 2026 |
| Zelle recipient (test) | `sayantankundu93@gmail.com` — changeable in Admin → Settings |

## 3. Start it

```bash
npm run dev          # → http://localhost:3000
```

Stop with `Ctrl+C`. Data persists in `./.data/pglite` between restarts.
Want a clean slate? Stop the server, delete the `.data` folder, then re-run `npm run db:push && npm run seed`.

> ⚠️ The embedded database allows **one process at a time**. Stop the dev server before running `npm run seed`, `npm test` is fine (it uses its own in-memory DB).

## 4. How everything is reachable (no manual URLs)

**Public (navbar / footer):** Events · About · Donate · Find my tickets · Sign in · Become a member. On mobile, the ☰ menu has all of these. The homepage hero, every event card, and the footer link to **Register**.

**Signed in as a member:** the navbar shows **My Pragati** → Overview / My family / My tickets / Profile tabs.

**Signed in as admin:** the navbar shows **Admin**. Everything else — Zelle queue, registrations, donations, members, event editor, check-in, email log, audit log, settings, and the **day-of kiosk launcher** — is in the admin sidebar and dashboard cards.

**The only URL you ever type:** `http://localhost:3000/admin` (or just sign in as the admin — the site redirects you there).

---

## 5. Test scripts — public side

### 5.1 The homepage
1. Open http://localhost:3000
2. You should see the animated Durga scene: flickering diyas, drifting clouds, falling petals, fireflies. Move your mouse over it — the layers parallax.
3. Countdown ticks live. Scroll for event days, upcoming events, rituals section, donate band.

### 5.2 Guest buys tickets with Zelle (the big one)
1. Home → **Register** (or Events → Durga Pujo 2026 → Register)
2. "Are you a Pragati member?" → **I'm new here**
3. Enter your name, a real-looking email, phone → Continue
4. Add people: **+ A kid**, name "Mishti", age 8 → Add. Chips appear.
5. Days: give yourself all 3 days; give Mishti **Saturday only**
6. Food: pick veg/non-veg for yourself (kid meal is automatic for Mishti)
7. Review: check the per-person lines. Type `EARLYBIRD` → **Apply** — watch the discount and total change live. Try a garbage code first if you want to see the error.
8. Pay → **Zelle**
9. You land on the instructions page: amount, recipient, and the memo (your confirmation number `PRG-2026-XXXX`), each with a copy button. Note the number!
10. Click **"I've sent the Zelle payment"**
11. Now check **Admin → Email log** (see §6.1): two emails were "sent" — an acknowledgment to the buyer and an alert to the treasurer. (In test mode, both are redirected to the test address and logged.)

### 5.3 Admin verifies the Zelle → tickets arrive
1. Sign in as admin → **Zelle queue** (badge shows the pending count)
2. Find your registration → **Mark paid** → confirm
3. Check the **Email log**: a tickets email went out with a lookup link.
4. Go to **Find my tickets** in the navbar → enter the email + confirmation number → real scannable QR codes appear, plus a **Print all tickets** button (print preview = one pass per person per day).

### 5.4 Guest pays by card (Square sandbox)
1. Register again as a guest, but at Pay choose **Card (Square)**
2. You land on the **Square Sandbox** page (test-mode stand-in for Square's hosted checkout — the exact same webhook path production uses)
3. First, change the card number to end in `0002` → **Pay now** → declined (simulated)
4. Restore `4111 1111 1111 1111` → **Pay now** → success page appears, flips to "Payment confirmed 🎉" within seconds, with a link to your QR codes. No admin action needed — the signed webhook did it.

### 5.5 Member registration (prefilled family)
1. Sign out, sign in as the demo member
2. **Register** — notice: no "are you a member" question, your details are prefilled
3. On "Who's coming?" your family appears as tap-to-add chips (Mira, Rohan). Rohan auto-gets the kid meal and kid pricing.
4. In review, rows show **member price ✓**. Compare totals with what you saw as a guest — cheaper.
5. Also visit **My Pragati**: add a family member under **My family**, change your phone in **Profile**, see the registration under **My tickets** (pending ones link back to their Zelle instructions).

### 5.6 Donations
1. Navbar → **Donate**
2. Pick $100 → "In memory of…" → fill honoree + a notify email → choose **Card** → sandbox → pay
3. Email log should show the tax receipt AND the honoree notification.
4. Repeat with **Zelle** → shows `DON-2026-XXXX` memo → "I've sent it" → verify in Admin → Zelle queue → Donations tab.

### 5.7 Membership signup
1. Sign out → **Become a member** → fill the form
2. You land on membership dues instructions ($35 Zelle with a `MEM` memo)
3. As admin: **Members** → your new family shows *pending payment* → **Activate ✓**
4. Email log: welcome email sent. Sign back in as that user — member pricing now applies.

### 5.8 Day-of kiosk (walk-in mode)
1. As admin: dashboard → **Day-of kiosk** card (or Check-in page link)
2. Big-button flow, only asks what's needed on the day; at pay, choose **Pay at the counter**
3. Giant confirmation number + amount due; **Register the next family** resets it
4. Leave it untouched ~90 seconds — it resets itself for the next family (configurable in Settings).
5. As admin: **Registrations** → filter — the kiosk order shows source **🚶 day-of** with status *pending payment*.

### 5.9 Guest lookup edge cases
- Wrong email + right confirmation → "no registration found"
- Pending Zelle order → shows ⏳ instead of QR codes, with an explanation

---

## 6. Test scripts — admin side

Sign in as the super admin. Everything below is in the sidebar.

### 6.1 Email log (your best friend in test mode)
Every email the system sends is captured here — expandable, with the original recipient preserved. Since `APP_ENV=test`, real sending is off (console + log only) and every recipient is redirected to `TEST_EMAIL_OVERRIDE`.

### 6.2 Dashboard
Live metric cards (pending Zelle turns red when non-zero), recent registrations table. Loading the dashboard also auto-releases expired seat holds (abandoned Square checkouts, 48h-stale Zelle orders).

### 6.3 Event editor
1. **Events** → **+ New event** — try "Kali Pujo 2026", theme *Kali*, pick a 1-day date range, add a ticket type ("Adult · with food", $15/$20) and a promo code → **Save & publish**
2. It appears on the public Events page immediately.
3. **Make active** on it → the whole public site switches to the dark Kali theme, and the homepage hero becomes the Kali scene. Switch back to Durga Pujo the same way.
4. Edit Durga Pujo 2026 → change a price → save → verify on the public event page. (Ticket types that have sales can't be deleted, only edited.)

### 6.4 Check-in (door scenario) — the QRs are REAL now
Every ticket QR encodes a URL. Three ways to check someone in:

**A. Phone camera (any phone):** point the camera app at a ticket QR → it opens the live ticket page (`/t/…`) showing a big VALID / ALREADY USED / NOT PAID banner. If you're signed in as admin on that phone, there's a giant **✓ Check in now** button. Scan the same ticket again → "Already checked in at 6:42 PM" — duplicate tickets are caught automatically.

**B. In-page camera scanner:** Admin → **Check-in** → **📷 Scan tickets with camera** — live viewfinder, vibrates on each catch, auto-looks-up the ticket (Chrome/Edge/Android; on iOS Safari use method A). Note: phone camera access needs HTTPS or localhost.

**C. Manual:** paste a confirmation number (whole order) or QR text into the search box.

The check-in counter at the top updates with every check-in, and every one is recorded in the audit log with who did it.
**⚠️ Old printed PDFs won't work.** Any ticket PDF printed before the QR upgrade contains the old text-only codes (your phone will offer a Google search — that's the tell). Re-open the lookup/print page and print fresh — QRs are generated live, so they pick up the new format automatically.

**Scanning with your phone against your local Mac:**
1. Phone and Mac on the same Wi-Fi.
2. In `.env.local`, set `NEXT_PUBLIC_SITE_URL` to your Mac's network address — it's printed when the dev server starts (e.g. `Network: http://10.0.0.130:3000` → set `NEXT_PUBLIC_SITE_URL=http://10.0.0.130:3000`).
3. Restart `npm run dev`, re-open the pass/print page (fresh QRs), scan → the phone opens the live ticket page.
4. Sign in as admin on the phone once, and every scan shows the **✓ Check in now** button.

In production none of this is needed — `NEXT_PUBLIC_SITE_URL` is the real domain and every QR just works.

### 6.5 Registrations & export
Filter chips by status; **⬇ Export CSV** downloads the treasurer sheet (attendees, food choices, amounts).

### 6.6 Settings (super-admin)
1. Change **Zelle recipient email** to anything → Save
2. Start a new Zelle checkout on the public site — instructions show the new recipient instantly. This is the switch you'll flip when the org's real Zelle account is ready. Change it back.

### 6.7 Audit log
Every admin action you just did — mark-paid, activation, event save, settings change, check-in, export — is listed with who/when/what.

### 6.8 Roles & access (super admin)
1. **Roles & access** in the sidebar (only you see it) → invite a test email as *Admin* → check the **Email log** for the invite with its set-password link → open the link → set a password → sign in as them: full admin, but no Roles/Audit in their sidebar, and `/admin/roles` politely refuses.
2. Change their role to *Volunteer* (confirm dialog) → as them, only Check-in is reachable.
3. Try demoting yourself — blocked ("ask another super admin"). Note the last-super-admin lock.
4. Promote someone to super admin → an alert email lands in the admin inbox (Email log).

### 6.9 Forgot password (everyone)
Sign-in page → **Forgot password?** → enter `member.demo@example.com` → Email log has the reset link (1-hour, single-use) → open it, set a new password, sign in with it. Try the used link again — "expired" page. Super admins can also push a reset link to anyone from Roles & access.

> After pulling these changes, run `npm run db:push` once — there's a new `password_reset_tokens` table.

---

## 7. Automated tests

```bash
npm test        # 16 tests, ~5s, safe to run anytime (in-memory DB)
```

Covers: the pricing engine (member discount modes, kids, promo math, members-only tickets), Square webhook signatures (valid/tampered/forged/missing), and the full checkout state machines for both rails including duplicate-webhook idempotency, per-day ticket expansion, and cancellation releasing capacity.

```bash
npm run build   # production build — should finish with no errors
```

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `PGlite … already in use` or DB lock errors | Two processes on one DB — stop the dev server before `npm run seed` |
| Seed says things already exist | Fine — it's idempotent, it skips what's there |
| I broke my data experimenting | Stop server → delete `.data/` → `npm run db:push && npm run seed` |
| `npm audit` shows vulnerabilities | You have an old package-lock — do the clean reset in §2. Never `npm audit fix --force` |
| `drizzle-kit: unknown command 'push'` | Wrong drizzle-kit version installed — clean reset in §2 |
| Emails "not arriving" | They don't, in test mode — check **Admin → Email log** or the terminal running `npm run dev` |
| Square page looks fake | It is — deliberate sandbox. Real Square activates with `PAYMENTS_MODE=live` + API keys, zero code changes |
| Port 3000 busy | `npm run dev -- -p 3001` |

## 9. What is intentionally NOT done yet

Self-serve password reset (admins can reset via DB/support for now) · poster/logo file uploads (URL fields until the Cloudflare R2 pipeline) · production services (Supabase DB, Resend email domain, real Square keys — see README "Going to production").
