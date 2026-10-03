# 15 · Pujo schedule (Pujo Nirghonto) — the terracotta wall

The homepage section that shows the ritual timings of Durga Pujo, built as a
carved terracotta temple wall (concept A, chosen 2026-10-03). It is run from
**Admin → Content → Pujo schedule**.

## What a visitor sees

- A curved Bengal-temple roof, then a brick wall. One carved row per day:
  a date pillar and one plaque per ritual (icon, time, English name, Bengali name).
- Pushpanjali plaques carry a marigold garland.
- A lit niche under the title says what is happening at the mandap right now
  and what is next, in Eastern time:

| When | The niche says |
|---|---|
| Before the first day | "Pujo begins in N days" + all Pushpanjali times |
| During a ritual | "Now at the mandap: X" + "Next: Y · 2:00 PM · in 10 min" |
| Between rituals | "Up next: Y · in 1 hr 30 min" (or "Tomorrow · 10:00 AM") |
| After the last ritual | "Shubho Bijoya · Ashche bochor abar hobe" |

  The plaque for the current ritual glows and is labelled NOW; the next one says
  NEXT; finished ones dim. The page re-checks the clock every 30 seconds.
- **Light.** On a computer the mouse is a lamp: shadows on every plaque fall away
  from it. On a phone or iPad, tapping a plaque glides the light to it. With
  "reduce motion" switched on, the light stays still and nothing flickers.
- Buttons: Remind me (per ritual), Remind me of all the Pushpanjalis, See the
  full flyer, Download.

### Layout by screen

| Width | Layout |
|---|---|
| ≥ 900 px (laptop, iPad landscape) | the full wall: three rows, every ritual visible at once |
| 640–899 px (iPad portrait) | day chooser (three carved pillars) + plaques three across |
| < 640 px (phone) | day chooser + plaques two across; an odd last plaque spans the row |

The day chooser opens on today's day during the Pujo, otherwise on day one.

## Reminders — how they actually work

The website never stores anyone's details and sends nothing. "Remind me" puts
the ritual into the visitor's **own calendar**, and their calendar does the
reminding. A sheet offers the right options for the device:

| Device | First choice | What happens |
|---|---|---|
| iPhone / iPad (Safari) | Apple Calendar | iOS shows the event with "Add to Calendar". Alert 30 min before. |
| Mac | Apple Calendar | The .ics opens in Calendar. Alert 30 min before. |
| Android | Google Calendar | Google Calendar opens with the event filled in; tap Save. Uses the person's usual Google reminder. |
| Windows / other | Google Calendar, or Outlook (.ics) | Outlook imports the .ics with the 30-min alert. |

- Apple / Outlook link: `GET /api/pujo-schedule/calendar?ids=…` returns a
  standard `text/calendar` file (UTC times, `VALARM -PT30M`, stable UIDs so adding
  twice updates rather than duplicates). `&dl=1` forces a download.
- Google link: `calendar.google.com/calendar/render?action=TEMPLATE…&ctz=America/New_York`.
- "All the Pushpanjalis": one .ics with every upcoming anjali; Google gets one
  link per anjali (Google can't add several from one link).
- Opened inside Facebook / Instagram / WhatsApp: the sheet adds a line saying to
  open the page in Safari or Chrome if nothing happens.
- The button then reads "In your calendar" on that device (remembered in the
  browser only).

## The flyer

- Shown in a full-screen viewer on "See the full flyer"; Download saves a JPEG.
- The 2026 flyer ships with the site (`public/pujo/pujo-nirghonto-2026.jpg`).
- Admin upload (JPEG / PNG / WebP): the server rotates it upright and keeps a
  WebP for viewing (≤ 1400 px wide) and a JPEG for download (≤ 2400 px). Stored in
  Vercel Blob (public or private store) or `public/pujo/uploads` locally.
- The flyer is a picture: the site cannot read times from it. The admin page says so.

## Admin

Admin → Content → **Pujo schedule** (grantable in Roles & access; super admins always).

- On the homepage: show / hide; "take it down automatically after" a date.
- The flyer: replace, remove, show the "See the full flyer" button, allow download.
- Days and timings: date, day name (English, Bengali); per ritual: start, until
  (optional), type, name (English, Bengali), a one-line note shown when tapped.
  Rows are put in time order on save.
- Type picks the icon: Puja · Pushpanjali (garland) · Arati · Sandhi Puja · Kumari
  Puja · Bisarjan · Sindoor Khela · Bhog · Other. A Puja whose name says Shashthi,
  Saptami, Ashtami, Nabami or Lakshmi gets its own icon (bel leaf, Kola Bou,
  trishul, hom fire, owl).
- Paste from the flyer: one ritual per line, time first — fills a day's rows.
- Save writes one `system_config` row, `pujo_schedule`, and an audit-log entry.

## Data

`system_config.pujo_schedule` (JSON), default in `src/config/defaults.ts`:

```
{ v: 1, enabled, hideAfter: "YYYY-MM-DD" | "", showFlyer, allowDownload,
  flyer: { display, download, width, height, name, bytes, uploadedAt } | null,
  days: [{ date, en, bn, rites: [{ t: "HH:MM", end?, name, bn?, kind, note? }] }] }
```

No new table and no migration: the config read is the one the homepage already
makes. Anything malformed is cleaned on read; if nothing usable is left the
section simply doesn't render. The section sits inside its own error boundary, so
a fault in it can never take the homepage down.

## Use cases

1. A family checks on Friday what time Ashtami anjali is → sees "Pujo begins…",
   the Pushpanjali line, taps Remind me of all 3 → adds them to their calendar.
2. Someone at the venue on Saturday at 1:50 PM opens the site on their phone →
   Saturday is open, Ashtami Puja glows NOW, Ashtami anjali says NEXT · 10 min.
3. A visitor on a laptop moves the mouse → the light follows; clicks Sandhi Puja →
   the niche shows its note and a Remind me button.
4. The priest moves Sandhi Puja to 2:45 PM → an admin edits the row, saves → the
   homepage shows 2:45 PM; already-added calendar entries update when re-added.
5. The committee prints a corrected flyer → admin replaces the flyer and checks
   the rows still match.
6. After Dashami → "Shubho Bijoya" until the take-down date, then the section is gone.
7. An admin switches the section off → it disappears from the homepage at once.

## Test cases

| # | Check | Expect |
|---|---|---|
| T1 | Clock 3 Oct | phase before, "in 6 days" |
| T2 | Sat 10 Oct 1:50 PM | now = Maha Ashtami Puja, next = Ashtami Pushpanjali, 10 min |
| T3 | Sat 2:10 PM | now = Ashtami Pushpanjali (until 2:30 PM) |
| T4 | Sat 2:34 PM | now = Sandhi Puja; next is Sunday 10:00 AM ("Tomorrow") |
| T5 | Sun 4:30 PM | after |
| T6 | Sat 9:00 AM | no now; up next Saptami Puja in 1 hr 30 min |
| T7 | .ics for one ritual | VCALENDAR/VEVENT, DTSTART 20261010T180000Z for 2:00 PM EDT, VALARM -PT30M, CRLF, escaped text |
| T8 | .ics, date in EST (Nov) | 2:00 PM → 19:00Z |
| T9 | Google link | dates=20261010T140000/20261010T143000, ctz=America/New_York |
| T10 | Paste "2:00 PM–2:30 PM – Maha Ashtami Pushpanjali" | t 14:00, end 14:30, kind anjali |
| T11 | Malformed config (bad times, empty names, no days) | cleaned; section hidden when no days |
| T12 | Today after hideAfter / enabled off | not on homepage |
| T13 | Bundled flyer file exists | yes |
| T14 | Browser 1440 / 1180 / 1024 / 820 / 390 px | wall vs chooser as in the layout table; no horizontal scroll |
| T15 | Admin save round trip | homepage reflects the edit; audit row written |
| T16 | Reduced motion | no flicker, light still |
