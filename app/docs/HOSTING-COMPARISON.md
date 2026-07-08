# Hosting Pragati: Cost Comparison & Recommendation

*Prices checked July 2026. Assumes Pragati's scale: ~200 member families,
a few thousand page views normally, spiking during Pujo registration weeks,
database well under 1 GB.*

## The one non-negotiable

**Vercel's free Hobby plan can't be used** — it's restricted to personal,
non-commercial use, and selling event tickets / collecting membership dues is
commercial activity. Going live on Vercel means the **Pro plan**. (Your instinct
about needing the "business one" was right.)

---

## Option A — Vercel Pro + Neon Postgres (recommended)

| Item | Plan | Monthly cost |
|---|---|---|
| Vercel Pro (1 seat) | $20/user/mo, includes $20 usage credit, 1 TB bandwidth, crons, Blob access | **$20** |
| Neon Postgres | Free tier: 0.5 GB storage, 100 compute-hrs/mo, scales to zero when idle | **$0** |
| Neon (if you outgrow free) | Launch: pure usage, no base fee (~$0.106/CU-hr + $0.35/GB-mo) | ~$1–5 |
| Vercel Blob (photos + magazine PDFs) | $0.023/GB-mo storage + $0.05/GB transfer, inside the $20 Pro credit at your scale | ~$0 |
| Resend email | Free: 3,000 emails/mo, 100/day | **$0** |
| **Total** | | **≈ $20–25/mo** |

Why it fits: zero server maintenance, deploys on git push, both cron jobs
(reservation sweep + the 11 PM registration backup email) run natively, HTTPS
and scaling automatic. Neon's scale-to-zero suits a seasonal org — you pay
compute only when people are actually registering. At Pragati's data size the
free DB tier may last years.

Watch-outs: Resend free tier caps at 100 emails/day — a big registration-open
day could hit it (Resend Pro is $20/mo if that ever happens, or stagger the
announcement). Neon free keeps ~6h point-in-time restore; your nightly CSV
backup email covers the disaster case beyond that.

## Option B — Vercel Pro + Supabase

| Item | Monthly cost |
|---|---|
| Vercel Pro | $20 |
| Supabase Pro | $25 (8 GB DB, daily backups, no pausing) |
| **Total** | **≈ $45/mo** |

Supabase's **free tier is a trap for this use case**: projects pause after 7
days of inactivity — an off-season lull could take the site down. Pro is solid
(daily managed backups included) but you'd pay $25 for auth/storage/realtime
features Pragati doesn't use. Choose this only if you want managed daily DB
backups baked in and don't mind the price.

## Option C — Hostinger (what you asked about)

Hostinger *can* work, with caveats:

| Hostinger option | Monthly cost | Fits Pragati? |
|---|---|---|
| Managed web-app / Node.js hosting | from ~$4 (promo, 24–48 mo term) | ⚠ Partly — runs Next.js, but bundled DBs are **MySQL/MariaDB**, and the app is built on **Postgres**. No native cron for the backup job (external cron pinger needed). Renewal prices roughly double. |
| VPS (KVM 2: 2 vCPU / 8 GB) | ~$7–13 (term pricing) | ✔ Yes — full control: run Node + Postgres + nginx yourself. |

A Hostinger **VPS is the genuinely cheap path (~$7–13/mo all-in)**: Postgres
runs on the same box (no DB bill), the filesystem is persistent (no Blob
needed — photo/PDF uploads just work on disk), and the backup cron is a plain
crontab line. The trade: **you are the sysadmin** — Ubuntu updates, PM2,
nginx, SSL certs, security hardening, uptime monitoring, and DB backups are
all on you. If the box dies at 7 PM on Shashthi, someone has to SSH in and
fix it. The managed (non-VPS) Hostinger plans are a poor fit because of the
MySQL-only database.

## Side by side

| | A: Vercel Pro + Neon | B: Vercel Pro + Supabase | C: Hostinger VPS |
|---|---|---|---|
| Monthly cost | ~$20–25 | ~$45 | ~$7–13 (term), ~2× on renewal |
| Ops burden | None | None | High (you run everything) |
| DB backups | Neon PITR + nightly CSV email | Managed daily + CSV email | DIY + nightly CSV email |
| Cron jobs | Built in | Built in | crontab (easy on VPS) |
| Handles Pujo-day spikes | Auto | Auto | Fixed VPS capacity |
| Code changes needed | None (built for this) | None | None for VPS; managed plans would force a Postgres→MySQL rewrite (don't) |

## Recommendation

**Option A: Vercel Pro ($20/mo) + Neon free tier + Resend free ≈ $20–25/mo.**
For a volunteer-run org, paying ~$240/year to never think about servers,
SSL, scaling, or 2 AM outages is the right trade. The nightly CSV backup
email you now have makes the free-tier database genuinely safe — your
disaster-recovery plan costs $0. Revisit Hostinger VPS only if the budget
truly can't fit $20/mo *and* someone on the team enjoys server admin.

Also needed regardless of host: a domain (~$10–15/yr) and verifying it in
Resend so emails come from @your-domain.org instead of onboarding@resend.dev.

Sources: [Vercel pricing](https://vercel.com/pricing) · [Vercel Hobby plan terms](https://vercel.com/docs/plans/hobby) · [Vercel Blob pricing](https://vercel.com/docs/vercel-blob/usage-and-pricing) · [Neon pricing](https://neon.com/pricing) · [Neon plans](https://neon.com/docs/introduction/plans) · [Supabase pricing](https://supabase.com/pricing) · [Supabase free-tier pause behavior](https://uibakery.io/blog/supabase-pricing) · [Resend pricing](https://resend.com/pricing) · [Hostinger Next.js hosting](https://www.hostinger.com/web-apps-hosting/nextjs-hosting) · [Hostinger Node.js hosting](https://www.hostinger.com/nodejs-hosting) · [Hostinger pricing overview](https://www.websitebuilderexpert.com/web-hosting/hostinger-pricing/)
