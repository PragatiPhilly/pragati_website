# 17 — Kali Pujo theme (the Amavasya night)

Built 2026-10-19 from the v4 prototype (`archive/prototypes/pragati-redesign-prototype-v4.html`):
dark indigo sky, lamp-gold accents, crimson, a sky that changes colour as you scroll.
Durga stays exactly as it is for next year (verified pixel-for-pixel against the
previous build; the only Durga change is the compact past-lineup below).

## Switching
Admin → Settings → **Website theme** (`site_theme`):
- `auto` (default) — the active event's theme (Admin → Events → Theme).
- `durga | kali | saraswati` — force the public site into that look now.
Admin, the gate page (`/t/…`), ticket printouts and the door list always stay light
(`data-force-light` on their wrapper; CSS in `globals.css`).

## What Kali changes
| Area | Kali |
|---|---|
| Colours | `[data-theme="kali"]` tokens re-picked for contrast on dark (crimson `#e0284a`, ember `#f0955a` for text, `--terracotta-fill` for fills under cream text, light green for member prices) |
| Background | `KaliSky`: 5 dark sky stops (dusk → night → diya glow → midnight → Amavasya) cross-faded by eased scroll — exact blends, opacity-only, loop sleeps when idle |
| Ambient | 3 twinkling star fields, occasional shooting stars, rising sky lanterns (ফানুস), phuljhuri sparkles round the hero, hibiscus (জবা) petals instead of marigold |
| Surfaces | Cards, header, inputs become dark glass so the sky's colour shows through; silkier easing on hovers and page-in |
| Hero | No sun/clouds/time-of-day tint (it is always night); Kali scene with a breathing glow; Kali headline + Bengali line |
| Copy | Mission quote (Maa Shyama), countdown ("till the first lamp is lit"), lineup eyebrow ("Pujo night") |
| Motifs | Parallax motifs become hibiscus, yantra, diya, trishul |
| Logo | `header-logo-night.png` — same logo, tagline lit cream |
| Membership vignette | Kalash instead of Sindoor Khela |

Everything decorative lives in `styles/kali.css`, scoped to `.kali-world` (the wrapper
`ThemeWorld` puts round public pages only when the theme is kali). Reduced-motion
users get the colours without the moving parts.

## Lineup
- Thank-you mode: the two full-height concert posters become a compact "Performed live" strip.
- The bundled posters in `/public/lineup` are Durga Pujo 2026's; any other event shows a
  lineup only once its own posters are ticked as "Event posters" in Admin → Photos.

## To launch Kali
1. Admin → Events → new event, Theme = **kali**, publish, then make it active.
2. Settings → Website theme stays `auto` (or set `kali` early to preview the look live).
3. Upload Kali posters in Admin → Photos if there is a performance.
