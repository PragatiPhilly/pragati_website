# 16 — After the event: thank-you mode (Durga Pujo 2026 → Kali Pujo)

Audit done 2026-10-19, eight days after Durga Pujo 2026 ended (Sun Oct 11).
The live homepage still said "Pujo is here — come join us" and online
registration was still taking orders for past dates.

## A. Already switched off by date — nothing to do
| Element | Why it is already gone |
|---|---|
| Pujo schedule (Nirghonto) wall | `hideAfter` = 2026-10-12 |
| Pujo menu (Kolapata thali) + caterer signboard | menu `lastDay` = 2026-10-11 |
| Home banner ("Early Bird…") | `home_banner_enabled` = no |
| Nightly EC summary email | only sends on event nights |
| /events page | Durga Pujo moved to "Past" automatically |

## B. Wrong on the live site — fixed by this change
| # | Where | Was | Now (post-event mode) | Controlled by |
|---|---|---|---|---|
| 1 | Homepage countdown card (hero + seam) | "Pujo is here · The dhaak is playing — come join us · through Sun Oct 11" | Thank-you card: title, Bengali line, 4 numbers, message | `post_event_mode`, `recap_*` |
| 2 | Hero buttons | "Register for Durga Pujo 2026 →" | "Become a member →" (+ "Look back at the lineup") | `post_event_mode` |
| 3 | Under hero image | "Next celebration · Durga Pujo 2026" | "Just celebrated · Durga Pujo 2026" | `post_event_mode` |
| 4 | Lineup section | "Pujo weekend · live on stage", concert Buy buttons | "Pujo weekend · thank you for coming", no buy buttons | `post_event_mode` |
| 5 | Invitation band | "You're invited home · Register →" | "Thank you for coming home" + recap message + button | `post_event_mode`, `recap_cta_*` |
| 6 | Floating "Register for…" pill | shown on scroll | off | `post_event_mode` |
| 7 | Homepage events grid | "★ Featured" on Durga Pujo | "✓ Celebrated" | `post_event_mode` |
| 8 | /register | still selling 10 open online passes (3 concert passes, no-food day passes, under-5) for past dates | "Durga Pujo 2026 has ended — thank you" page; server refuses any order once the event's end time has passed | event end time (hard rule) + `registration_paused` |
| 9 | /events/durga-pujo-2026 | ticket price table + "Register — it takes 2 minutes" | "This celebration has ended" note; prices hidden | event end time |
| 10 | Mobile menu + footer | "Register for the next event" | hidden while registration is closed | event end time + `registration_paused` |
| 11 | Nav "Pujo Sponsorship", Donate page "Sponsor this year's Durga Pujo", homepage "Sponsor this year's Pujo" | Pujo framing | Year-round "Donate" framing | `donation_mode` = generic (setting value) |
| 12 | Settings page | "Registration paused" kill switch existed but was not on the page (dashboard said "re-enable in Settings") | Added, with its message | `registration_paused` |
| 14 | Home banner | a banner still linking to /register would keep selling | hidden in thank-you mode if it links to /register; any other banner (an announcement) still shows, labelled "From Pragati" | `post_event_mode` |
| 13 | Home banner eyebrow | hard-coded "Durga Pujo 2026 · registration open" | "<active event name> · registration open" (ready for Kali), on all banner designs | active event |

## C. Left alone (flagged)
- 30 unpaid card checkouts + 1 pending Zelle for Durga Pujo: payment links never expire
  by design; a late payment lands in Reconciliation. Review there, no code change.
- Staff tools (walk-in desk, gate, kitchen, coupon desk, door list): staff-only, keep.
- Membership, magazine, leadership photos, About page: year-round, unchanged.
- "Kali Pujo 2026 · Coming soon" tablet on the homepage: stays until the Kali event is published.

## D. Settings — new group "After the event — thank-you mode"
- `post_event_mode` — `auto` (default: switches on by itself once the active event's
  end time passes) | `on` (force) | `off` (old behaviour).
- `recap_title`, `recap_title_bn`, `recap_message`
- `recap_stat_1..4_value` / `recap_stat_1..4_label` — blank value hides that number.
- `recap_cta_label` / `recap_cta_href` — optional button (e.g. a photo album).

Starting numbers (from the database on 2026-10-19 — online + comp + desk tickets only;
walk-ins on the paper coupon desk are NOT counted, so the EC may want to replace the
second number with the official attendance):
3 days of Pujo · 650+ passes issued (663) · 160+ families booked online (159) · 2 concert nights.

## E. Kali Pujo switch-over (next step, not in this change)
Create the Kali Pujo event → set `active_event_slug` → theme flips to `kali` and
post-event mode turns itself off (`auto`) because the new event hasn't ended →
un-pause registration if paused → banner text, schedule, menu as needed.
