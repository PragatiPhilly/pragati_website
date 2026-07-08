# Pragati — Bengali Association of Greater Philadelphia

Community platform: public site, event registration with QR ticketing,
membership, donations, and a full admin portal (payments, check-in,
food-line scanning, kitchen reports, magazines, backups).

## Repository layout

| Path | What it is |
|---|---|
| [`app/`](./app/) | The application — Next.js 16, Drizzle ORM, Postgres (embedded PGlite for zero-setup local dev). **Start here.** |
| [`app/docs/`](./app/docs/) | All guides: [testing walkthrough](./app/docs/TESTING.md) · [features](./app/docs/FEATURES.md) · [deployment](./app/docs/DEPLOY.md) · [database & scripts](./app/docs/DATABASE.md) · [QR operations](./app/docs/QR-GUIDE.md) · [hosting cost comparison](./app/docs/HOSTING-COMPARISON.md) |
| [`spec/`](./spec/) | Product & technical specification the app was built against. |
| [`archive/`](./archive/) | Pre-build design prototypes, screenshots, and the original build plan. Not used by the app. |

## Quick start

```bash
cd app
npm install
cp .env.example .env.local
npm run db:push && npm run seed
npm run dev            # → http://localhost:3000
```

Seeded test accounts and the full walkthrough are in
[app/docs/TESTING.md](./app/docs/TESTING.md).
Deploying for real (Vercel + Postgres + all env vars) is
[app/docs/DEPLOY.md](./app/docs/DEPLOY.md).
