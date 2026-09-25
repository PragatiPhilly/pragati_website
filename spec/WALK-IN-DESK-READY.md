# Walk-in desk — ready to push

All 48 files are on your Mac at `Documents/Pragati/app/`, byte-identical to what
was verified. Nothing else in the repo was touched.

**Verified on the final tree:** `tsc --noEmit` clean · **139 tests pass** ·
`next build` compiles clean · every desk screen driven in a real browser as
both a super admin and a volunteer · all 14 existing admin/public pages load
with no console errors.

## One thing to do by hand
Delete `app/_to_delete/` — it holds the old `ShiftBanner.tsx` that
`CashBoxStrip.tsx` replaced. Nothing imports it. (The bridge can't delete
files, so I moved it out of `src/` instead.)

---

## What a volunteer now sees

**First screen:** one question — "Who's at the desk?" — a search box, and one
big red **Register a new family**. The cash box is a quiet strip, not a wall:
you can register people before it's started, and the payment screen asks for it
at the moment you actually touch money. Below that, **Still to pay** first (the
only list worth interrupting for), then everyone else — no longer both, which
had every unpaid family listed twice.

**Registering:** only a name is required. Food is now **one** question with
three answers (Veg / Non-veg / Not eating) instead of four identical buttons
asking two different questions. A $0.00 total next to three lit-up day buttons
now says "Type a first name to see the price" instead of looking broken.

**Taking money:** cash, cheque, Zelle, card — four buttons, one form. A Zelle
to somebody's own phone records whose. The card shows a scannable code on the
payment itself.

**Chasing up:** one card per family — their phone as a tap-to-call link, their
outstanding items, one email box, one "All sorted for Ratul". Nobody chases a
"missing email"; they ring Ratul once and fix everything.

---

## Bugs found by rendering, not by reading

- **Tiles ran together on one line** — a missing `display:block`.
- **Every bold run lost its trailing space** ("The cash box**is** just a
  record"). SWC drops it when the sentence contains an HTML entity like
  `&apos;`. Fixed with real `’` characters; a browser sweep now checks all five
  screens for it automatically.
- **"PAID IN FULL ✓" over a card that hadn't gone through.** The balance is
  due − collected − pending, so starting a card payment drove it to zero. A
  volunteer reads the green tick and waves the family in; if the card then
  declines the money is gone. There are now three states — Still to pay /
  **Waiting on the card** (amber) / Paid in full — and the finish button says
  "Finish anyway — the card is still unconfirmed". Pinned by test TR-11.
- **The payment code vanished the instant it was created** — it lived in the
  payment form, which collapses when the balance hits zero. It's now on the
  payment row where it belongs, and stays until Square answers.
- **The payment button kept the old amount.** Pay $100 of $145 and it still
  offered "Take $100.00" beside a $45.00 balance.
- **The cash count was pre-filled with the expected total** — the screen said
  "That matches exactly" before anyone touched the money. Now starts empty,
  button disabled until a real number is typed.
- **The undo panel demanded a reason next to buttons that were the reason.**
  Tapping "I recorded it by mistake" answered with an error asking why.
- **The QR silently 400'd on a relative payment link** — and a relative path is
  useless in a QR code anyway. Now resolved against the request origin.
- **The stub page promised reprints were on the timeline; nothing recorded
  them.** `stub_printed` was a declared event type nobody ever wrote. There is
  now a real **Print this slip** button (better than "use ⌘P" on a tablet) and
  the claim is true.

## Data correctness

- **A child with no age no longer gets a made-up one.** Pricing needs an age to
  pick the band, so a youth with none is priced as a nominal 10 — and that was
  being written onto the pass and printed as "age 10", directly above a
  follow-up saying the age was unknown. Pinned by TR-10.
- **A child can never be offered as another child's guardian.** Once ages are
  correctly blank, the old "no age means adult" test would have handed a
  9-year-old the job of chaperoning a 7-year-old. Adulthood now comes from the
  pass they hold. Pinned by TG-7 — the one rule this whole flow exists for.
- **Reconciliation "approve" on a walk-in booking crashed.** It called
  `markRegistrationPaid`, which refuses desk bookings. It now settles the single
  card payment the way the webhook does, and a refusal comes back as a sentence.
  Pinned by TX-8 and TX-9.

## Amendments — your original scenario
A family registers, forgets the kid, comes back. **+ Add more people** now
carries their name, phone and email through (no retyping, so no near-duplicate
names), folds that block away, and offers the adult already on the booking as a
one-tap guardian. Both bookings show the link to each other at the top.

## Still not done
- **No offline queue.** If the venue wifi drops, the desk stops.
- **No real volunteer has used this.** Twenty minutes with two of them before
  the day will find things I can't.
