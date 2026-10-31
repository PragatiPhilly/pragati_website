# 20 — Homepage box: countdown or numbers, per event

## Asked
EC (Oct 30): a countdown suits Durga Pujo (people wait for it) but not Kali Pujo.
For smaller events the box under the homepage picture should show a past
festival's turnout (Durga Pujo 2026's numbers) so Pragati events read as well
attended. Admins pick which, per event.

## How it works
Admin → Events → Edit → **Homepage box**: ⏳ Countdown (default) or 📊 Numbers.
Numbers = heading, optional Bengali line, up to 4 number + label pairs, small
tab text, optional line underneath. Picking Numbers the first time fills in the
thank-you card's numbers (Settings) and the last finished event's name, dates and
venue; "Reset to the last festival's numbers" does it again. Plain numbers count
up ("1000+" → 1000 with a +); anything else ("$5k") shows as typed. No numbers
typed = the countdown shows.

Stored as `home_box:<event id>` in system_config (JSON) — no schema change;
missing or unreadable = countdown. Once the event is over the thank-you card
(spec/16) replaces the box either way. Same card frame as the countdown, so the
layout doesn't move. Code: lib/home-box.ts (pure), lib/home-box-server.ts.

## Kali Pujo 2026
Self-applying job `2026-11-kali-home-box-numbers` starts Kali on Numbers
("Durga Pujo 2026 — by the numbers": 3 days of Pujo · 1000+ attendees · 2 concert
nights · Oct 9–11 · Greater Philadelphia Expo Center) — only if no box was chosen
yet, so an admin's later choice is never overridden.

Also: the thank-you card's date line now reads as one date for a one-night event.

## Tests
tests/home-box.test.ts (parsing, suggestion, count-up, blank → countdown,
one-night dates) · tests/seasons.test.ts (Kali job once, respects admin choice).
