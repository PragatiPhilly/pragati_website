# 14 — Projections (super-admin budget model)

> Status: spec, 2026-09-07. Supersedes nothing. Source material: `PnL_Model_2026 2.xlsx`
> (the 2024 workbook — five scenario sheets plus Food Cost / Steve / Hall tabs).

A super-admin-only section that turns the committee's yearly P&L spreadsheet into a
live model: drag the drivers, watch the year's finances move, save named scenarios,
and — once the event is over — freeze the real numbers as the year's **baseline** so
next year starts from fact instead of from a copied spreadsheet.

---

## 1. What the 2024 workbook actually is

Each `2024-Summary-ScenarioN` sheet is one sheet with four zones:

| Zone | Cells | What it holds |
|---|---|---|
| Expenses | `A9:G39` | line items; `B/C/D` per day, `E` all-days, `F` actual, `G` remarks |
| Revenue | `I9:Q53` | line items; `J/K/L` per day, `M` total, `N` actual, `O` still to get, `Q` tables |
| Drivers | `S8:X26` | footfall grid, food cost/person/day, registration prices |
| Tracking | `Z8:AD30` | footfall **snapshots** dated 5 Oct / 11 Oct / 19 Oct |

Plus a roll-up (`C42:D50`, `F42:G50`) that collapses ~50 line items into 7 cost heads
and 6 revenue heads, and a headline block (`I2:J6`) — expenses, revenue, P/L, cash
carried in, cash left over.

### 1.1 The calculation chain (verified against all five sheets)

Only **two** numbers in the whole workbook are computed from drivers. Everything else
is typed in by hand.

**Ticket revenue** — `M10`, `M11`:

```
revenueWithFood    = Σ_days  withFood[d]    × priceWithFood[d]
revenueWithoutFood = Σ_days  withoutFood[d] × priceWithoutFood[d]  × 1.1
```

**Food cost** — `B15:D15`:

```
foodCost[d] = ( withFood[d] × adultFoodCost[d] + kids[d] × kidFoodCost[d] ) × 1.3
adultFoodCost[d] = breakfast[d] + lunch[d] + dinner[d]
```

Reproducing Scenario 2 exactly: `(120×12 + 38×7)×1.3 = 2,217.80`,
`(270×30 + 70×15)×1.3 = 11,895`, `(200×36 + 53×15)×1.3 = 10,393.50` → `24,506.30`. ✅
`120×40 + 270×90 + 200×45 = 38,100` and `(30×30 + 125×60 + 100×20)×1.1 = 11,440`. ✅

**2024 driver values**

| Day | Price w/ food | Price w/o food | Food B+L+D | Kid food |
|---|---|---|---|---|
| Fri (Day 1) | $40 | $30 | 0+0+12 = **12** | 7 |
| Sat (Day 2) | $90 | $60 | 4+10+16 = **30** | 15 |
| Sun (Day 3) | $45 | $60→$20 | 4+16+16 = **36** | 15 |
| Kali puja | (flat $4,000 line) | — | 20 | 10 |

**Roll-up mapping** (kept verbatim so 2024 and 2026 stay comparable):

```
Hall rental        = hall + electrical + kalipuja hall     (E9 + E10 + E24)
Set up & décor     = stage/chairs/drape + decoration       (E11 + E17)
Artists            = artist fees                           (E12)
Sound & light      = sound & light                         (E14)
Food               = artist food + main food + tea/disposables + kalipuja food
                                                           (E13 + E15 + E16 + E23)
Pujo               = puja items + purohit                  (E18)
Others             = misc + magazine print + gifts + kalipuja others + PayPal fees
                                                           (E19 + E21 + E22 + E25 + E20)

Footfall           = ticket revenue + kalipuja             (M10 + M11 + M50)
Stalls             = Σ stall rows                          (M26:M49)
Corporate sponsors = Σ corporate rows                      (M20:M25, M16)
Individual sponsors= Σ named individuals                   (M12:M15, M18, M19)
Magazine           = magazine sponsorship                  (M17)
Carry forward      = last year's leftover                  (M9)
```

### 1.2 What the five scenarios actually vary

They are not five guesses at the same plan — they are **three levers** in combination.

| | S1 | S2 | S3 | S4 | S5 |
|---|---|---|---|---|---|
| Day 1 (Friday) | — | on | on | **off** | **off** |
| Hall | 13,420 | 12,000 | **19,000** | 12,000 | 12,000 |
| Own stage/electrical | — | 13,000 | 13,000 | **0** | **0** |
| Artists | 14,000 | 21,000 | 21,000 | 19,000 | 19,000 |
| Attendance | none | high | conservative | high | conservative |
| **Expenses** | 43,120 | 97,457 | 99,825 | 80,239 | 75,735 |
| **Revenue** | 0 | 105,730 | 81,440 | 84,940 | 75,650 |
| **P/L** | −43,120 | +8,273 | −18,385 | +4,701 | −85 |

- **S1** is not a plan — it is *"what are we already on the hook for"*: committed
  expenses only, revenue deliberately blank.
- **S2/S3** = full three days, optimistic vs conservative attendance and hall deal.
- **S4/S5** = drop Friday and the self-built stage; same two attendance cases.

### 1.3 Three things the workbook gets wrong — and the model must not

1. **The revenue roll-up does not equal the headline.** In S2, `M54` (headline) sums
   rows 9–53 and picks up `Extra individual $5,000 + Merck $5,000 + J&J $5,000`;
   the roll-up `G50` stops at row 50 and reports **90,730** against a headline of
   **105,730**. S2's cheerful +$8,273 is entirely those three *expected* sponsors —
   strip them and S2 is **−$6,727**. S3–S5 quietly dropped those rows.
   → *In the app there is exactly one total, computed once, and "expected vs
   confirmed" is a per-line flag, not a row someone forgets to include.*
2. **The food buffer label lies.** Row 15 reads "with 10% buffer"; the formula is
   `×1.3`. → *In the app the buffer is a named, visible driver.*
3. **A $45 Sunday plate loses money.** Sunday food costs `36 × 1.3 = $46.80` against a
   $45 ticket: **−$1.80 per person**. Kids are worse — they eat and pay nothing
   (−$19.50 on Sat/Sun). Nothing in the sheet shows this; the more Sunday tickets
   2024 sold, the more money it lost. → *This is the single most important thing the
   new UI must make impossible to miss.*

### 1.4 The numbers that matter, from S2

- Footfall drives **47%** of revenue and **25%** of cost. It is the engine.
- Sponsorship (corporate + individual + magazine = **$22,450**) is almost pure margin.
- Fixed cost ≈ **$73k**; variable (food) ≈ **$24.5k**. Break-even is therefore a real,
  computable number, and it is worth putting on the screen.

**Per-head contribution margin (2024 prices):**

| | Fri | Sat | Sun |
|---|---|---|---|
| With food | **+$24.40** | **+$51.00** | **−$1.80** |
| Without food (×1.1) | +$33.00 | +$66.00 | +$22.00 |
| Kid <12 | −$9.10 | −$19.50 | −$19.50 |

---

## 2. Scope

**In:** a super-admin section at `/admin/projections`; a driver-driven calc engine
that reproduces the workbook; unlimited named scenarios per year; side-by-side
comparison; live actuals from the ledger shown against every head; dated snapshots
that automate the sheet's manual footfall tracking; year baselines (2024 seeded from
the workbook, 2026 captured after the event); CSV/print export.

**Out:** writing anything to `payments`, `registrations` or `donations` — Projections
is **read-only** on real money, always. No approval workflow, no multi-user editing
locks (one committee, one editor at a time is fine), no currency other than USD.

---

## 3. Access

New section key `projections`, group `money`, and it goes in **`LOCKED_SECTIONS`** in
`lib/auth/access.ts` alongside roles/audit/settings — super admins only, and not
grantable through the Roles matrix even by mistake. Three edits in
`lib/auth/sections.ts` per `pragati-admin-nav` memory; the sidebar and the roles
matrix both pick it up automatically.

---

## 4. Data model

Self-applying schema (`lib/projections/ensure.ts`), same lazy `ensure` pattern as
`lib/desk/ensure.ts` — no manual deploy step, per `pragati-self-applying-migrations`.

```sql
projection_scenarios (
  id            text primary key,
  year          integer not null,
  name          text    not null,          -- "Best case", "No Friday", "2024 actuals"
  description   text,
  kind          text    not null default 'scenario',  -- scenario | baseline
  is_baseline   boolean not null default false,       -- ≤1 true per year (partial unique idx)
  seeded_from   text,                      -- scenario id this was duplicated/escalated from
  model         jsonb   not null,          -- the whole ProjectionModel (§5)
  locked_at     timestamptz,               -- baselines are read-only once captured
  archived_at   timestamptz,
  created_by, created_by_email, updated_by, created_at, updated_at
);
create unique index projection_baseline_year_idx
  on projection_scenarios (year) where is_baseline and archived_at is null;

projection_snapshots (
  id, scenario_id, taken_at, label,
  totals  jsonb,   -- computed P/L at that moment
  actuals jsonb,   -- ledger figures at that moment
  created_by
);
```

`model` is one JSONB blob rather than a normalised line table on purpose: a projection
is a *document*, it is always read and written whole, and the sheet's shape will change
year to year. Nothing else in the app joins against it.

Two rows ship seeded: **`2024 baseline`** (the workbook, locked) and — for
convenience — **`2024 · Scenario 2`** through **`Scenario 5`** as unlocked reference
scenarios, so a super admin can open the app and immediately see the five plans the
committee actually argued about in 2024.

---

## 5. The model shape

```ts
type Segment = "withFood" | "withoutFood" | "kids";

type ProjectionDay = {
  key: string;            // "fri" | "sat" | "sun" | "kalipuja"
  label: string;
  enabled: boolean;       // the "drop Friday" lever, straight from S4/S5
  driverMode: "computed" | "manual";   // kalipuja is manual: a flat line, as in 2024
  attendance: { withFood: number; withoutFood: number; kids: number };
  price:      { withFood: number; withoutFood: number; kids: number };
  foodCost:   { breakfast: number; lunch: number; dinner: number; kid: number };
};

type Line = {
  id: string;
  head: CostHead | RevenueHead;
  label: string;
  amountCents: number;
  perDay?: Record<string, number>;   // optional day split (artists were, in 2024)
  confidence: "confirmed" | "expected" | "stretch";   // fixes bug §1.3.1
  actualCents?: number;              // typed, or pulled (§6)
  actualSource?: "manual" | "ledger:registration" | "ledger:donation"
               | "ledger:membership" | "ledger:fees";
  tables?: number;                   // stalls only — the sheet's "No of tables"
  note?: string;
};

type ProjectionModel = {
  version: 1;
  year: number;
  days: ProjectionDay[];
  buffers: { foodPct: number; nonFoodUpliftPct: number };  // 30 and 10, named at last
  costLines: Line[];
  revenueLines: Line[];
  carryInCents: number;               // "left over from Pratima"
  notes?: string;
};

const COST_HEADS    = ["hall","setup","artists","sound","food","pujo","others"];
const REVENUE_HEADS = ["footfall","stalls","corporate","individual","magazine","carry_forward"];
```

Heads are **fixed** (year-over-year comparison depends on it); lines inside a head are
freely added, renamed and deleted. Two lines are *computed* and cannot be edited
directly — `footfall` revenue and the `food` head's main food line — because they are
the driver outputs. Everything else is typed, exactly as in 2024.

**Engine** — `lib/projections/engine.ts`, pure, no I/O, unit-tested against the
workbook's own totals:

```
ticketRevenue     per day and segment, ×(1 + nonFoodUpliftPct/100) on the no-food side
foodCost          per day, ×(1 + foodPct/100)
headTotals        cost and revenue, per head
totals            revenue, expenses, profit, cashAfterCarryIn
margins           per day × segment contribution margin  (§1.3.3)
breakEven         heads needed, by segment mix, to cover fixed cost after sponsorship
sensitivity       ±20% on each of 6 drivers → ΔP/L, for the tornado
```

The engine runs **client-side** on every slider move — it is arithmetic over ~60 rows,
so there is no round trip and no debounce lag. The server runs the same module for the
saved totals and the snapshots.

---

## 6. Live actuals

`lib/projections/actuals.ts`. **Reads `payments` only** — per
`pragati-in-checkout-donations`, the donations table is a view over money the
`payments` ledger already records, and summing both double-counts.

| Head | Actual source |
|---|---|
| `footfall` | `payments` where `kind='registration'`, `status='paid'` (includes desk tenders) |
| `individual` / `corporate` / `magazine` | `payments` where `kind='donation'`, `status='paid'` — total shown as **unallocated**; a super admin attaches it to lines |
| `others` → PayPal/card fees | `sum(fee_cents)` — the one cost line the ledger already knows |
| all others | typed by hand |

Also always available, and the reason this beats the spreadsheet: **live attendance**
by day and segment from paid `tickets` (`day_key`, `food_pref`, ticket type
`age_band`). That is the sheet's hand-typed "Foot fall as of 19 Oct" grid, filling
itself. Shown as a ghost overlay on the attendance sliders, so you can see the
projection and reality on one axis.

Outstanding (`pending`, `pending_verification`) is surfaced separately as
"still to come" — the sheet's column `O`.

Failure is never fatal: an actuals query that throws leaves the projection working with
actuals blank, the way `navBadges()` and `moneyTotals()` already behave.

---

## 7. Screen

One page, four bands, all on `/admin/projections`. Dense but calm; every number that
changes, animates (`framer-motion`, already a dependency — no chart library).

**Band 1 — Bottom line.** Year + scenario picker, and four large stat tiles: Revenue,
Expenses, Profit/Loss, Cash after carry-in. Digits roll on change (spring, not linear);
the P/L tile shifts hue through red → amber → green as it crosses zero.

**Band 2 — Drivers.** Per day: a card with enable toggle and three attendance sliders
(with-food / without-food / kids), prices, and food cost per head. Each card carries
its own **contribution-margin strip** — a bar per segment, green above the line, red
below, labelled with the dollars per head. A day that loses money on every plate says
so in words. The two buffers sit here as named sliders, not hidden multipliers.

**Band 3 — The picture.** Four charts, all hand-built SVG:

- **Waterfall** — carry-in → each revenue head → each expense head → profit. The one
  chart that explains the whole sheet. Bars grow from the running baseline with a
  staggered spring; hover shows the head's lines.
- **Break-even arc** — a gauge of projected attendance against the attendance needed to
  reach zero, with the needle animating between scenarios.
- **Tornado** — ±20% on footfall, hall, artists, food cost, sponsorship, ticket price,
  sorted by impact. Tells you which argument in the committee meeting is worth having.
- **Tracker** — cumulative actual revenue (from snapshots) against the projection's
  target line, as the event approaches. Empty and hidden until two snapshots exist.

**Band 4 — Lines.** Cost and revenue tables grouped by head, inline-editable, with
Projected · Confidence · Actual · Variance columns and a variance bar per row. A head
collapses to its total; the computed lines are visibly locked with a "driven by
attendance" tag.

**Compare mode.** Pick 2–4 scenarios: the stat tiles become grouped bars, the waterfall
becomes small multiples, and a diff table lists only the lines that actually differ —
which is how you discover that S2 and S3 differ by three sponsors and a hall quote.

Everything reads from the existing token set (`--marigold`, `--sindoor`, `--leaf-deep`,
`--card`, `--line`) so it works in all three site themes. `prefers-reduced-motion`
drops every animation to an instant state change.

---

## 8. Baselines — the point of the whole thing

- **Seeding a year.** "New scenario" offers: blank, duplicate an existing scenario, or
  **seed from a baseline** — pick 2024, apply an escalation % to every entered cost
  line (hall quotes and artist fees do not stay still), keep the drivers, start editing.
- **Capturing a baseline.** After the event, "Capture as 2026 baseline" opens a review:
  every line side by side, projected against actual, with the ledger's figures already
  filled in and the gaps highlighted. Confirm, and it writes a new `kind='baseline'`
  row with `is_baseline`, `locked_at` set, and actuals promoted into the amount fields.
  The partial unique index guarantees one baseline per year.
- A locked baseline cannot be edited — only duplicated. That is what makes next year's
  starting point trustworthy.

---

## 9. Testing

`tests/projections.test.ts`, run by the existing vitest suite:

1. The engine, fed the 2024 driver values, reproduces `24,506.30` food cost, `38,100`
   and `11,440` ticket revenue, and each scenario's expense total to the cent.
2. Head roll-ups equal the sum of their lines; revenue total equals the sum of the head
   totals (the bug in §1.3.1 cannot recur).
3. Contribution margin is negative for Sunday-with-food at 2024 prices, and for kids on
   every day.
4. Break-even attendance, fed back in as the driver, yields P/L of 0 ± $1.
5. `ensureProjectionsSchema()` is idempotent across repeated calls.
6. Actuals never write: the module exports no mutation.

---

## 10. Drivers — every head is a slider, and modifiers sit on top

**Addendum, 2026-09-07.** §7 described attendance sliders only. Every roll-up head in
§1.1 gets one, because that is what a committee actually argues about.

**Absolute sliders**, one per head, each with a numeric field beside it (a slider alone
cannot hit $19,000, and a field alone cannot be explored):

| Head | Slider drives | Range anchor |
|---|---|---|
| Hall | the hall line, electrical, kali puja hall | 2024 min/max ±50% → $6k–$29k |
| Set up & décor | stage/chairs/drape, decoration | $0–$20k (0 = "venue provides it", the S4/S5 lever) |
| Artists | per-day artist fees | $0–$32k |
| Sound & light | one line | $0–$12k |
| Food | via *cost per head per day* + the buffer | see below |
| Pujo | puja items + purohit | $0–$6k |
| Others | misc, magazine print, gifts, card fees | $0–$12k |
| Stalls | **table count × average rate** — two sliders, not one | 0–40 tables, $75–$500 |
| Corporate | total, with the line list underneath | $0–$25k |
| Individual | total | $0–$25k |
| Magazine | total | $0–$10k |
| Carry forward | last year's leftover | $0–$25k |

Moving a head slider **distributes proportionally** across that head's existing lines
and pins the head total; expanding the head shows the lines and lets you set them one
by one, which un-pins the slider. Nothing is lost either way — the lines remain the
record, the slider is a grip on their sum.

**Modifiers** — the second, faster way to move the model, exactly as asked. A rail of
four global multipliers applied on top of the entered values:

```
modifiers = {
  attendancePct: 100,   // 60–160  — "what if 15% more people come"
  pricePct:      100,   // 60–160  — "what if every ticket is 10% dearer"
  costPct:       100,   // 60–160  — "what if everything inflates 8%"
  sponsorshipPct:100,   // 0–200   — "what if sponsorship halves"
}
```

They are **non-destructive**: stored in the model, shown as a visible "modified" chip,
and reversible in one click. A "Bake in" button folds them into the underlying lines
and resets them to 100, for when an exploration becomes the plan. Every chart, the
forecast and the gap closer all read post-modifier values, so what you see is what you
would sign.

**Locks.** Any driver can be pinned (🔒). A locked driver is excluded from the gap
closer's suggestions and held at its value in the Monte Carlo — that is how you say
"the hall contract is signed, stop offering to change it."

---

## 11. Prediction — the model earns its name

Deterministic what-if is table stakes. Four predictive layers sit on top, **all pure
TypeScript, no new runtime dependency**. Every one of these runs client-side on each
slider drag, so a package that only works in Node is useless here; and the methods
below are ~350 lines total, which is not worth a supply-chain risk on a production
Vercel app. The *methods* are current practice; the code is ours.

### 11.1 Uncertainty: Beta-PERT + Latin Hypercube Monte Carlo

Each driver carries an optional `{min, likely, max}` band — the way a committee already
talks ("the hall is twelve, could be ten, could be nineteen"). Sampled as **Beta-PERT**
(λ=4, the standard cost-risk distribution: `α = 1 + 4(m−a)/(b−a)`, `β = 1 + 4(b−m)/(b−a)`,
Beta drawn as `G₁/(G₁+G₂)` with Marsaglia–Tsang gamma variates), stratified by **Latin
Hypercube** so 2,000 samples cover the space as well as ~20,000 naive draws.

The RNG is a seeded `mulberry32`, so the same scenario always produces the same fan —
charts that reshuffle on every render destroy trust in the number.

**Output:** the profit distribution. P10 / P50 / P90, **probability of finishing in the
black**, and the value at risk at the 10th percentile. Shown as a fan chart with the
deterministic plan marked on it, so you can see whether your plan sits at the middle of
the distribution or out on its optimistic tail — which is exactly what Scenario 2 was
doing in 2024.

### 11.2 Which uncertainty actually matters: Sobol indices

The tornado in §7 moves each driver ±20% — useful, but it says more about the ±20% than
about the world. **Sobol variance decomposition** (Saltelli/Jansen pick-and-freeze,
`(D+2)×N` evaluations, D≈10 drivers at N=512 ≈ 6k evaluations of a 60-row model — single-digit
milliseconds) answers the better question: *of the variance in our outcome, what fraction
is caused by each driver's own uncertainty?*

First-order `Sᵢ` and total-order `S_Tᵢ` are both reported. A driver with a large `S_Tᵢ`
and a small `Sᵢ` is one that only matters in combination with something else — worth
knowing before a committee spends an hour on it. Both are shown next to the tornado, so
"biggest lever" and "biggest risk" are visibly different questions.

### 11.3 Attendance forecast: pace curve + Bayesian update

The 2024 sheet tracked footfall by hand on 5 Oct (771), 11 Oct (921) and 19 Oct
(1,137) against a plan of 1,096 — i.e. **2024 passed its own projection eight days
before the doors opened, and nobody's spreadsheet said so.**

Those snapshots are a **booking curve**. `projection_snapshots` (§4) records the same
thing automatically from paid tickets, and the forecast is the standard pacing method:

```
paceFraction(d)   = baseline-year cumulative share at d days out   (Gompertz fit,
                     F(t) = exp(−b·exp(−c·t)), b,c by Nelder–Mead on the baseline points)
naiveFinal        = currentCount / paceFraction(daysOut)
```

Then, because "this year is exactly like last year" is a prior and not a fact, each new
snapshot updates it. With `rᵢ = log(actualᵢ / paceExpectedᵢ)` and a conjugate normal
posterior on the log-ratio, the forecast shrinks from "same shape as last year" toward
"this year's own trend" as evidence accumulates:

```
posteriorMean = (τ⁻²·0 + σ⁻²·Σrᵢ) / (τ⁻² + n·σ⁻²)
forecastFinal = naiveFinal × exp(posteriorMean)
```

With one snapshot it barely moves; by the fifth it dominates. The credible interval
comes from the posterior variance, and it narrows visibly as the event approaches — the
chart *shows you it is learning*, which is the point.

Forecast attendance feeds straight back into the engine as a **shadow scenario**
("at current pace") drawn as a ghost line on every chart beside the plan.

### 11.4 The gap closer — "what's the lack, and what fixes it"

The number the committee wants is not the P/L. It is: **how far behind are we, and
what single thing closes it.** Given the gap `G` (to break-even, or to a target the
super admin types), each unlocked lever is solved individually:

| Lever | Solve |
|---|---|
| More Saturday guests | `G / margin(sat, withFood)` — only offered where margin > 0 |
| Ticket prices up | `G / Σ(attendance × price)` as a % |
| More sponsorship | `G` (1:1 — it is nearly pure margin) |
| More stall tables | `G / averageStallRate` |
| Trim controllable cost | `G / Σ(unlocked cost heads)` as a % |
| Drop a day | re-run with `enabled: false` → actual ΔP/L, not an estimate |

Presented as cards reading *"Any **one** of these closes a $12,400 gap"*, with the
infeasible ones greyed and reasoned ("Sunday loses $1.80 a head — selling more makes
this worse"). In surplus, it inverts: what the headroom buys — a bigger artist budget, a
lower Sunday price, a larger reserve for next year.

### 11.5 Risk flags — the things that quietly went wrong in 2024

A standing panel, each flag computed, each linking to the driver that causes it:

1. **Negative-margin segment** — any day × segment where a sale loses money. (2024: Sunday with-food, and kids every day.)
2. **Unconfirmed revenue share** — % of projected revenue marked `expected`/`stretch`. Scenario 2's profit was 100% unconfirmed sponsorship; this gauge would have shown it in red.
3. **Concentration** — any single line above 15% of revenue: one sponsor withdrawing takes the year with it.
4. **Attendance stress** — P/L if attendance lands 20% below plan.
5. **Cash floor** — `cashAfterCarryIn < 0`: the year ends unable to seed the next one, which is the failure mode that actually matters for a volunteer committee.

---

## 12. Safety — this must not touch anything that works

The section is strictly additive; the checklist below is the acceptance bar.

- **Three existing files touched, every change additive:** a `SectionKey` +
  `SECTIONS` entry in `lib/auth/sections.ts`; `"projections"` appended to
  `LOCKED_SECTIONS` in `lib/auth/access.ts`; and two new `pgTable` definitions
  appended to `db/schema.ts` — the latter only so `drizzle-kit push` knows the
  tables exist and never offers to drop them (the same reason the desk tables are
  declared there as well as in their `ensure`). Nothing else in the app imports
  the new module.
- **No writes to money.** `lib/projections/*` exports no mutation against `payments`,
  `registrations`, `donations` or `members`. Asserted by a test that greps the module's
  exports and by review.
- **New tables only**, created by the lazy `ensure` pattern (`CREATE TABLE IF NOT
  EXISTS`). No `ALTER` against an existing table. A database that never opens
  Projections is byte-identical in behaviour.
- **Failure is local.** Every read is wrapped; a projections query that throws renders an
  empty state, never a 500, and cannot affect the admin layout (which is why the section
  contributes no nav badge).
- **No new runtime dependency**, so `npm audit`, the bundle size and the Vercel build are
  unchanged.
- **Regression gate:** the full existing `vitest` suite must pass unchanged, and
  `next build` must succeed, before this is called done.


---

## 13. Chart colour — computed, not chosen

The palette was produced by running the `dataviz` validator against this app's own
card surfaces (`#fffdf6` light, `#141c40` dark) and fixing what it failed, rather
than by eye. The festival tokens are warm end to end — marigold, terracotta and
sindoor all sit within a few degrees of hue — so a naive "one colour per head"
scheme collapses under deuteranopia. Three findings shaped the result:

1. **Leaf green against sindoor red fails** — ΔE 4.0 under deuteranopia, well below
   the floor of 6. The gain colour is therefore a *teal*-leaning green
   (`#1a7f5a` light, `#1f9d8c` dark), which clears the floor at 7.3 / 7.9.
2. **A 6–8 ΔE pair is legal only with secondary encoding**, so every polarity mark
   in this section also carries a sign, a position relative to a drawn baseline,
   and a direct label. Those are load-bearing, not decoration.
3. **The waterfall needs no categorical palette at all.** Colour there does one
   job — polarity — and which head a bar belongs to comes from its axis label. That
   removed the requirement for seven mutually distinguishable hues, which the
   festival tokens cannot supply and which no re-ordering would have fixed.

Only pairs that actually appear in the same chart were validated together: gain ×
loss (waterfall, margins, tiles) and loss × forecast (the pace chart's two lines).
The pace chart goes further and uses **one** hue with a dash pattern separating
booked-so-far from forecast, so it is safe under any colour vision.

Dark-mode steps are selected and re-validated against the dark surface, never an
automatic flip of the light values. Status colours (`--c-ok`, `--c-warn`,
`--c-crit`) clear WCAG text contrast at 4.88 / 4.36 / 5.78:1 on the light surface
and always ship with an icon and a sentence.

Re-run before changing any of these:

```
node scripts/validate_palette.js "#1a7f5a,#c8102e" --mode light  --surface "#fffdf6" --pairs all
node scripts/validate_palette.js "#1f9d8c,#e0435c" --mode dark   --surface "#141c40" --pairs all
```

---

## 14. Verified — 2026-09-07

Built and checked end to end. What was actually run, and what it said:

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `vitest run tests/projections.test.ts` | **33/33 pass** |
| `vitest run` (whole suite) | **172/172 pass**, 12 files — no pre-existing test moved |
| `next build` | compiled, `/admin/projections` in the route table, no lint or type errors |
| Rendered in a real browser, signed in as a super admin | **zero console errors** |

The engine reproduces the workbook to the cent, on screen and in the tests:

| | Revenue | Expenses | P/L | Sheet's P/L |
|---|---|---|---|---|
| Baseline (S2) | 105,730 | 97,456.90 | **+8,273.10** | +8,273.10 |
| S3 | 81,440 | 99,825.00 | **−18,385.00** | −18,385.00 |
| S4 | 84,940 | 80,239.10 | **+4,700.90** | +4,700.90 |
| S5 | 75,650 | 75,734.60 | **−84.60** | −84.60 |

And the findings from §1.3 come out of the running app on their own, without anyone
being told to look for them:

- *"4 segments lose money on every sale — Friday kids ($9/head), Saturday kids
  ($19/head), Sunday with food ($2/head), Sunday kids ($19/head). Together they cost
  $3,104 at planned attendance."*
- *"14% of revenue is not confirmed. $15,000 is expected or stretch. Without it this
  plan loses $6,727 — the surplus is entirely money nobody has promised."*
- *"Your plan sits at the 77% percentile of its own distribution — that is an
  optimistic case, not an expectation."* (80% chance of surplus; P10 −$2,343, P90 $10,763.)
- The booking curve forecasts **1,285 against a plan of 1,096** from 2024's own three
  hand-typed footfall counts — the overshoot no spreadsheet reported at the time.

**Layout defects found by rendering it and fixed** — none were visible in the code:

1. The page scrolled horizontally to 1650px inside a 1440px viewport. Cause: `.proj-main`
   is `display:grid` with no template, so its *implicit* column sized to max-content and
   one wide chart pushed the page out. Every track is now `minmax(0, …)`.
2. The same class of bug at 390px: the number field beside each slider carries an
   intrinsic ~180px width that flexbox will not shrink. It now has an explicit width and
   the row wraps.
3. SVG rejected `height="-0.0004"` — an underdamped spring undershoots below zero at the
   tail. Bar animations are `bounce: 0` springs now, which are monotonic.
4. The dark palette was keyed to `[data-theme="night"]`; this app's dark theme is `kali`,
   so **none of it had ever applied**.
5. Two rendered strings lost the space after an inline `<b>`/expression through this
   toolchain ("734guests"). Fixed with explicit `{" "}`.
6. Comparison was a double-click, which also fires a click — so it selected the scenario
   *and* added it, and you compared a scenario with itself. It is an explicit mode now.

**Repo footprint:** 20 new files, plus this spec. Three existing files touched, all
additively — `lib/auth/sections.ts`, `lib/auth/access.ts`, `db/schema.ts`. Nothing else
in the repository was modified.

**Note for whoever verifies this next:** `tsc`, `vitest` and `next build` cannot run
against the desktop-bridge folder mount — it fails on files over ~1 MB with `EDEADLK`,
so `npx tsc` dies reading its own compiler. Tar the source, run it in the cloud
container, and copy fixes back.

---

## 15. Second pass — write paths, export, accessibility

The first pass verified that the page *renders*. This one verified that it *works*,
and closed what that turned up.

**Every write path exercised in a browser, end to end** (they had only been reasoned
about before): edit a driver → Save → reload → the change is still there; create a
scenario seeded from another with an escalation; take a snapshot; capture a baseline
(which appeared, locked, as its year's baseline); delete a scenario. Zero console errors
throughout.

**Fixed, all found by testing rather than by reading:**

1. **Cost escalation did not reach food.** Seeding 2026 from 2024 at +8% scaled the
   entered cost lines but not the per-head food cost — and food is the single largest
   cost in the model (~$24.5k of $97k), so every escalated year was understated by
   roughly $2k. Escalation now scales `day.foodCost` too.
2. **CSV export** — promised in §2 and not built. Now `lib/projections/export.ts`:
   summary, head totals, drivers, per-guest contribution margin, and every line with its
   actual and variance. Dollars, not cents, because it opens in Excel. It records when
   what-if modifiers were applied, so a printed sheet cannot be misread as the plan.
3. **Print stylesheet** — a committee meeting still runs on paper. Nav and controls drop
   out, the two-column bands go to one, the rail unsticks, cards avoid page breaks, and
   the charts print sharp because they are inline SVG.
4. **Dead surface removed** — `Line.band`, `HEAD_META`, `countScenarios` and
   `refreshActualsAction` were exported and never used. A type field nobody can set is a
   lie about what the module supports. Uncertainty is set per *head* in
   `defaultDrivers()`, and that is now the only place it lives.
5. **Stall table count surfaced** — the sheet tracked "No of tables" and the floor plan
   depends on it; the Stalls slider now reads "12 tables booked".
6. **Accessibility, audited and fixed.** Every control has an accessible name and all
   five charts carry `role="img"` with a label — those already passed. Two did not:
   - The page had **one heading** (`h1`), so a screen-reader user could not navigate it
     by section. Card titles are `h2` and day names `h3` now; the visual weight is
     unchanged because the styling was already class-based.
   - Day switches (34×19), pin buttons (20×17) and head expanders (×17) were **below the
     24×24 minimum target size** (WCAG 2.2 AA, 2.5.8). The switch is now 34×24 with the
     track drawn at 19px inside it via `::before`, so it looks identical and is legal to
     tap. Re-audit reports `smallTargets: []`.

**Final gate:** `tsc` clean · **175/175** tests (36 in this module) · `next build` exit 0
· zero console errors · no horizontal overflow at 1440, 820 or 390px.

### Known limits — read before trusting this in anger

- **Tested on PGlite, not on Neon.** The `ensure` SQL is the same shape as the desk's and
  the scans', which are proven in production, but this specific DDL has not run against
  the real database yet. The first super admin to open the page is what applies it.
- **`getActuals()` attendance mapping is untested against real ticket rows** — the dev
  database has an event but no paid registrations. The money half (the `payments`
  aggregate) is exercised; the per-day / per-segment head counts are not. Watch the first
  snapshot after real registrations exist.
- **The pace forecast has one baseline year to learn from.** With 2026's own snapshots it
  gets sharply better; until then it is 2024's shape with a wide interval, and it says so.
- **`listAllSnapshots()` loads every snapshot on every page load.** Fine at tens of rows;
  revisit if a decade of weekly snapshots accumulates.

---

## 16. Third pass — the site feeds the model

**The gap this closes.** Everything above still assumed a human typed the year's
numbers. But this website already knows what it sold, and "capture as the baseline"
was only promoting figures somebody had keyed in by hand. A planning tool sitting on
top of a live ticketing system should never ask for a number that system holds.

### 16.1 Two routes into a year

`New scenario` now offers:

- **Copy a previous year** — what you do in January, before a ticket has sold.
- **Build from live site data** — reads the ledger and the ticket rows, and shows
  you exactly what it found *before* creating anything.

### 16.2 The three tiers, kept visibly apart

| | What |
|---|---|
| **Pulled** | Ticket revenue settled and outstanding · guests booked · attendance per day split with-food / without-food / kids · **the price people actually paid** per day (the realised average after member pricing, promo codes and desk discounts) · card processing fees, exact · website donations, each gift listed · membership dues |
| **Carried** | Every cost head — hall, set-up, artists, sound, pujo, food cost per head, stalls — because none of it was ever transacted here. Escalated if you asked, flagged, editable. Plus cash carried in, derived from the previous year's closing position. |
| **Needs you** | Named sponsors. |

A head where only *some* lines came from the ledger reads **"part pulled"**, not
"pulled" — Others contains the card fees the ledger knows and four lines it does not,
and calling the whole head pulled would overstate what the site actually knows.

**Last year's sponsor names carry over with their amounts zeroed** and marked
`expected`. The names are a checklist worth having; the money is not. Carrying a
sponsor's figure forward as though it were promised is precisely what made the 2024
sheet report a profit it did not have (§1.3.1).

`⟳ Pull actuals` does the other half: it fills the Actual column on an existing
scenario from the ledger and touches nothing a human typed — only lines that declare
a ledger source. That is what turns baseline capture into a click.

### 16.3 The bug this found

`getActuals()` classified attendance with an age-band list that was **wrong**. It
named `child_5_12` and `youth_5_18`, which this app does not have, and missed
`child_5_18`, which it does — so **every youth was counted as an adult**. That
inflated the with-food segment and hid the single thing this whole model exists to
surface: that children are the segment losing money. Classification now lives in one
place (`from-live.ts`), is used by both readers, and has a test that names the bug.

### 16.4 The forecast now learns by itself

The booking-curve forecast is the most useful thing on the screen and it only learns
from dated snapshots. Asking a volunteer committee to press a button every Sunday for
eight weeks reproduces exactly the gap the 2024 spreadsheet had.

`lib/projections/snapshot-job.ts` runs from the **existing** `/api/cron/sweep` route
(already every 15 minutes). It is its own rate limiter: at most one run per UTC day,
and its first act is the cheap "already done today" check, so 95 of 96 ticks cost a
single SELECT. That check counts a MANUAL snapshot too, so pressing "Snapshot now" in
the morning keeps the cron quiet rather than putting two points on one day. It stops
a fortnight after the event ends. It can only INSERT into `projection_snapshots`.

No change to `vercel.json` — no new cron, no new schedule, no new secret.

### 16.5 Verified

Seeded 13 realistic purchases (bundles, single days, youths, under-5s, no-food
tickets) and hand-computed the expected result. The pull returned it **exactly**:

| | With food | No food | Kids | Avg paid |
|---|---|---|---|---|
| Friday | 8 | 3 | 7 | $35 |
| Saturday | 13 | 5 | 10 | $39 |
| Sunday | 9 | 3 | 9 | $37 |

$1,610 ticket revenue · 67 guests · $48 fees · $750 in two gifts — every figure
matching the seed script's own arithmetic, with youths correctly in `kids`.

Then created a scenario from it, pulled actuals into it ("Filled 3 lines from the
ledger"), and called the cron twice: the first took a snapshot (67 heads), the second
returned `skipped: "already-today"`. The snapshot appeared in the pace chart on the
next page load.

**Gate:** `tsc` clean · **185/185** tests (45 in this module) · `next build` exit 0 ·
zero console errors.

**Repo footprint after this pass:** 23 new files plus this spec. **Four** existing
files touched, all additively — `lib/auth/sections.ts`, `lib/auth/access.ts`,
`db/schema.ts`, and now `api/cron/sweep/route.ts`, where the addition is one guarded
`try`/`catch` block that cannot fail the sweep.
