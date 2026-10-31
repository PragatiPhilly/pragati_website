# 19 — Seasons: keep one event, start the next (Kali Pujo 2026)

## What the committee asked
Durga Pujo 2026's data (registrations, payments, donations, dashboards) kept as a
backup that can be loaded with one click; Kali Pujo 2026 starting fresh; the
homepage featuring Kali Pujo with Durga Pujo shown as a past event.

## Design — nothing is moved or deleted
Every row stays in its table. The admin tabs look through an **event lens**:

| Data | Belongs to |
|---|---|
| registrations, tickets, desk orders | `registrations.event_id` |
| ledger rows for tickets | the registration's event |
| gifts added at checkout | the registration they came with |
| standalone donations, membership dues, unmatched card payments | a **season tag** written at close-out; untagged = the current event |
| members | not per event (the roster carries on) |

Tags live in a new table `season_tags` — no column is added to `payments` or
`donations`, so no money query can break before a migration runs.

## The switcher
Dashboard, Registrations, Payments, Donations, Kitchen and Food line show
"Showing: <event> ▾". Picking a past event loads that event's numbers on all of
them (amber "archive view" + "Back to <current>"). Stored in a cookie per admin.
Operational pages (Scan desk, Walk-in desk, Coupon desk, Right now) always work
on the current event. Zelle queue, Reconciliation and Money to bank stay
whole-org: they are to-do lists.

## The one button (Admin → Events)
"Close <current> & start <next>":
1. files every unfiled donation / dues / other payment under the outgoing event
2. freezes its final numbers in `event_archives` (registrations, people, money by
   stream, refunds, check-ins, plates) — shown on its Events card with CSV
   downloads and "Load this event in admin"
3. makes the next event current, and publishes it (opens registration) if ticked

Repeatable and safe: tagging only fills gaps; the archive row is upserted. The old
"Make active" button now goes through the same close-out, so a switch can never
leave old donations showing under the new event.

## Kali Pujo 2026
Created on deploy as a **draft** (self-applying job `2026-11-setup-kali-pujo-2026`;
skipped if the slug exists): Sat Nov 14, 5:00–11:30 PM ET, West Bradford
Elementary School, 1475 Broad Run Rd, Downingtown, PA 19335. Passes: Adult $55 /
member $50 · Youth 12–17 $25 · Child 5–11 $15 · Under 5 free · dinner included.
A "Saturday · Dinner" food window is created closed.

## Eastern time everywhere (lib/tz.ts)
The club is in Pennsylvania; the servers run in UTC. Every date/time an admin
types or reads is America/New_York (EST/EDT switch automatically): the event
form's Starts/Ends, promo end dates, membership start/expiry, "today" on the
scan desk and registration form, receipt year, and all public date labels. An
event ending before 6 AM the next morning is still one event day. The job
`2026-11-fix-kali-pujo-2026-times` repairs the save made with the old form
(7 PM stored as 7 PM UTC = 2 PM ET, plus a phantom Sunday): it sets the start
to 7:00 PM ET and drops Sunday if no Sunday passes exist; it does nothing if
the event is already right.

Kitchen report follows the meal windows in Scan setup (Kali: Saturday · Dinner
only). Scan desk / Scan setup counts and the Walk-in follow-up badge count only
the current event.

New age bands `child_5_11` and `child_12_17` (lib/bands.ts). A child uses the most
specific band the event sells, else the single `child_5_18` price — so Durga-style
events are unchanged. The walk-in desk asks for a child's age when the price
depends on it, rather than guessing.

## Homepage / public
Featured = the current event. The last finished event shows as a small "Past
event · thank you" card. One-night events read as one date with times.

## Tests
`tests/seasons.test.ts`: Kali setup (once, never overwrites, EC prices) · split
child pricing (14 → $25, 8 → $15, 2 → free) · desk asks for age · attribution of
ticket money / checkout gifts / standalone gifts · close-out files strays, freezes
numbers, switches + publishes · after the switch new money lands in Kali and
Durga's view is unchanged · live summary of a past event still loads.
