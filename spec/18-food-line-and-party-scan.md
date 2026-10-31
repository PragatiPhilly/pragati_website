# 18 — Plate choices, under-5 passes, and the party scan (gate + food line)

Status: building for Kali Pujo 2026. Asked for by the EC after Durga Pujo 2026,
where coupons were miscounted and the food line jammed: one person showed the
family's QR at the front and the rest of the family had no phone.

Goal: go fully digital at the food line, so no paper coupons are needed. Every
decision below can be changed on the day from Admin, without a code change.

---

## 1. What changes for families (registration)

| Who | Plate choices | Price |
|---|---|---|
| Adult / student with food | Adult veg · Adult non-veg | unchanged |
| Teen 12–17 | Adult veg · Adult non-veg · Kid veg · Kid non-veg | same youth price whatever they pick |
| Child 5–11 | Kid veg · Kid non-veg | unchanged |
| Under 5 | Kid veg · Kid non-veg (always gets a plate) | free |

- **Under-5s always get their own pass and QR**, emailed like everyone else's,
  so the gate count and the plate count include them. If the event has no
  under-5 pass, a free pass is still issued (the walk-in desk already did this).
- The teen age (12) is a setting: **Admin → Food line → "Adult meal from age"**.
- A child whose age is not known (a family-profile kid with no date of birth, a
  walk-in) may pick any of the four. Price does not depend on it, so there is
  nothing to game.
- The server re-checks every choice. An 8-year-old sent with "adult veg" is
  stored as "kid veg" (same diet, kid plate) — never refused, never charged.

Stored as `tickets.food_pref`: `veg`, `non_veg` (adult plates), `kid_veg`,
`kid_non_veg`, plus the old `kid` (kid plate, veg/non-veg never asked — older
bookings) and `none`. No schema change.

## 2. The party — one QR shows the whole booking

A **party** is one booking (confirmation number, e.g. PRG-2026-0123). Scanning
ANY pass on it, or searching a name/phone, shows everybody on it. Other bookings
by the same family (same email or phone, or a walk-in desk add-on to the
booking) show as **"Also booked by this family"** with one tap to bring them in.

## 3. Gate (Scan desk → Entry)

Scan → the scanned person is checked in (as today) → the screen stays on the
party, not just a 3-second flash:

- Big header: **"Rahul is in — 3 more on this booking"**
- One big button: **"Check in all 3 others"**. Or tap individual names.
- The party's plates for today ("2 adult non-veg · 1 kid veg · 1 under-5").
- Rescanning the same QR when others are still outside is **amber** ("1 still
  outside — check in Riya"), not the red "already used". Red only when
  everybody on the booking is already in.

## 4. Food line (Scan desk → the open meal chip)

Scan or search → the **party plate screen**. Built for a phone held at waist
height in a rush: whole-screen colour, numbers you can read at arm's length.

```
┌───────────────────────────────────────────┐
│ DAS FAMILY · PRG-2026-0123   Sat · Dinner │
│                                           │
│  ███ ADULT NON-VEG   2 left (of 3)  − 2 + │
│  ███ KID VEG         1 left (of 1)  − 1 + │
│                                           │
│        [  GIVE 3 PLATES  ]                │
│                                           │
│  ▸ People (4) · 3 of 4 checked in at gate │
└───────────────────────────────────────────┘
```

- Each plate type is its own colour (Admin → Scan setup sets the colours).
- Steppers start at "everything left". If only 2 of 3 are in the line, tap −
  once and give 2. The third plate stays owed.
- After giving: full-screen flash naming exactly what to hand over
  ("GIVE: 2 ADULT NON-VEG · 1 KID VEG").
- The third person comes later, scans (or is searched) → **"1 plate left"**.
- Everything given and they come back → red **"ALL 4 PLATES GIVEN"** with the
  times and who gave them.
- Open "People" to give or undo for one named person, or **change a plate**
  (registered veg, wants non-veg) — logged, and the kitchen counts follow.

### Who is refused, and how it reads

| Situation | Screen |
|---|---|
| Not paid (card unfinished, Zelle unverified, open desk order) | red **NOT PAID — send to walk-in desk** |
| Walk-in let in owing money | served, yellow **BALANCE OWED $x** bar |
| Pass refunded/cancelled | that person is not counted; others still served |
| Pass not for today | that person greyed "not for today" |
| Adult pass without food, concert-only adult | "no meal" greyed, not counted |
| Concert-only kid | kid plate at dinner windows only (existing coupon rule) |
| No meal window open | grey **No meal is being served right now** (admins see an Open button) |
| Not one of our QRs / another event | red **NOT OUR TICKET** |
| Not checked in at the gate | yellow note "2 of 4 checked in at the gate"; still served (Admin can switch to *require gate check-in*) |
| Two volunteers scan the same family at once | the database lets each plate be given once; the slower phone sees "someone just gave 1 of these" and the real count |

### Plates without a pass

**Off-list plates** — volunteers, performers, purohit, committee guests, a plate
paid for at the counter. Logged with a reason and counted separately, so the
kitchen total still adds up without paper coupons.

## 5. Admin → Food line (new section, Event day group)

For today's meal windows, refreshing every 15 seconds:

- Open / Close each window (admins).
- Per plate type: **Booked · Given · Left**, plus off-list plates and a total.
- Families still owed plates (partly served) — name, booking, plates left.
- Last 20 plates given — who gave them, undo (admins).
- Off-list plates form.
- Settings: adult meal from age (12); require gate check-in before food (off).

Volunteers can be given this page in Roles & access like any other section.

## 6. Also updated

- Kitchen report: four plate types (+ "kid, not chosen" for older bookings).
- Coupon rules / coupon desk: a teen on an adult plate counts as an adult plate;
  kid veg counts towards the veg number. The coupon desk stays as a fallback.
- Tickets email, pass page, door list, gate sheet, CSV export: plate wording.
- Walk-in desk party builder: same plate choices.
- Food scans accept walk-ins let in owing money (they were refused before,
  unlike at the gate).

## 7. Test cases

Rules (pure):
1. Adult choices = adult veg/non-veg; 12–17 = four; 5–11 and under-5 = kid veg/non-veg; unknown-age child = four.
2. "Adult meal from age" setting changes the teen boundary.
3. 8-year-old sent "veg" → stored `kid_veg`; sent "non_veg" → `kid_non_veg`; under-5 sent "none" → kid plate.
4. Plate of legacy `kid` = kid plate, diet unknown.
5. Teen on adult plate counts as Adult in coupons/kitchen; `kid_veg` counts as veg.

Checkout:
6. Under-5 online with no under-5 pass → a $0 pass is issued with its own QR.
7. Under-5 online with the "Under 5 : Free" pass (no food) → still a kid plate at the food line.
8. Teen adult-veg costs the same as teen kid meal.

Food line (database):
9. Party of 4 (2 adult NV, 1 kid veg, 1 under-5) → 4 left, by type.
10. Give 3 → 1 left; rescan → 1 left; give → 0; rescan → ALL GIVEN.
11. Give "2 adult non-veg" picks two unserved tickets; never the same one twice.
12. Two concurrent gives for the last plate → exactly one succeeds.
13. Unpaid booking → refused; desk-admitted-owing → allowed with balance note.
14. Refunded pass not counted; pass for another day not counted.
15. Adult no-food pass and concert adult → not counted; concert kid → counted at dinner only.
16. Undo a give → plate is owed again; audited.
17. Change plate → counts move; audited.
18. Off-list plates appear in the window totals, not in any family.
19. Linked booking (same email) is listed under "Also booked by this family".
20. Window closed → refused.

Gate:
21. Scan one QR of a family of 5 → 1 in, "check in all 4 others" checks in only today's passes.
22. Rescan with others outside → amber, not red; everyone in → red duplicate.
