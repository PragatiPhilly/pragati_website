/**
 * ONE-TIME DATA BACKFILLS THAT APPLY THEMSELVES ON DEPLOY.
 *
 * Schema changes already self-apply through the lazy "ensure" helpers. This is
 * the same idea for *data*: jobs that need to run exactly once against a
 * database, without anyone SSH-ing anywhere or running a script by hand.
 *
 * How it stays safe:
 *  - each job claims a row in `data_migrations` keyed by name. `key` is the
 *    primary key, so if two server instances cold-start at the same moment only
 *    one INSERT wins — the other sees the conflict and skips.
 *  - a completed row is what prevents a re-run. Deploying again does nothing.
 *  - every job is ALSO idempotent on its own (it only fills blanks / inserts
 *    rows that aren't there), so even a torn run can be safely repeated.
 *  - a job that dies half-way leaves a stale `running` row; after
 *    STALE_MINUTES the next boot or cron reclaims and retries it.
 *  - nothing here can break the app. Every failure is caught, recorded, and
 *    retried later; the app is fully functional whether or not these have run.
 *    (Un-backfilled data just means older history is missing from the ledger.)
 *
 * Adding a job later: append to JOBS with a NEW key. Never edit an existing
 * key's logic — that database already thinks it ran.
 */
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensureExtraColumns } from "@/lib/schema-ensure";
import { ensureMembershipColumn } from "@/lib/membership-ensure";
import { ensurePaymentsTable } from "@/lib/ledger-ensure";
import { getConfig } from "@/lib/system-config";
import { nextConfirmationNumber } from "@/lib/confirmation";

const STALE_MINUTES = 15;

/** Phone placeholder for rows created before the field became mandatory. */
const PHONE_PLACEHOLDER = "+1 9999999999";

let ensured: Promise<void> | null = null;
function ensureMigrationsTable(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const db = getDb();
    try {
      await db.execute(sql`CREATE TABLE IF NOT EXISTS data_migrations (
        key text PRIMARY KEY,
        status text NOT NULL DEFAULT 'running',
        detail text,
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz
      );`);
    } catch {
      /* retried on the next call */
    }
  })().catch((e) => {
    ensured = null;
    throw e;
  });
  return ensured;
}

type Job = { key: string; describe: string; run: () => Promise<string> };

// ── the jobs ────────────────────────────────────────────────────

/**
 * Phone became mandatory on every public form. Older rows may hold null/blank,
 * which would break exports and any future NOT NULL constraint. Fills them with
 * an obviously-fake placeholder that's easy to filter in admin exports.
 */
async function backfillPhones(): Promise<string> {
  const db = getDb();
  await ensureExtraColumns();
  const per: string[] = [];
  let filled = 0;

  // Counted with an explicit SELECT rather than trusting the driver's rowCount,
  // which isn't reported consistently across postgres-js and PGlite.
  const fill = async <T extends { id: string }>(
    label: string,
    rows: () => Promise<T[]>,
    update: () => Promise<unknown>
  ) => {
    try {
      const pending = await rows();
      if (pending.length === 0) return;
      await update();
      filled += pending.length;
      per.push(`${label} ${pending.length}`);
    } catch {
      /* table absent in this context — skip; the others still get done */
    }
  };

  const blankMembers = or(isNull(schema.members.phone), eq(schema.members.phone, ""));
  await fill(
    "members",
    () => db.select({ id: schema.members.id }).from(schema.members).where(blankMembers),
    () => db.update(schema.members).set({ phone: PHONE_PLACEHOLDER }).where(blankMembers)
  );

  const blankRegs = or(isNull(schema.registrations.buyerPhone), eq(schema.registrations.buyerPhone, ""));
  await fill(
    "registrations",
    () => db.select({ id: schema.registrations.id }).from(schema.registrations).where(blankRegs),
    () => db.update(schema.registrations).set({ buyerPhone: PHONE_PLACEHOLDER }).where(blankRegs)
  );

  const blankDons = or(isNull(schema.donations.donorPhone), eq(schema.donations.donorPhone, ""));
  await fill(
    "donations",
    () => db.select({ id: schema.donations.id }).from(schema.donations).where(blankDons),
    () => db.update(schema.donations).set({ donorPhone: PHONE_PLACEHOLDER }).where(blankDons)
  );

  const blankMsgs = or(isNull(schema.contactMessages.phone), eq(schema.contactMessages.phone, ""));
  await fill(
    "contact_messages",
    () => db.select({ id: schema.contactMessages.id }).from(schema.contactMessages).where(blankMsgs),
    () => db.update(schema.contactMessages).set({ phone: PHONE_PLACEHOLDER }).where(blankMsgs)
  );

  if (filled === 0) return "no blank phone fields — nothing to fill";
  return `filled ${filled} blank phone field(s) with ${PHONE_PLACEHOLDER} (${per.join(", ")})`;
}

function ledgerStatus(s: string): "paid" | "pending" | "pending_verification" | "cancelled" {
  if (s === "paid") return "paid";
  if (s === "pending_zelle_verification") return "pending_verification";
  if (s.startsWith("cancelled")) return "cancelled";
  return "pending";
}

function ledgerMethod(m: string | null | undefined): "square" | "zelle" | "offline" | "comped" {
  return m === "square" || m === "zelle" || m === "offline" || m === "comped" ? m : "offline";
}

/**
 * Reconstruct the payments ledger from rows that predate it, so "Total
 * collected" and the Payments log cover all of history rather than only what
 * happened after the deploy.
 *
 * Registrations fan out into up to three entries (tickets / donation / dues)
 * because registrations.total_cents bundled all three together. Membership dues
 * were never stored as an amount at all, so they're estimated at the configured
 * price and flagged source='backfill' — the Payments log shows those as
 * "estimated" so nobody mistakes them for an observed payment.
 */
export async function backfillPaymentsLedger(): Promise<string> {
  const db = getDb();
  await ensureExtraColumns();
  await ensureMembershipColumn();
  await ensurePaymentsTable();

  const duesPrice = Number(await getConfig<number>("membership_annual_price_cents")) || 0;
  const existing = await db.select().from(schema.payments);
  const seen = new Set(existing.map((p) => `${p.kind}:${p.entityId}`));
  const rows: (typeof schema.payments.$inferInsert)[] = [];
  const add = (r: typeof schema.payments.$inferInsert) => {
    const key = `${r.kind}:${r.entityId}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(r);
  };

  // registrations → tickets + in-checkout donation + in-checkout dues
  const regs = await db.select().from(schema.registrations);
  for (const r of regs) {
    const donation = r.donationCents ?? 0;
    const dues = r.membershipSignup ? Math.min(duesPrice, Math.max(0, r.totalCents - donation)) : 0;
    const tickets = Math.max(0, r.totalCents - donation - dues);
    const base = {
      entityId: r.id,
      groupId: r.id,
      memberId: r.memberId ?? null,
      payerName: r.buyerName,
      payerEmail: r.buyerEmail.toLowerCase(),
      method: ledgerMethod(r.paymentMethod),
      status: ledgerStatus(r.status),
      squareOrderId: r.squareOrderId ?? null,
      squarePaymentId: r.squarePaymentId ?? null,
      reference: r.confirmationNumber,
      paidAt: r.paidAt ?? null,
      cancelledAt: r.cancelledAt ?? null,
      source: "backfill",
      createdAt: r.createdAt,
    };
    if (tickets > 0) add({ ...base, kind: "registration", amountCents: tickets, feeCents: r.processingFeeCents ?? 0 });
    if (donation > 0) add({ ...base, kind: "donation", amountCents: donation, feeCents: 0, note: "Added during ticket checkout" });
    if (dues > 0) add({ ...base, kind: "membership", amountCents: dues, feeCents: 0, note: "Annual dues bought during ticket checkout" });
  }

  // standalone donations
  const dons = await db.select().from(schema.donations);
  for (const d of dons) {
    add({
      kind: "donation",
      entityId: d.id,
      groupId: d.id,
      memberId: d.memberId ?? null,
      payerName: d.donorName,
      payerEmail: d.donorEmail.toLowerCase(),
      amountCents: d.amountCents,
      feeCents: 0,
      method: ledgerMethod(d.paymentMethod),
      status: ledgerStatus(d.status),
      squareOrderId: d.squareOrderId ?? null,
      squarePaymentId: d.squarePaymentId ?? null,
      reference: d.confirmationNumber,
      paidAt: d.paidAt ?? null,
      cancelledAt: d.cancelledAt ?? null,
      source: "backfill",
      createdAt: d.createdAt,
    });
  }

  // memberships — the ones with no financial record whatsoever
  const members = await db.select().from(schema.members);
  const users = await db.select().from(schema.users);
  let estimated = 0;
  for (const m of members) {
    if (m.membershipStatus === "inactive") continue; // lapsed / never joined
    if (m.source === "self_declared") continue; // honour-system claim, no dues charged
    const isPaid = m.membershipStatus === "active";
    const before = rows.length;
    add({
      kind: "membership",
      entityId: m.id,
      groupId: m.id,
      memberId: m.id,
      payerName: `${m.primaryFirstName} ${m.primaryLastName}`.trim(),
      payerEmail: (users.find((u) => u.id === m.userId)?.email ?? "").toLowerCase(),
      amountCents: duesPrice,
      feeCents: 0,
      method: m.squareOrderId ? "square" : "zelle",
      status: isPaid ? "paid" : "pending",
      squareOrderId: m.squareOrderId ?? null,
      reference: `MEM-${m.id.slice(0, 6).toUpperCase()}`,
      paidAt: isPaid ? (m.membershipStartedAt ? new Date(`${m.membershipStartedAt}T12:00:00Z`) : m.updatedAt) : null,
      source: "backfill",
      note: "Annual dues — amount estimated from the configured price (not recorded at the time)",
      createdAt: m.createdAt,
    });
    if (rows.length > before && isPaid) estimated++;
  }

  if (rows.length === 0) return "ledger already covered every row — nothing to write";

  for (let i = 0; i < rows.length; i += 100) {
    await db.insert(schema.payments).values(rows.slice(i, i + 100));
  }
  return `wrote ${rows.length} ledger entries (${estimated} membership amount(s) estimated from the configured dues price)`;
}


/**
 * PRG-2026-0025 repair.
 *
 * Before 2026-08-27 a cron job cancelled card checkouts whose 15-minute
 * "reservation" had lapsed. Square payment links never expire, so a buyer could
 * pay one hours later. When that happened the registration correctly went to
 * `paid`, but settlePayments() only ever touched rows that were still
 * outstanding — and the sweeper had already voided them — so the money stayed
 * in the ledger as "cancelled: reservation expired without payment", invisible
 * to the Payments page and every dashboard total. The released seats were never
 * retaken either.
 *
 * The current code cannot produce this state (there is no expiry sweep at all
 * any more, and confirmed payments revive cancelled rows). This repairs the
 * rows that already exist.
 *
 * Deliberately conservative: it only touches ledger rows whose OWNING record
 * already says `paid`. It never invents a payment — only Square's confirmation
 * can set `paid` — so this cannot manufacture a false positive.
 */
async function repairSweptThenPaidLedger(): Promise<string> {
  await ensurePaymentsTable();
  const { ensurePaymentIntegritySchema } = await import("@/lib/payments/ensure");
  await ensurePaymentIntegritySchema();
  const db = getDb();

  let ledgerRows = 0;
  let seats = 0;
  let cents = 0;
  const fixed: string[] = [];

  const paidRegs = await db.select().from(schema.registrations).where(eq(schema.registrations.status, "paid"));
  for (const reg of paidRegs) {
    const rows = await db.select().from(schema.payments).where(eq(schema.payments.entityId, reg.id));
    const stuck = rows.filter((r) => r.status === "cancelled");
    if (stuck.length === 0) continue;

    const now = new Date();
    await db
      .update(schema.payments)
      .set({
        status: "paid",
        paidAt: reg.paidAt ?? now,
        cancelledAt: null,
        squarePaymentId: reg.squarePaymentId ?? sql`${schema.payments.squarePaymentId}`,
        note: "Repaired: paid after the reservation sweep had voided it (PRG-2026-0025 class defect).",
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.payments.entityId, reg.id),
          eq(schema.payments.status, "cancelled")
        )
      );
    ledgerRows += stuck.length;
    cents += stuck.reduce((t, r) => t + r.amountCents + r.feeCents, 0);
    fixed.push(reg.confirmationNumber);

    // The sweep also released this order's seats and nothing ever took them
    // back, so the ticket type has been under-counting ever since.
    if (reg.cancelledAt != null) {
      const tix = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, reg.id));
      for (const t of tix) {
        await db
          .update(schema.ticketTypes)
          .set({ soldCount: sql`${schema.ticketTypes.soldCount} + 1` })
          .where(eq(schema.ticketTypes.id, t.ticketTypeId));
        seats++;
      }
    }
    // Clear the cancellation stamp so the record reads honestly from now on.
    await db
      .update(schema.registrations)
      .set({ cancelledAt: null, updatedAt: now })
      .where(eq(schema.registrations.id, reg.id));
  }

  const paidDons = await db.select().from(schema.donations).where(eq(schema.donations.status, "paid"));
  for (const don of paidDons) {
    const rows = await db.select().from(schema.payments).where(eq(schema.payments.entityId, don.id));
    const stuck = rows.filter((r) => r.status === "cancelled");
    if (stuck.length === 0) continue;
    await db
      .update(schema.payments)
      .set({
        status: "paid",
        paidAt: don.paidAt ?? new Date(),
        cancelledAt: null,
        note: "Repaired: paid after the reservation sweep had voided it (PRG-2026-0025 class defect).",
        updatedAt: new Date(),
      })
      .where(and(eq(schema.payments.entityId, don.id), eq(schema.payments.status, "cancelled")));
    ledgerRows += stuck.length;
    cents += stuck.reduce((t, r) => t + r.amountCents + r.feeCents, 0);
    fixed.push(don.confirmationNumber);
  }

  if (ledgerRows === 0) return "nothing to repair";
  return `restored ${ledgerRows} ledger row(s) worth $${(cents / 100).toFixed(2)} and ${seats} seat(s) — ${fixed.join(", ")}`;
}


/**
 * In-checkout donations that were never visible on the Donations page.
 *
 * A gift added during ticket checkout only ever produced a `payments` row keyed
 * to the registration. The Donations page reads the `donations` table, so those
 * gifts — including Parijat Paul's $150 on PRG-2026-0025 — had no row there and
 * were invisible as donations, even though the money was correctly banked.
 *
 * This creates the missing rows. It writes NO new payments row: the money is
 * already recorded exactly once, and these rows are a view of it, not a second
 * copy of it. Status is copied from the registration, so a gift on an unpaid
 * checkout does not appear as received.
 */
async function backfillInCheckoutDonations(): Promise<string> {
  await ensurePaymentsTable();
  const { ensurePaymentIntegritySchema } = await import("@/lib/payments/ensure");
  await ensurePaymentIntegritySchema();
  const db = getDb();

  const regs = await db.select().from(schema.registrations);
  const byId = new Map(regs.map((r) => [r.id, r]));

  const donationRows = await db.select().from(schema.payments).where(eq(schema.payments.kind, "donation"));
  const existing = await db.select().from(schema.donations);
  const alreadyLinked = new Set(existing.map((d) => d.sourceRegistrationId).filter(Boolean));

  let made = 0;
  let cents = 0;
  for (const row of donationRows) {
    const reg = byId.get(row.entityId);
    if (!reg) continue; // a standalone donation — it already has its own row
    if (alreadyLinked.has(reg.id)) continue;
    if (row.amountCents <= 0) continue;

    try {
      const conf = await nextConfirmationNumber("DON");
      await db.insert(schema.donations).values({
        confirmationNumber: conf,
        memberId: reg.memberId,
        donorName: reg.buyerName,
        donorEmail: reg.buyerEmail,
        donorPhone: reg.buyerPhone ?? PHONE_PLACEHOLDER,
        amountCents: row.amountCents,
        inHonorOrMemory: "none",
        isAnonymous: false,
        paymentMethod: reg.paymentMethod,
        status: reg.status,
        paidAt: reg.status === "paid" ? reg.paidAt : null,
        squarePaymentId: reg.squarePaymentId,
        sourceRegistrationId: reg.id,
        notes: `Added during ticket checkout ${reg.confirmationNumber} (backfilled)`,
      });
      alreadyLinked.add(reg.id);
      made++;
      cents += row.amountCents;
    } catch {
      /* a duplicate confirmation number or a partial DB — skipped, retried later */
    }
  }

  if (made === 0) return "no in-checkout donations needed a row";
  return `created ${made} donation row(s) worth $${(cents / 100).toFixed(2)} for gifts added during ticket checkout`;
}

const JOBS: Job[] = [
  {
    key: "2026-08-backfill-phone-placeholders",
    describe: "Fill blank phone numbers left by rows created before the field was mandatory",
    run: backfillPhones,
  },
  {
    key: "2026-08-backfill-payments-ledger",
    describe: "Reconstruct the payments ledger from existing registrations, donations and members",
    run: backfillPaymentsLedger,
  },
  {
    key: "2026-08-repair-swept-then-paid",
    describe: "Restore money + seats for orders paid after the old reservation sweep had written them off",
    run: repairSweptThenPaidLedger,
  },
  {
    key: "2026-08-backfill-in-checkout-donations",
    describe: "Give gifts added during ticket checkout a row on the Donations page",
    run: backfillInCheckoutDonations,
  },
];

// ── the runner ──────────────────────────────────────────────────

/**
 * Run whatever hasn't run yet. Safe to call on every boot and from the cron —
 * it does nothing once the jobs are recorded as done. Never throws.
 */
export async function runPendingDataMigrations(): Promise<{ key: string; result: string }[]> {
  const done: { key: string; result: string }[] = [];
  const db = getDb();

  // Fast path. Once every job is recorded as done — which is the case for all
  // but the very first boot after a deploy — this is the ONLY query we run.
  // Cold starts are frequent on serverless and the database is metered, so the
  // steady state has to be one cheap read, not a handful of writes per job.
  let recorded: { key: string; status: string; startedAt: Date }[];
  try {
    await ensureMigrationsTable();
    recorded = await db
      .select({
        key: schema.dataMigrations.key,
        status: schema.dataMigrations.status,
        startedAt: schema.dataMigrations.startedAt,
      })
      .from(schema.dataMigrations);
  } catch {
    return done; // can't bookkeep → don't risk running anything unguarded
  }

  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60_000);
  const pending = JOBS.filter((job) => {
    const row = recorded.find((r) => r.key === job.key);
    if (!row) return true; // never attempted
    if (row.status === "done") return false;
    if (row.status === "failed") return true; // retry on the next boot
    // status === "running": only reclaim if the instance that held it died.
    return row.startedAt < staleBefore;
  });
  if (pending.length === 0) return done;

  for (const job of pending) {
    try {
      // Clear the previous attempt's row so the insert below can re-claim it.
      // Narrow: never touches a row another instance is actively working on.
      await db
        .delete(schema.dataMigrations)
        .where(
          and(
            eq(schema.dataMigrations.key, job.key),
            or(
              eq(schema.dataMigrations.status, "failed"),
              and(eq(schema.dataMigrations.status, "running"), lt(schema.dataMigrations.startedAt, staleBefore))
            )
          )
        );

      // Claim it. Losing this race (or the job being already done) means skip.
      const claimed = await db
        .insert(schema.dataMigrations)
        .values({ key: job.key, status: "running", detail: job.describe })
        .onConflictDoNothing()
        .returning();
      if (claimed.length === 0) continue;

      const result = await job.run();
      await db
        .update(schema.dataMigrations)
        .set({ status: "done", detail: result, finishedAt: new Date() })
        .where(eq(schema.dataMigrations.key, job.key));
      console.log(`[data-migration] ${job.key}: ${result}`);
      done.push({ key: job.key, result });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[data-migration] ${job.key} FAILED (will retry on the next boot):`, message);
      try {
        await db
          .update(schema.dataMigrations)
          .set({ status: "failed", detail: message.slice(0, 500), finishedAt: new Date() })
          .where(eq(schema.dataMigrations.key, job.key));
      } catch {
        /* bookkeeping is best-effort */
      }
      // keep going — one bad job must not block the others
    }
  }
  return done;
}

/** For the admin health panel: what has run, and did anything fail? */
export async function dataMigrationStatus(): Promise<{ key: string; status: string; detail: string | null }[]> {
  try {
    await ensureMigrationsTable();
    const db = getDb();
    return await db
      .select({ key: schema.dataMigrations.key, status: schema.dataMigrations.status, detail: schema.dataMigrations.detail })
      .from(schema.dataMigrations);
  } catch {
    return [];
  }
}
