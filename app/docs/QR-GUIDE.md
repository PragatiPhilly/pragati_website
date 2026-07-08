# Pragati QR System — Setup & Operations Guide

Everything about how ticket QR codes work, how to set up scanning for an
event, and how to run the gate and the food line on event day. Written for
organizers and volunteers — no coding needed for day-of operations.

---

## 1. How a ticket QR works

Every paid attendee gets **one personal QR code** on their ticket (emailed,
printable, and viewable on their phone via the ticket lookup page).

- The QR encodes a link: `https://<site>/t/<code>`. The code is an
  unguessable ID — the QR itself is the pass; there's nothing to forge or
  look up manually.
- **Anyone** who scans it with a phone camera sees the live ticket status
  (valid / already used / not paid).
- **Signed-in staff** (admin or volunteer) who scan it additionally get
  action buttons: check in at the gate, or serve at an open food window.
- One QR = one person. A family of five has five QRs (all on the same
  confirmation email).

There is nothing to print or configure per ticket — QRs are generated
automatically at purchase.

## 2. Scan types

The system supports two kinds of scans, both run from **Admin → Scan desk**:

**Entry check-in** (always on)
- A pass checks in **once for the whole event**.
- Scanning a QR checks the person in instantly (green banner + running count).
- Scanning the same QR again shows a big red **"ALREADY CHECKED IN at
  \<time\>"** flag — ask for photo ID against the booking name if the person
  in front of you claims they haven't entered.
- The dashboard on the Scan desk and Scan setup pages shows **checked-in /
  total tickets** live.

**Food windows** (breakfast / lunch / dinner — optional, per event day)
- Each pass works **once per window**. Someone who went through the lunch
  line can't come back for seconds during lunch — but their QR works again
  at dinner.
- A successful scan flashes the attendee's **food color** full-width:
  veg / non-veg / kid's meal — so servers know which plate to hand over
  without reading anything.
- A repeat scan inside the same window shows a red **"ALREADY SERVED at
  \<time\>"** flag.
- Day passes are enforced: a Saturday-only ticket is rejected at a Sunday
  lunch window.

## 3. Before the event — Admin → Scan setup

1. Open **Admin → Scan setup** (admin or super admin).
2. Under **Food scans**, click **"+ Use this scan"** for each meal you're
   actually serving, per event day (e.g. Saturday: lunch + dinner;
   Sunday: lunch only). Skip meals you don't serve — fewer buttons on
   event day.
3. Check the **food color codes** (defaults: green = veg, red-brown =
   non-veg, blue = kid's meal). Change them if your kitchen uses different
   colored plates/stickers and hit **Save colors**.
4. Make sure your gate/food volunteers have accounts with the
   **volunteer** role (Admin → Roles & access). Volunteers see *only* the
   Scan desk — nothing else in the admin.

## 4. On event day

**Gate:**
1. Volunteer signs in on their phone → **Admin → Scan desk**.
2. Leave the mode on **🎟 Entry check-in**.
3. Tap **"Scan tickets with camera"** and point at each QR. Green = in.
   Red = already used. Gray = not paid / not one of ours.
4. No QR? Search by **name, phone, or email** — the "Check in all — whole
   party" button handles families in one tap.

**Food line (e.g. when lunch starts):**
1. An **admin** opens **Scan setup** and taps **▶ Open** on that meal window.
2. On the Scan desk, a new chip appears (e.g. **🍛 Saturday · Lunch**) —
   volunteers tap it to switch into serving mode.
3. Scan each QR: the screen flashes the food color + name. Hand over the
   matching plate. Red flag = they already ate this meal.
4. When serving ends, the admin taps **■ Close**. Live counts (total +
   per food type) stay visible on Scan setup — useful for the kitchen.

**iPhone note:** if the in-page camera scanner isn't available (older iOS
Safari), volunteers can scan any ticket QR with the regular **camera app** —
it opens the ticket page with the same check-in / serve buttons after
signing in.

## 5. Fixing mistakes

- **Wrong person checked in at the gate** → find them on the Scan desk
  (entry mode) and tap **undo**, then check in the right ticket.
- **Duplicate flag but the person clearly hasn't entered** → someone else
  scanned their QR (e.g. a forwarded email). Verify photo ID against the
  booking name shown on the flag, then use undo + re-check-in under an
  admin's judgment.
- **Walk-ins without tickets** → send them to the day-of kiosk
  (`/register?mode=dayof`), which sells on the spot; their new QR works
  immediately.

## 6. Counts & reports

- **Scan setup** — live totals per food window, broken down by veg /
  non-veg / kid.
- **Scan desk** — checked-in vs tickets issued.
- **Admin → Kitchen** — plates needed per day per food type (paid tickets),
  with live "in" counts.
- Every scan is written to the **audit log** (who scanned, when, which
  window), so disputes can always be reconstructed.

## 7. Technical reference (for developers)

- QR content: `NEXT_PUBLIC_SITE_URL` + `/t/<qrCode>`; codes are
  `PRAGATI-TKT-<uuid>` generated at ticket creation
  (`src/lib/confirmation.ts`), rendered as PNG by `/api/qr/[code]`.
- In-page scanning uses the browser `BarcodeDetector` API
  (`src/app/admin/checkin/QrScanner.tsx`); browsers without it fall back to
  the camera-app → ticket-page flow.
- Entry check-in state lives on the ticket row (`tickets.checkedInAt/By` —
  one-time per event). Meal scans live in `ticket_scans` with a **unique
  index on (session, ticket)** — the database itself guarantees
  once-per-window even if two volunteers scan the same QR simultaneously.
- Scan windows are rows in `scan_sessions` (per event × meal × day, with
  open/closed status), managed in `src/app/admin/scans/`.
- Food colors are runtime config (`food_color_veg` / `food_color_non_veg` /
  `food_color_kid` in `system_config`).
- Tests: `tests/scan-sessions.test.ts` covers the once-per-window and
  window-uniqueness guarantees.
