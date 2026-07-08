# Security & Privacy

How we keep member data safe and the org out of legal trouble.

## Threat model

Who might attack us, in rough order of likelihood:

1. **Automated bots** scanning for vulnerabilities, exposed admin pages, weak passwords. Highest volume, lowest skill.
2. **Spammers** posting form spam or trying to send mass email through us.
3. **Disgruntled former member** trying to access the member list or delete data.
4. **Curious member** trying to see another member's private info.
5. **Phishing attack** against an admin to steal their session.
6. **Insider mistake** — admin accidentally deletes records or exports data they shouldn't.
7. **Targeted attack** — extremely unlikely; we're a small community non-profit.

Our defense priorities are roughly in this order.

## Authentication

### Member passwords

- Stored as **bcrypt hashes** (cost factor 12+). Plain passwords never persisted or logged.
- Password requirements: minimum 10 characters, no other rules (NIST 800-63B compliant — long is better than complex).
- Password reset via emailed one-time link with 1-hour expiry.
- Rate limit login attempts: 5 per 15-minute window per IP + email combo.
- Lockout after 10 failed attempts in 24h (with email notification).

### Admin authentication

Same as members, **plus**:
- **2FA strongly recommended** (TOTP via Google Authenticator / 1Password / Authy)
- **2FA required for super-admins** (no opt-out)
- Admin sessions expire after 8 hours of inactivity
- Admin sessions are bound to IP — if IP changes mid-session, re-auth required

### Session management

- HTTP-only, Secure, SameSite=Lax cookies
- Session token rotated on login
- Logout invalidates the session server-side (not just delete cookie)
- All sessions invalidated on password change

## Authorization (RBAC)

Every API route declares the required role:

```ts
// /api/admin/members/[id]/delete
export const POST = withAuth({ role: 'super_admin' }, async (req, ctx) => {
  // ...
})
```

Routes without explicit auth declaration **fail closed** (deny by default). No silent assumption that the route is public.

### Row-level security in Supabase

For tables that contain user data, we enable Postgres RLS policies:

```sql
-- members can read only their own row
create policy "members read own"
on members for select
using (auth.uid() = user_id);

-- admins can read all members
create policy "admins read all"
on members for select
using (
  exists (select 1 from users where users.id = auth.uid() and users.role in ('admin', 'super_admin'))
);
```

This is **defense in depth.** Even if our application code has a bug, the database won't return data the user isn't allowed to see.

## Input validation

Every API endpoint validates input with **Zod schemas**. Reject early.

```ts
const SignupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(200),
  primaryFirstName: z.string().min(1).max(80),
  // ...
})

export const POST = async (req) => {
  const data = SignupSchema.parse(await req.json())
  // ... data is now type-safe and validated
}
```

This prevents:
- SQL injection (we use parameterized queries via Drizzle/Supabase anyway)
- Oversized inputs (no 1GB request bodies)
- Malformed data corrupting the DB

## Rate limiting

Public endpoints have rate limits to deter brute force + DoS:

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 5/min/IP |
| `POST /api/auth/signup` | 3/min/IP |
| `POST /api/auth/forgot-password` | 3/hour/IP |
| `POST /api/contact` | 5/hour/IP |
| `POST /api/checkout` | 10/min/IP |
| All other API | 60/min/IP |

Implementation: Upstash Redis (free tier) + middleware.

## Bot protection

- **Cloudflare Turnstile** on signup, login, forgot password, contact form, guest checkout, guest lookup, donation
- Honeypot field in forms (hidden, bot fills it, we reject)
- User-Agent sanity check (no requests from `python-requests` etc. on public endpoints)

## Guest lookup security

The `/lookup` endpoint lets anyone with a valid `(email, confirmation_number)` pair retrieve tickets — this is by design (a guest bought tickets without an account and needs to see them later). Attack surface:

- **Enumeration:** an attacker tries every confirmation number to find valid ones. Mitigation: `PRG-YYYY-NNNN` sequential is easy to guess, so we combine sequential numbers with a **short random suffix** (`PRG-2026-4821-A7K3`) that isn't guessable. Only the full string matches.
- **Spraying:** attacker tries known email addresses against many confirmation numbers. Mitigation: rate limit 5 lookups per email per hour + 20 per IP per hour + Turnstile challenge on the form.
- **Response-timing analysis:** to prevent leaking "this email exists but the conf is wrong" vs "this email doesn't exist," always take constant time to respond and always return the same generic error on failure ("no matching order").
- **PII in the URL:** never put email or full conf in URLs where they could leak in logs; POST body only.

## Signed URLs for ticket PDFs

Guest ticket PDF downloads use short-lived signed URLs:
- URL format: `/api/lookup/PRG-2026-4821/tickets/ID/pdf?sig=HMAC&exp=EPOCH`
- HMAC signed with server secret, valid for 15 minutes
- Anyone with the signed URL can download during that window
- Regenerable by re-authenticating via `/lookup`

## Secrets management

| Secret | Where stored | Who has access |
|---|---|---|
| Square access token (live) | Vercel env (production only) | Sayantan + super-admins via 1Password |
| Square webhook signature key | Vercel env (production only) | Sayantan + super-admins |
| Database connection string | Vercel env | Sayantan only (production) |
| Resend API key | Vercel env | Sayantan + super-admins |
| R2 credentials | Vercel env | Sayantan + super-admins |
| Supabase service role key | Vercel env | Sayantan only |
| Lookup HMAC signing secret | Vercel env | Sayantan only |

Rules:
- **Never** commit secrets to git
- **Never** paste secrets in Slack/email/Discord
- **Always** use 1Password (or similar) for sharing
- **Rotate** secrets if any is exposed (e.g., screen share recorded)
- **Audit** every 6 months

## PII handling

### What we store (PII)

- Email addresses (members + guest buyers + donors)
- Names (members + family members + guest attendees + donors + honorees)
- Phone numbers
- Home addresses (members only)
- Food preferences (could indicate religion/health)
- Children's names + ages (extra sensitive)
- Ticket purchase history (indexed by buyer_email even for guests)
- Donation history including "in honor / in memory of" details
- Guest checkout PII (name + email + phone) stored on the `registrations` and `donations` rows even without an account

### What we don't store

- ❌ Credit card numbers (Stripe)
- ❌ Social Security Numbers
- ❌ Government ID numbers
- ❌ Banking information
- ❌ Race / ethnicity / political affiliation
- ❌ Anything else "sensitive PII" under CCPA

### Where it's stored

- Postgres (Supabase) — encrypted at rest by Supabase
- R2 (Cloudflare) — for uploaded images; encrypted at rest
- Resend logs — temporary, for email tracking
- Square — for card payment metadata only (Square holds card data; we don't)
- Zelle — Pragati's bank stores deposit records. We store the buyer's confirmation number and manual verification metadata only.

### Encryption in transit

- All connections forced HTTPS (HSTS header)
- Database connection over TLS
- Stripe communication over TLS
- Email API over TLS

### Encryption at rest

- Supabase Postgres: AES-256 by default
- R2: AES-256 by default
- Backups: encrypted

### Access controls

- Production DB: only Sayantan has direct credentials
- Supabase Dashboard: 2FA required, Sayantan + 1 super-admin
- Vercel: 2FA required, Sayantan only
- Audit log captures every admin read/write of member data

## GDPR & CCPA compliance

We're a US-based 501(c)(3), but visitors may be from the EU/UK or California. So:

### User rights (CCPA + GDPR)

1. **Right to know** what data we have → Member can view own data via `/m/profile`
2. **Right to delete** → "Delete my account" button → 30-day soft delete, then hard delete
3. **Right to export** → "Download my data" → JSON file
4. **Right to correct** → Edit profile
5. **Right to opt out of sale** → We don't sell data. Notice in privacy policy.

### Data retention

| Data | Retention |
|---|---|
| Active member records | Indefinite (while member is active) |
| Inactive member records | 3 years after last activity, then anonymize |
| Guest buyer PII (name/email/phone on registrations) | 3 years after the event, then anonymize (keep transaction amounts for tax records) |
| Guest donor PII on donations | 7 years (IRS retention requirement — donors may be issued tax receipts) |
| Payment records | 7 years (IRS retention requirement) |
| Audit log | 2 years rolling |
| Email log | 1 year rolling |
| Failed login attempts | 90 days |
| Session tokens | Until expiry |

### Breach notification

If a breach occurs:
1. Stop the breach (revoke credentials, take site down if needed)
2. Within 24h: Sayantan notifies super-admins
3. Within 72h: super-admins consult lawyer if applicable; notify affected members via email
4. Within 7 days: file required reports (e.g., California AG if CCPA applies)
5. Post-incident: write a public post-mortem, improve safeguards

## Audit logging

Every admin action writes to `audit_log` table (see [03-data-model.md](./03-data-model.md)).

Tracked actions:
- Login / logout
- Read of any member's full data (not own data)
- Read of any registration / payment
- Create / update / delete of any record
- Export of any data
- Refund issued
- Permission changes
- Settings changes

Super-admin can view the audit log via `/admin/audit`.

Audit logs are **append-only** — even super-admins can't delete log entries.

## Backups & disaster recovery

- **Daily automated DB backup** by Supabase (Pro plan, 30-day retention)
- **Weekly manual DB export** to R2 (custom cron job; 1-year retention)
- **Image storage** R2 is durable; no separate backup
- **Code** in GitHub

### Restore procedure

Documented step-by-step in `docs/runbook-restore.md`. Tested every 6 months.

### Single point of failure

Sayantan being unavailable. Mitigations:
- Code in GitHub with 2+ super-admins able to read
- Vercel + Supabase + Stripe + Resend dashboards accessible to 2 super-admins
- 1Password vault shared with 2 super-admins
- Runbook documented

## Penetration testing

Recommended before public launch (Stage 6):
- DIY checklist: OWASP Top 10 walkthrough
- Optional: 1-day pen-test from Cobalt.io (~$2000)
- Friends-of-Pragati who are security people can do free informal review

## Vulnerability response

- **Dependabot** enabled on GitHub for auto-PRs on dependency vulnerabilities
- **Sayantan** reviews and merges security PRs within 7 days
- **Critical CVEs** (Stripe library, Next.js core) → patched within 24 hours

## Privacy policy & ToS — deferred per committee decision

The committee decided (Nov 2026) not to draft a formal privacy policy or ToS in v1, reflecting Pragati's close-knit community and the low risk profile.

**What we still do regardless of formal policy:**
- Show a simple footer link "Data handling" that displays a short plain-language note about what we collect and how we use it
- Never sell or share member data with third parties
- Only pass data to necessary service providers (Square for card payments, Resend for emails, Cloudflare for hosting, Supabase for database) under their standard commercial agreements
- Provide a contact email `pragati.management@gmail.com` for any data questions
- On explicit member request, delete their data within a reasonable window (14 days)

**When to revisit and draft real policies:**
- If Pragati grows to > 500 active members
- If any member from California / EU / UK explicitly asks about their data rights
- If the org ever runs public marketing (email newsletters to non-members, social media ads)
- Before adding online magazine sales, donation-tier recognition, or any feature that publishes member identity
- If Pragati acquires legal counsel

**A note on legal reality:** Even without a formal ToS, US 501(c)(3) organizations that collect payment and personal data have common-law duties (reasonable data protection, honoring deletion requests, not misrepresenting how data is used). The technical controls in this doc — encryption at rest, HTTPS, RLS, backups, audit logs — cover the most important of these regardless of whether a formal policy is written.

## Cookie usage

- **Strictly necessary:** auth session cookie. No banner needed.
- **No tracking cookies.** No Google Analytics. (Plausible is cookieless.)
- **No third-party cookies.** Stripe Checkout is on Stripe's domain, separate cookies there.

Because we use only strictly-necessary cookies, no cookie consent banner needed in most jurisdictions. But include the cookie policy doc anyway.

## What we don't do (intentionally)

- ❌ No tracking pixels in email
- ❌ No third-party analytics that profile users
- ❌ No selling/sharing of member data
- ❌ No "remember me" forever — sessions expire
- ❌ No password hints stored

## Security checklist for launch

- [ ] All env vars in Vercel, none in git
- [ ] HTTPS enforced everywhere (HSTS header set)
- [ ] CSP header set (Content Security Policy)
- [ ] X-Frame-Options: DENY (prevent clickjacking)
- [ ] X-Content-Type-Options: nosniff
- [ ] Referrer-Policy: strict-origin-when-cross-origin
- [ ] Rate limiting on all auth endpoints tested
- [ ] Turnstile working on signup, login, forgot-password
- [ ] 2FA enabled for all super-admin accounts
- [ ] Audit log working and queryable
- [ ] Backup tested with full restore
- [ ] Square webhook signature verification confirmed
- [ ] Zelle "Mark paid" flow requires visual bank-feed confirmation (documented in admin runbook, tested)
- [ ] Guest lookup rate limits tested with load tool
- [ ] Confirmation numbers include random suffix (unpredictable, not `PRG-2026-0001`)
- [ ] No `console.log` of PII in production
- [ ] Sentry filters out PII (filter sensitive keys: password, token, ssn)
- [ ] Resend domain verified with DKIM + SPF + DMARC
- [ ] Privacy Policy + ToS live and linked
- [ ] Cookie policy live
- [ ] All dependencies up to date (no critical CVEs)
- [ ] Lighthouse Best Practices ≥ 90
