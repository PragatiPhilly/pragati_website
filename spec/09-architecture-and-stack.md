# Architecture & Stack

What we're using to build this, and why each choice.

## Stack overview

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | **Next.js 14+ (App Router)** | Best React framework. Server components for fast pages. Built-in API routes for backend. |
| Hosting | **Vercel** | Zero-config Next.js deploys. Edge network. Generous free tier. |
| Database | **Supabase Postgres** | Managed Postgres + Auth + Storage in one. Row-level security perfect for member privacy. |
| Auth | **Supabase Auth** | Email/password, magic link, OAuth all built-in. Tightly integrated with RLS. |
| Payments | **Square** (card) + **Zelle** (manual) | Square: Pragati already has an account. Zelle: zero fees, manual admin verification. |
| Email | **Resend** | Modern, Next.js-friendly, clean templating with React Email. |
| Image storage | **Cloudflare R2** | S3-compatible, much cheaper than S3, free egress. |
| Image processing | **Sharp** (Node.js) | Industry standard for resize/optimize. Runs in Next.js API routes. |
| CDN | **Cloudflare** (in front of Vercel) | DDoS protection, additional caching. |
| Error monitoring | **Sentry** | Catch runtime errors in production. Free tier sufficient. |
| Analytics | **Vercel Analytics** + **Plausible** | Privacy-respecting, no cookies. |
| CSS | **Tailwind CSS + CSS variables** | Tailwind for layout/utility, CSS vars for our theme system. |
| Forms | **React Hook Form + Zod** | Best-in-class form validation. |
| ORM / DB client | **Drizzle ORM** (or Supabase JS) | Type-safe queries; switch to Prisma if team prefers. |
| Testing | **Vitest + Playwright** | Unit + E2E. |
| Deployment | **GitHub → Vercel auto-deploy** | Push to `main` deploys to production. PR previews automatic. |

## Why not alternatives

- **Why not WordPress / Wix / Squarespace?** Can't customize Square + Zelle dual-rail + guest checkout + ticket-with-QR flows without heavy plugin gymnastics. Painful when you outgrow them.
- **Why not Stripe?** Committee already has a Square account and prefers Zelle for the fee-free path. Stripe would mean opening a new merchant account and losing the Zelle option (Stripe has no bank-transfer equivalent for consumer use in the US).
- **Why not Django / Rails?** Excellent choices but Next.js gives us a single language end-to-end (TypeScript), faster iteration, better default hosting.
- **Why not separate React frontend + Express backend?** Two deployments, more ops. Next.js fullstack is right-sized for one developer.
- **Why not Firebase?** Vendor lock-in on a non-SQL DB. Supabase gives us standard Postgres we can leave anytime.
- **Why not raw S3?** R2 is cheaper, and free egress matters for serving images.
- **Why not SendGrid?** Resend's API is dramatically nicer and the deliverability is competitive. SendGrid is fine too — easy to swap.

## Project structure (Next.js App Router)

```
pragati/
├── README.md
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── drizzle.config.ts
├── .env.local                  # NEVER committed
├── .env.example                # committed, no real values
├── public/                     # static assets
│   ├── favicon.ico
│   └── og-image.png
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── layout.tsx          # root layout + theme provider
│   │   ├── page.tsx            # public homepage
│   │   ├── about/page.tsx
│   │   ├── events/page.tsx     # events list
│   │   ├── events/[slug]/page.tsx  # individual event
│   │   ├── magazine/page.tsx
│   │   ├── sponsors/page.tsx
│   │   ├── contact/page.tsx
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   ├── m/                  # member section (auth-protected)
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx        # member dashboard
│   │   │   ├── profile/page.tsx
│   │   │   ├── family/page.tsx
│   │   │   ├── tickets/page.tsx
│   │   │   ├── directory/page.tsx
│   │   │   └── renewal/page.tsx
│   │   ├── admin/              # admin section (auth + role-protected)
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx        # admin dashboard
│   │   │   ├── members/
│   │   │   ├── events/
│   │   │   ├── tickets/
│   │   │   ├── sponsors/
│   │   │   ├── team/
│   │   │   ├── magazine/
│   │   │   ├── content/
│   │   │   ├── audit/          # super-admin only
│   │   │   └── settings/
│   │   ├── checkout/           # ticket purchase flow
│   │   │   ├── [eventSlug]/page.tsx
│   │   │   └── success/page.tsx
│   │   └── api/                # backend endpoints
│   │       ├── auth/
│   │       ├── members/
│   │       ├── events/
│   │       ├── checkout/
│   │       ├── stripe-webhook/
│   │       ├── upload-image/
│   │       └── ...
│   ├── components/
│   │   ├── ui/                 # buttons, inputs, modals
│   │   ├── theme/              # theme provider, switcher
│   │   ├── hero/               # hero component
│   │   ├── deities/            # SVG illustrations (DurgaScene, KaliScene, SaraswatiScene)
│   │   ├── events/             # event card, ticket selector
│   │   └── admin/              # admin-specific UI
│   ├── lib/
│   │   ├── db/                 # Drizzle schema + queries
│   │   │   ├── schema.ts
│   │   │   ├── client.ts
│   │   │   └── migrations/
│   │   ├── auth/               # auth helpers, session, RBAC
│   │   ├── stripe/             # stripe client + helpers
│   │   ├── email/              # email templates (React Email)
│   │   ├── images/             # upload + resize helpers
│   │   ├── audit/              # audit log helpers
│   │   └── utils/
│   ├── middleware.ts           # auth check on /m and /admin routes
│   └── styles/
│       └── globals.css         # CSS vars + Tailwind
├── tests/
│   ├── unit/
│   └── e2e/
├── scripts/
│   ├── seed-dev-data.ts
│   └── import-legacy-members.ts
└── docs/
    └── adr/                    # Architecture Decision Records
```

## Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `DATABASE_URL` | Supabase | Postgres connection |
| `DIRECT_DATABASE_URL` | Supabase | Direct connection for migrations |
| `SUPABASE_URL` | Supabase | Public URL |
| `SUPABASE_ANON_KEY` | Supabase | Client-side key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Server-side key (server only!) |
| `SQUARE_ACCESS_TOKEN` | Square | Server-side |
| `SQUARE_APPLICATION_ID` | Square | Client-side |
| `SQUARE_LOCATION_ID` | Square | Which Pragati location receives payments |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Square | Webhook signature verification |
| `SQUARE_ENV` | Square | 'sandbox' or 'production' |
| `ZELLE_RECIPIENT_EMAIL` | System config | Displayed on Zelle instructions |
| `ZELLE_RECIPIENT_DISPLAY_NAME` | System config | Human-readable name shown to buyers |
| `LOOKUP_HMAC_SECRET` | App | For signing guest ticket PDF URLs |
| `RESEND_API_KEY` | Resend | Email sending |
| `RESEND_FROM_EMAIL` | Resend | `noreply@pragatiphilly.org` |
| `R2_ACCOUNT_ID` | Cloudflare | R2 bucket |
| `R2_ACCESS_KEY_ID` | Cloudflare | |
| `R2_SECRET_ACCESS_KEY` | Cloudflare | |
| `R2_BUCKET_NAME` | Cloudflare | |
| `R2_PUBLIC_URL` | Cloudflare | CDN URL prefix |
| `SENTRY_DSN` | Sentry | Error reporting |
| `NEXT_PUBLIC_SITE_URL` | App | e.g. `https://pragatiphilly.org` |
| `ADMIN_NOTIFICATION_EMAIL` | App | Where admin alerts go |

All stored in Vercel as encrypted env vars. `.env.local` for local dev only. `.env.example` committed with placeholder values.

## Environments

| Environment | URL | Database | Square mode | Zelle mode | Email mode |
|---|---|---|---|---|---|
| Local dev | `localhost:3000` | Local Supabase or staging | Sandbox | Simulated (no real bank) | Console log + real if env set |
| Preview (PR) | auto Vercel URL | Staging | Sandbox | Simulated | Console log |
| Staging | `staging.pragatiphilly.org` | Staging DB | Sandbox | Simulated (fake "mark paid" button) | Real (to your email) |
| Production | `pragatiphilly.org` | Production DB | Production | Real (treasurer's bank) | Real |

**Critical rule:** the production DB is NEVER touched by local dev. Period.

## Deployment

- `main` branch auto-deploys to production
- Every PR gets a preview deploy with staging DB
- Migrations run automatically via Vercel build step (or manually before merge for risky ones)
- Rollback: Vercel "Promote a previous deployment" button

## Observability

- **Sentry** for runtime errors (frontend + backend)
- **Vercel Analytics** for web vitals (cookieless)
- **Plausible** for page views (cookieless, privacy-friendly)
- **Stripe Dashboard** for payment metrics
- **Resend Dashboard** for email deliverability
- **Supabase Dashboard** for DB performance

Daily checklist for first month post-launch:
1. Sentry error rate < 1%
2. Square failed-payment rate < 5%
3. Zelle pending queue: none older than 24 hours (email alert if breached)
4. Resend bounce rate < 2%
5. Vercel build success 100%

## Performance targets

- Public homepage: LCP < 1.5s on 4G mobile
- Public homepage: 100% Lighthouse Performance
- Event page: TTFB < 500ms
- Stripe checkout redirect: < 1.5s

## Scaling assumptions

Designed for:
- 500 family members
- 2000 individual attendees per Durga Pujo
- 50 concurrent registrations during peak (the moment tickets go on sale)
- 100GB image storage
- 50,000 emails per year

Current architecture scales to **10x these numbers** without re-architecting (Vercel + Supabase autoscale; R2 is infinite). When/if we cross 10x, revisit caching strategy and possibly move to a dedicated DB instance.

## Backup strategy

- **Database:** Supabase automated daily backups, 7-day retention on free tier, 30-day on Pro. Plus weekly manual export to R2 (custom script).
- **Images:** R2 is durable, no backup needed (Cloudflare guarantees durability). But verify with a quarterly spot-check.
- **Source code:** GitHub (multiple developer clones).
- **Env secrets:** 1Password vault shared with super-admins.

## Disaster recovery test

Every 6 months:
1. Spin up a new Supabase project
2. Restore latest backup
3. Point a staging deploy at it
4. Verify the homepage loads and admin can log in
5. Document any issues

## Tech debt to address as it comes up

Track in `docs/adr/` (Architecture Decision Records). When a non-trivial decision is made, write a short ADR explaining why. Future-Sayantan will thank present-Sayantan.
