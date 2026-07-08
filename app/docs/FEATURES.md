# Pragati Platform — Complete Capability Inventory

Everything the platform does today, organized by who it serves.
Companion docs: [TESTING.md](./TESTING.md) (how to try it all) · [../../archive/BUILD-PLAN.md](../../archive/BUILD-PLAN.md) (history & decisions).

---

## 1 · The public website

| Capability | Detail |
|---|---|
| Festive homepage | Prototype-faithful: bilingual hero, alpona spine & self-drawing dividers, mission courtyard, count-up stats with dhaki, magazine stack, shloka breaker, membership price card, donate band |
| Jamini Roy Durga | Hand-built folk-art scene — Maa with baby Ganesh on her lap, Lakshmi, Saraswati, little Kartik, the white lion, owl/swan/fish companions — breathing, garland swaying, diyas flickering |
| Living time-of-day | Site ambience follows the visitor's clock: dawn blush, golden day, aarti-orange dusk, starry night with glowing diyas |
| Star-nights lineup | Real poster cards (Anjan Dutt · ভূমি) with aligned info tablets, "coming soon" state; hero button smooth-scrolls to it every time |
| Coming-soon pujo tablets | Kali & Saraswati placeholder cards that auto-replace themselves when a real event of that theme is published |
| Petal cursor trail | Desktop-only marigold trail over the hero (reduced-motion aware) |
| Dhaak heartbeat | Opt-in 🥁 button: synthesized dhaak rhythm; logo, diyas, garlands pulse to the beat |
| Countdown on the seam | Live countdown card floating between hero and next section |
| Events pages | List + detail with ticket-type pricing table, member prices, venue/map |
| Donations | $25–$500/custom, in-honor/in-memory with honoree notification email, anonymous option, both payment rails, DON- confirmation numbers, tax-receipt email |
| Guest lookup | Email + confirmation number → the Pujo Pass (no login needed), rate-limit-friendly design |
| Membership signup | Family account → dues instructions (Zelle memo) → admin activation → welcome email |
| Mobile | Hamburger nav, responsive everywhere, kiosk-sized touch targets in day-of mode |
| 404 + transitions | Themed "দুঃখিত!" page; soft page-enter animation everywhere |

## 2 · Registration — the Pujo Journey

| Capability | Detail |
|---|---|
| The Journey scene | Illustrated village path above the questions: gate → home → banyan → lantern-days → bhog handi → dakshina counter → pandal. Your family walks it as folk figures; each added person pops in; arrival rains petals |
| Conversational steps | One question per card, bilingual step names, spring transitions, visible ← Back on every step after the first, no data loss going back |
| Member magic | Signed-in members: details prefilled, family as tap-to-add chips, member pricing applied per rules (per-adult or whole-family mode, kids always member price) |
| Per-person plans | Each attendee picks own days (grandma Sunday-only) and food (veg / non-veg / no food; kids auto kid's-meal) |
| Live pricing | Order builds in real time; promo codes validate inline with the total animating |
| Email required | Enforced client + server — tickets always have somewhere to land |
| Day-of kiosk | `?mode=dayof`: big type, today-only, pay-at-counter option, giant confirmation, idle auto-reset (configurable seconds) |
| Payment rails | Square (sandbox simulator in test — identical signed-webhook path as production) and Zelle (copy-buttons, memo = confirmation number, "I've sent it" → holds seats 48h) |

## 3 · Tickets, QRs & the gate

| Capability | Detail |
|---|---|
| Real scannable QRs | Every pass QR encodes a URL — any phone camera opens the live ticket page (`/t/…`) |
| Live ticket page | Big status banner: ✅ VALID / 🔁 ALREADY USED (with time) / ⛔ NOT PAID — plus attendee, pass type, day, food, booker |
| One-tap staff check-in | Signed-in staff scanning a pass get a giant ✓ Check in now button; second scan flags the duplicate and says to check ID |
| In-page camera scanner | Check-in desk has a live viewfinder (BarcodeDetector), vibration feedback, auto-lookup; graceful fallback note for iOS Safari |
| **"Nothing on me" rescue** | Desk search by **name, phone, or email** — finds attendees AND buyers across paid registrations |
| **Party check-in** | One tap checks in the whole family (✓✓ Check in all N) |
| **Undo check-in** | Scanned the wrong person? One-tap undo, audit-logged |
| Volunteer role | `volunteer` accounts can use ONLY the check-in desk and scan pages — no money, members, or settings. Seeded demo: volunteer.demo@example.com / volunteer-2026 |
| Pujo Pass | Elegant keepsake ticket on lookup: sindoor header, garland edge, per-person QRs, print/save button |
| Printable sheets | Print page: one bordered pass per person, browser print → PDF |
| Complete ticket email | Per-person pass links + all-passes link + print link + "any organizer can resend" note |

## 4 · Admin — daily operations

| Capability | Detail |
|---|---|
| Dashboard | Live metrics (pending Zelle turns red), recent registrations, quick cards incl. day-of kiosk launcher; auto-releases expired holds on load |
| **Zelle queue** | The treasurer screen: oldest-first pending payments (tickets + donations tabs), confirm-guarded Mark paid (→ tickets email) / Cancel |
| Registrations | **Search by name/email/phone/conf** + status filters + CSV export. Per row: 🎟 Passes (pull up anyone's QRs at the desk) · ✉ Resend tickets · 💵 Mark paid (cash at counter → tickets email) · ✎ Fix buyer email (auto-resends if paid) · Delete |
| Guarded delete | Inline confirm → releases seats → **full snapshot preserved forever in audit log** → **alert email with the snapshot** to the configured admin address |
| **Kitchen report** | Per-day × food-preference plate counts (paid only) with live "checked-in" consumption — the caterer's answer sheet |
| Members | Family list, sizes, dues status, activate (→ welcome email) / deactivate |
| Event editor | Create/edit: bilingual names, theme (drives whole site), auto-generated days from date range, ticket types (age band, full-pass/single-day, food, dual pricing, capacity; sold types can't be deleted), promo codes; make-active switch |
| Donations | List with honoree/anonymous flags, statuses |
| Email log | Every email ever sent, expandable bodies, original recipient preserved (test mode redirects all to the override address) |
| Audit log | Super-admin view of every action: check-ins & undos, mark-paids, resends, email fixes, deletions (with snapshots), settings changes, exports |
| Settings (live) | Zelle recipient & display name, verification SLA & hold hours, membership price, discount mode, from/reply-to, treasurer alerts, **deletion alerts**, active event, kiosk idle timer — all change instantly, no deploy |

## 5 · Money & trust

| Capability | Detail |
|---|---|
| Two rails, one truth | Square webhook is signature-verified (HMAC) and idempotent — replayed/duplicated webhooks can't double-fire emails or state |
| Server-side pricing | The client shows a mirror; the server re-prices authoritatively at submit — no browser tampering |
| Reservations | Square holds 15 min, Zelle 48 h after "I've sent it"; expired holds release seats automatically (admin load + `/api/cron/sweep`) |
| Confirmation numbers | Human-friendly sequential PRG-YYYY-NNNN / DON-YYYY-NNNN |
| Unguessable passes | QR tokens are UUIDs; guest lookup needs email + confirmation together |
| Sessions | Signed JWT cookies (30-day), scrypt password hashing, role-gated routing at the proxy |
| Test mode | All email redirected to your inbox + logged; Square simulated end-to-end; Zelle recipient = your email until flipped in Settings |

## 6 · Accounts, roles & recovery

| Role | Can do |
|---|---|
| Guest | Register, donate, look up passes — no account ever required |
| Member | All guest powers + prefilled family, member pricing, /m dashboard (family CRUD feeds registration, ticket history, profile & password) |
| Volunteer | Check-in desk + scan-to-check-in only — nothing else in admin |
| Admin | Everything in admin EXCEPT Roles & access, and the audit log |
| Super admin | Everything + **Roles & access** (grant/revoke any role, invite by email, send reset links), audit log, settings |

**Roles & access console** (super-admin only): invite anyone by email with a role — they receive a one-time link (7-day expiry) to set their own password; change any user's role from a dropdown (confirm-guarded, audit-logged); super-admin grants/revocations additionally email an alert to the configured admin address. Safety rails: you can't change your own role, and the last remaining super admin can't be demoted — the org can never be locked out.

**Password recovery** (everyone): "Forgot password?" on the sign-in page → emailed one-time link (1-hour expiry, sha256-hashed at rest, single-use) → set a new password. The flow never reveals whether an email has an account. Super admins can also push a reset link to any user from the Roles console — for the aunty who calls instead of clicking.

## 7 · On the wishlist (not built yet — say the word)

- Attendee self-service edits (change day/food after purchase) with admin approval
- SMS ticket delivery (Twilio) for the no-email generation
- Waitlists when a ticket type sells out; capacity warnings on the dashboard
- Per-event volunteer scanning stats ("gate 2 checked in 340 people")
- Bulk email to an event's attendees ("parking has moved!")
- Real image uploads (posters/logos) via Cloudflare R2
- Multi-language toggle (full বাংলা interface)
- Production launch checklist: Supabase DB, Resend + domain, live Square keys — see README

---

### Seeded test accounts

| Role | Email | Password |
|---|---|---|
| Super admin | sayantankundu93@gmail.com | pragati-admin-2026 |
| Member family | member.demo@example.com | member-demo-2026 |
| Gate volunteer | volunteer.demo@example.com | volunteer-2026 |
