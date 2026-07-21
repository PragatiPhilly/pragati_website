# Pragati Website Update — Implementation Plan

_Drafted July 21, 2026 · based on the president's assets in `app/images/` and your four decisions._

## Decisions locked

| Area | Choice | Notes |
|---|---|---|
| Hero | **Layered parallax** | Real pandal photo, split into background / idols / foreground; subtle depth on scroll + mouse. Using the frontal gold-backdrop photo. |
| Posters | **One pool, auto-split** | Admin adds posters to a single list; site splits them across two portrait slideshow panels. |
| Payments | **Card always, Zelle optional** | Card (Square) everywhere. Zelle only when a super-admin enables it. **Zelle defaults OFF.** |
| EC committee | **Combined image as-is** | The 2026–2027 committee graphic dropped into the About page as one image. |

---

## Workstream 1 — Branding: logo & favicon

**Goal:** Replace the placeholder sun favicon and wire the real Pragati marks into the site.

**Approach:**
- Favicon → the গ২ monogram (`WhatsApp…21.28.17.jpeg`). Replace `src/app/icon.svg` with a clean version (I'll trace/export it to SVG so it stays crisp at 16px) and add an `apple-icon`.
- Header + footer → the full horizontal lockup (`…21.31.28.jpeg`) with the "since 1972" tagline.
- Save all three logos into `public/brand/` so they're reusable.

**Files:** `src/app/icon.svg`, `src/app/apple-icon.png` (new), `src/components/site/Header.tsx`, `src/components/site/MobileNav.tsx`, footer in `src/app/(public)/layout.tsx`, new `public/brand/*`.

**Effort:** S · **Risk:** low.

---

## Workstream 2 — Hero: layered-parallax pandal photo

**Goal:** Remove the illustrated `DurgaSceneJamini` hero scene; put a real club photo in its place with the depth animation you described.

**Approach:**
1. Segment the gold-backdrop pandal photo into 2–3 transparent PNG layers in the sandbox (background structure / idols / foreground marigolds) using background-removal tooling.
2. Stack them in a new `HeroParallax` component; each layer shifts a different amount on scroll and on mouse-move for parallax depth. Add a slow Ken Burns drift as a base so it feels alive even when still.
3. Keep the existing ambient touches (diya dots, drifting petals) layered on top.
4. **I'll send you a preview of the cut layers before wiring** — segmenting idols/flowers out of a busy photo is the one quality risk here. Fallback if a layer looks rough: a 2-layer version (background + foreground vignette) plus Ken Burns, which still reads as depth.

**Files:** new `src/components/site/HeroParallax.tsx`, edits to the hero block in `src/app/(public)/page.tsx`, layer PNGs in `public/hero/`.

**Effort:** L · **Risk:** medium (segmentation quality).

---

## Workstream 3 — Posters: admin-managed, two-panel auto-split slideshow

**Goal:** Turn the hardcoded "This year's lineup" section into an admin-managed poster area — one pool, auto-split across two portrait slideshows.

**Approach:**
- Add a **"poster" category** to the existing Media Library (`src/app/admin/media/`) — you already have DB-backed media with upload/reorder/enable, so posters reuse that plumbing rather than a new system.
- New homepage component pulls all enabled posters, splits them across left/right panels, each panel cross-fading through its share. Enforces the shared portrait aspect ratio.
- Seed with the two current posters (Anjan Dutt, Bhoomi) so nothing looks empty on day one.

**Files:** `src/db/schema.ts` (media category), `src/lib/media/queries.ts`, `src/app/admin/media/*`, new `src/components/site/PosterPanels.tsx`, edits to the lineup section in `src/app/(public)/page.tsx`.

**Effort:** M · **Risk:** low (builds on existing media system).

---

## Workstream 4 — About Us rewrite + EC committee

**Goal:** Replace the About page with the president's copy and add the committee.

**Approach:**
- Drop in the supplied About / Vision / Mission / Join Us text, styled to match the site (Bengali accents, alpona dividers).
- Add an "Executive Committee 2026–2027" block using the combined committee graphic as-is.
- Cross-link from the homepage mission section.

**Files:** `src/app/(public)/about/page.tsx`, committee image → `public/about/`.

**Effort:** S · **Risk:** low.

---

## Workstream 5 — Payments: card-always, Zelle-optional

**Goal:** Card (Square) available on every paid surface; Zelle only when a super-admin turns it on. Fix the membership signup, which is currently Zelle-only.

**Approach:**
- **Settings:** add two super-admin toggles in Admin → Settings — "Accept card payments (Square)" (default ON) and "Accept Zelle payments" (default **OFF**). These write the `payments_square_enabled` / `payments_zelle_enabled` keys the dashboard already reads.
- **Wire the flags** from config into every surface. Registration/tickets (`RegisterFlow`) and donations (`DonateForm`) already accept `squareEnabled`/`zelleEnabled` props — I'll confirm their pages pass the live config and default Zelle off.
- **Membership (the real gap):** the signup is Zelle-only today. Add the Square card flow (mirroring the donation/registration card path) so card is the default, with Zelle shown only when enabled.
- **Guardrail:** when Zelle is off, its chips and the `/checkout/zelle` route are hidden/blocked so nobody lands on a disabled method.

**Files:** `src/app/admin/settings/page.tsx`, `src/config/defaults.ts`, `src/app/(public)/signup/membership/*` (biggest change), `src/app/(public)/donate/page.tsx`, `src/app/register/page.tsx`, membership checkout lib.

**Effort:** M–L · **Risk:** medium (membership card flow is new code; Square is currently in TEST mode — card will work in test, but real charges need Square production keys).

---

## Workstream 6 — Additional images (pending your screenshots)

You mentioned more images to place around the site from the president discussion. **Awaiting those screenshots** — once they're in `app/images/`, I'll map each to a section (gallery/carousel, event pages, etc.) and fold them into the relevant workstream above.

---

## Suggested build order

1. **Branding** (S) — quick win, sets the visual tone.
2. **About + EC committee** (S) — self-contained, no dependencies.
3. **Payments** (M–L) — highest functional importance; closes the membership gap.
4. **Posters** (M) — reuses media system.
5. **Hero parallax** (L) — most effort; I'll preview the cut layers with you first.

Each ships as its own commit so you can review and deploy incrementally.

## What I still need from you

- The **additional president screenshots/images** for Workstream 6.
- Confirm the **gold-backdrop pandal photo** for the hero (vs. the Patachitra one) — or say "you pick."
- A yes on the **build order** above, or tell me what to do first.
