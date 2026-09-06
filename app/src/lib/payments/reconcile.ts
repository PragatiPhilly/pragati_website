/**
 * SQUARE AUDITS OUR BOOKS — AND THEN A PERSON DECIDES.
 *
 * The webhook tells us what Square did. This asks Square what it did, and
 * compares — line by line — against our ledger. It is the safety net under
 * every other mechanism: if the webhook is lost, the signature key rotates, the
 * database is down for ninety seconds, or a future refactor breaks matching,
 * this finds it within a day instead of at the gate on Pujo morning.
 *
 * THIS FILE CHANGES NOTHING. It reads Square, reads our ledger, and writes
 * questions into `reconciliation_findings` for a human to answer in
 * admin → Reconciliation. Not even the safe direction is applied automatically.
 *
 * That is a deliberate choice over a technically-defensible auto-repair. Money
 * records that change themselves overnight are money records nobody can defend
 * in a committee meeting six months later: "the system did it" is not an
 * answer. Every correction now carries a name, a timestamp and a reason in the
 * audit log, and every dismissal does too.
 *
 * Four kinds of drift, deliberately treated very differently:
 *
 *   FALSE NEGATIVE   Square completed a payment; our books say pending or
 *                    cancelled. Money we have and don't know about — a buyer
 *                    with no ticket. This is the only kind with a correction the
 *                    system knows how to apply, and an admin still has to press
 *                    the button. Approving it re-checks Square first.
 *
 *   FALSE POSITIVE   Our books say paid; Square has no completed payment.
 *                    There is no safe automatic action at all: an API listing
 *                    pages, filters by location and can lag, so its silence is
 *                    not proof. Reviewed and dismissed with a note, or chased
 *                    by hand in the Square dashboard.
 *
 *   AMOUNT MISMATCH  Both agree it's paid, on different numbers.
 *
 *   ORPHAN           Square took money against an order we have never heard of.
 *
 * Everything is recorded in reconciliation_runs / reconciliation_findings so the
 * admin UI can show a clean "books agree with Square as of <time>" — the single
 * statement nobody could make on 2026-08-17.
 */
import { and, eq, inArray, gte } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { listSquarePayments, type SquarePaymentView } from "@/lib/payments/square";
import { ensurePaymentIntegritySchema } from "@/lib/payments/ensure";
import { ensurePaymentsTable } from "@/lib/ledger-ensure";
import { alertReconciliationDrift } from "@/lib/payments/alerts";
import { SETTLED, OUTSTANDING } from "@/lib/ledger";

/** Cents of slack allowed before two figures are called different (rounding only). */
const AMOUNT_TOLERANCE = 2;

export type Finding = {
  kind: "false_negative" | "false_positive" | "amount_mismatch" | "orphan" | "custody_overdue";
  severity: "warning" | "critical";
  reference: string | null;
  entityKind: string | null;
  entityId: string | null;
  squarePaymentId: string | null;
  squareOrderId: string | null;
  squareAmountCents: number | null;
  ledgerAmountCents: number | null;
  detail: string;
};

export type ReconcileReport = {
  runId: string | null;
  windowDays: number;
  squarePayments: number;
  falseNegatives: Finding[];
  falsePositives: Finding[];
  /** Desk money that never reached the org account. Not a Square question at
   *  all — a "where is it, and who has it" question. */
  custodyOverdue: Finding[];
  amountMismatches: Finding[];
  orphans: Finding[];
  /** Findings written to the review queue that weren't already open there. */
  newFindings: number;
  checkedAt: string;
};

type Owner = { kind: "registration" | "donation" | "membership"; id: string; reference: string | null; status: string };

/** Find whichever of our records a Square payment belongs to. */
async function ownerForSquarePayment(p: SquarePaymentView): Promise<Owner | null> {
  const db = getDb();
  if (p.orderId) {
    const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.squareOrderId, p.orderId));
    if (reg) return { kind: "registration", id: reg.id, reference: reg.confirmationNumber, status: reg.status };
    const [don] = await db.select().from(schema.donations).where(eq(schema.donations.squareOrderId, p.orderId));
    if (don) return { kind: "donation", id: don.id, reference: don.confirmationNumber, status: don.status };
    const [mem] = await db.select().from(schema.members).where(eq(schema.members.squareOrderId, p.orderId));
    if (mem) return { kind: "membership", id: mem.id, reference: mem.memberNumber, status: mem.membershipStatus };
  }
  // Fall back to the confirmation number Square carries in the payment note.
  const note = (p.note ?? "").trim();
  if (note) {
    const [reg] = await db
      .select()
      .from(schema.registrations)
      .where(eq(schema.registrations.confirmationNumber, note));
    if (reg) return { kind: "registration", id: reg.id, reference: reg.confirmationNumber, status: reg.status };
    const [don] = await db.select().from(schema.donations).where(eq(schema.donations.confirmationNumber, note));
    if (don) return { kind: "donation", id: don.id, reference: don.confirmationNumber, status: don.status };
  }
  return null;
}

export async function reconcileWithSquare(opts: { days?: number; now?: Date } = {}): Promise<ReconcileReport> {
  const days = opts.days ?? 7;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - days * 86_400_000);

  await ensurePaymentsTable();
  await ensurePaymentIntegritySchema();
  const db = getDb();

  let runId: string | null = null;
  try {
    const [run] = await db
      .insert(schema.reconciliationRuns)
      .values({ windowDays: days, autoSettle: false, startedAt: now })
      .returning();
    runId = run?.id ?? null;
  } catch {
    /* the run log is nice-to-have; the check itself is what matters */
  }

  const report: ReconcileReport = {
    runId,
    windowDays: days,
    squarePayments: 0,
    falseNegatives: [],
    falsePositives: [],
    custodyOverdue: [],
    amountMismatches: [],
    orphans: [],
    newFindings: 0,
    checkedAt: now.toISOString(),
  };

  try {
    const squarePayments = (await listSquarePayments({ since, until: now })).filter(
      (p) => p.status === "COMPLETED"
    );
    report.squarePayments = squarePayments.length;
    const seenEntityIds = new Set<string>();

    // ── direction 1: Square → us ─────────────────────────────────────────
    for (const p of squarePayments) {
      const owner = await ownerForSquarePayment(p);
      if (!owner) {
        report.orphans.push({
          kind: "orphan",
          severity: "critical",
          reference: p.note ?? null,
          entityKind: null,
          entityId: null,
          squarePaymentId: p.paymentId,
          squareOrderId: p.orderId,
          squareAmountCents: p.amountCents,
          ledgerAmountCents: null,
          detail: `Square completed $${(p.amountCents / 100).toFixed(2)} against an order we have no record of.`,
        });
        continue;
      }
      seenEntityIds.add(owner.id);

      const rows = await db.select().from(schema.payments).where(eq(schema.payments.entityId, owner.id));

      // ── walk-in desk orders reconcile PER TENDER (touchpoint T7) ───────
      // A desk order can hold several payments — $100 cash and $160 by card.
      // Square only ever knows about the card one, so comparing its figure to
      // the order's whole ledger total would report an amount mismatch every
      // single night, and an order legitimately still owing money would be
      // reported as a false negative. Both would be noise, and a review queue
      // that cries wolf is a review queue nobody opens. Compare the tender
      // Square is actually talking about.
      if (owner.kind === "registration" && (await isDeskRegistration(owner.id))) {
        const tender =
          rows.find((r) => r.squarePaymentId === p.paymentId) ??
          rows.find((r) => r.squareOrderId === p.orderId) ??
          rows.find((r) => r.method === "square" && !(SETTLED as string[]).includes(r.status));
        if (!tender) {
          report.orphans.push({
            kind: "orphan",
            severity: "critical",
            reference: owner.reference,
            entityKind: owner.kind,
            entityId: owner.id,
            squarePaymentId: p.paymentId,
            squareOrderId: p.orderId,
            squareAmountCents: p.amountCents,
            ledgerAmountCents: null,
            detail: `Square completed $${(p.amountCents / 100).toFixed(2)} against desk order ${owner.reference}, which has no card payment recorded.`,
          });
          continue;
        }
        const tenderTotal = tender.amountCents + (tender.feeCents ?? 0);
        if (!(SETTLED as string[]).includes(tender.status)) {
          report.falseNegatives.push({
            kind: "false_negative",
            severity: "critical",
            reference: owner.reference,
            entityKind: owner.kind,
            entityId: owner.id,
            squarePaymentId: p.paymentId,
            squareOrderId: p.orderId,
            squareAmountCents: p.amountCents,
            ledgerAmountCents: tenderTotal,
            detail: `Square completed $${(p.amountCents / 100).toFixed(2)} on the walk-in desk order ${owner.reference}, but that card payment is still "${tender.status}".`,
          });
        } else if (Math.abs(tenderTotal - p.amountCents) > AMOUNT_TOLERANCE) {
          report.amountMismatches.push({
            kind: "amount_mismatch",
            severity: "critical",
            reference: owner.reference,
            entityKind: owner.kind,
            entityId: owner.id,
            squarePaymentId: p.paymentId,
            squareOrderId: p.orderId,
            squareAmountCents: p.amountCents,
            ledgerAmountCents: tenderTotal,
            detail: `The desk recorded a $${(tenderTotal / 100).toFixed(2)} card payment; Square says $${(p.amountCents / 100).toFixed(2)}.`,
          });
        } else {
          await db
            .update(schema.payments)
            .set({ squareVerifiedAt: now, squareAmountCents: p.amountCents, updatedAt: now })
            .where(eq(schema.payments.id, tender.id))
            .catch(() => {});
        }
        continue;
      }

      const ledgerTotal = rows
        .filter((r) => (SETTLED as string[]).includes(r.status))
        .reduce((s, r) => s + r.amountCents + r.feeCents, 0);
      const unsettled = rows.filter((r) => !(SETTLED as string[]).includes(r.status));

      if (unsettled.length > 0 || owner.status.startsWith("cancelled") || owner.status === "pending_payment") {
        const finding: Finding = {
          kind: "false_negative",
          severity: "critical",
          reference: owner.reference,
          entityKind: owner.kind,
          entityId: owner.id,
          squarePaymentId: p.paymentId,
          squareOrderId: p.orderId,
          squareAmountCents: p.amountCents,
          ledgerAmountCents: ledgerTotal,
          detail: `Square completed $${(p.amountCents / 100).toFixed(2)} on ${p.createdAt}, but our record is "${owner.status}".`,
        };
        report.falseNegatives.push(finding);
        continue;
      }

      // Both say paid — do the numbers agree?
      if (Math.abs(ledgerTotal - p.amountCents) > AMOUNT_TOLERANCE) {
        report.amountMismatches.push({
          kind: "amount_mismatch",
          severity: "critical",
          reference: owner.reference,
          entityKind: owner.kind,
          entityId: owner.id,
          squarePaymentId: p.paymentId,
          squareOrderId: p.orderId,
          squareAmountCents: p.amountCents,
          ledgerAmountCents: ledgerTotal,
          detail: `Our books say $${(ledgerTotal / 100).toFixed(2)}, Square says $${(p.amountCents / 100).toFixed(2)}.`,
        });
      } else {
        // Agreement. Stamp it so the admin UI can show what has been verified.
        await db
          .update(schema.payments)
          .set({ squareVerifiedAt: now, squareAmountCents: p.amountCents, updatedAt: now })
          .where(eq(schema.payments.entityId, owner.id))
          .catch(() => {});
      }
    }

    // ── direction 2: us → Square ─────────────────────────────────────────
    // Anything our books call a settled CARD payment in this window that Square
    // did not list. Never auto-corrected — only surfaced.
    const ourPaidCards = await db
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.method, "square"),
          inArray(schema.payments.status, [...SETTLED]),
          gte(schema.payments.paidAt, since)
        )
      );
    const flaggedGroups = new Set<string>();
    for (const row of ourPaidCards) {
      if (seenEntityIds.has(row.entityId)) continue;
      if (row.source === "backfill") continue; // historical rows predate Square's window
      // Desk cash, cheques and Zelle never appear in Square by design — they
      // are handled by the custody sweep below, not by this comparison. (The
      // method filter above already excludes them; this is the second lock.)
      if (row.source === "desk" && row.method !== "square") continue;
      if (flaggedGroups.has(row.entityId)) continue;
      flaggedGroups.add(row.entityId);
      report.falsePositives.push({
        kind: "false_positive",
        severity: "critical",
        reference: row.reference,
        entityKind: row.kind,
        entityId: row.entityId,
        squarePaymentId: row.squarePaymentId,
        squareOrderId: row.squareOrderId,
        squareAmountCents: null,
        ledgerAmountCents: row.amountCents + row.feeCents,
        detail:
          `We record a paid card payment of $${((row.amountCents + row.feeCents) / 100).toFixed(2)}` +
          ` but Square listed no completed payment for it in the last ${days} days. Verify before trusting this row.`,
      });
    }

    // ── direction 3: money the desk took that never reached us ───────────
    report.custodyOverdue = await overdueCustodyFindings(now);

    report.newFindings = await persistFindings(runId, [
      ...report.falseNegatives,
      ...report.falsePositives,
      ...report.amountMismatches,
      ...report.orphans,
      ...report.custodyOverdue,
    ]);

    if (runId) {
      await db
        .update(schema.reconciliationRuns)
        .set({
          finishedAt: new Date(),
          squarePayments: report.squarePayments,
          falseNegatives: report.falseNegatives.length,
          falsePositives: report.falsePositives.length,
          amountMismatches: report.amountMismatches.length,
          orphans: report.orphans.length,
          repaired: 0,
          status: "ok",
        })
        .where(eq(schema.reconciliationRuns.id, runId))
        .catch(() => {});
    }

    // Only shout about questions that are actually new and still open — a
    // nightly email repeating yesterday's unresolved list trains people to
    // ignore it, which is how the next incident stays quiet for ten days.
    if (report.newFindings > 0) {
      await alertReconciliationDrift({
        falseNegatives: report.falseNegatives.length,
        falsePositives: report.falsePositives.length,
        amountMismatches: report.amountMismatches.length,
        orphans: report.orphans.length,
        newFindings: report.newFindings,
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (runId) {
      await db
        .update(schema.reconciliationRuns)
        .set({ finishedAt: new Date(), status: "error", error: message.slice(0, 2000) })
        .where(eq(schema.reconciliationRuns.id, runId))
        .catch(() => {});
    }
    throw e;
  }

  return report;
}

/**
 * Move our record to what Square says. Called ONLY from the admin approval
 * action, never from the scan. Applies to a false negative only, and the caller
 * re-checks Square immediately beforehand so a stale finding can't be actioned.
 */
/** Is this registration a walk-in desk order? One query, cached per run. */
const deskCache = new Map<string, boolean>();
async function isDeskRegistration(registrationId: string): Promise<boolean> {
  const hit = deskCache.get(registrationId);
  if (hit !== undefined) return hit;
  try {
    const db = getDb();
    const [reg] = await db
      .select({ source: schema.registrations.source, deskState: schema.registrations.deskState })
      .from(schema.registrations)
      .where(eq(schema.registrations.id, registrationId));
    const out = !!reg && (reg.source === "desk" || !!reg.deskState);
    deskCache.set(registrationId, out);
    return out;
  } catch {
    return false;
  }
}

/**
 * Money the walk-in desk took that has not reached the organisation.
 *
 * This is the only new question the desk added to reconciliation, and it is not
 * a Square question — Square has never heard of the cash in a drawer or the
 * Zelle sitting in a committee member's personal account. ONE finding per
 * holder, not one per payment: "Rina is holding $420 across 3 payments, oldest
 * 11 days" is a conversation somebody can have; forty rows are not.
 */
async function overdueCustodyFindings(now: Date): Promise<Finding[]> {
  const out: Finding[] = [];
  try {
    const { ensureDeskSchema } = await import("@/lib/desk/ensure");
    await ensureDeskSchema();
    const { custodyGroups } = await import("@/lib/desk/tenders");
    const { getConfig } = await import("@/lib/system-config");
    const overdueDays = Number(await getConfig<number>("desk_custody_overdue_days")) || 7;
    const cutoff = now.getTime() - overdueDays * 86_400_000;

    for (const g of await custodyGroups()) {
      if (!g.oldestAt || new Date(g.oldestAt).getTime() > cutoff) continue;
      const ageDays = Math.floor((now.getTime() - new Date(g.oldestAt).getTime()) / 86_400_000);
      out.push({
        kind: "custody_overdue",
        severity: "warning",
        reference: g.label,
        entityKind: null,
        // The dedupe key is built from entityId, so keying on the holder is
        // what stops this being re-raised nightly for the same person.
        entityId: `custody:${g.key}`,
        squarePaymentId: null,
        squareOrderId: null,
        squareAmountCents: null,
        ledgerAmountCents: g.amountCents,
        detail:
          `$${(g.amountCents / 100).toFixed(2)} taken at the walk-in desk is still with ${g.label}` +
          ` (${g.tenders.length} payment${g.tenders.length === 1 ? "" : "s"}, oldest ${ageDays} days).` +
          ` The guests are settled — this is about getting the money banked.`,
      });
    }
  } catch {
    /* the desk may not exist yet on an older database */
  }
  return out;
}

export async function applySquareTruth(
  owner: { kind: "registration" | "donation" | "membership"; id: string },
  p: SquarePaymentView
): Promise<void> {
  const via = {
    method: "square" as const,
    squarePaymentId: p.paymentId,
    confirmed: true,
    squareAmountCents: p.amountCents,
  };
  if (owner.kind === "registration") {
    const { markRegistrationPaid } = await import("@/lib/checkout");
    await markRegistrationPaid(owner.id, via);
  } else if (owner.kind === "donation") {
    const { markDonationPaid } = await import("@/lib/donations");
    await markDonationPaid(owner.id, via);
  } else {
    const { activateMembershipPaid } = await import("@/lib/membership");
    await activateMembershipPaid(owner.id, via);
  }
}

/**
 * Write findings into the review queue, skipping any question already sitting
 * open there. Returns how many were genuinely new. The unique index on
 * `dedupe_key WHERE status = 'open'` is the real guard — two instances scanning
 * at once cannot both insert the same question.
 */
async function persistFindings(runId: string | null, findings: Finding[]): Promise<number> {
  if (findings.length === 0) return 0;
  let created = 0;
  const db = getDb();
  for (const f of findings) {
    const dedupeKey = `${f.kind}:${f.entityId ?? f.squarePaymentId ?? f.reference ?? "unknown"}`;
    try {
      const inserted = await db
        .insert(schema.reconciliationFindings)
        .values({
          runId,
          kind: f.kind,
          severity: f.severity,
          reference: f.reference,
          entityKind: f.entityKind,
          entityId: f.entityId,
          squarePaymentId: f.squarePaymentId,
          squareOrderId: f.squareOrderId,
          squareAmountCents: f.squareAmountCents,
          ledgerAmountCents: f.ledgerAmountCents,
          detail: f.detail,
          status: "open",
          dedupeKey,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted.length > 0) created++;
    } catch {
      /* already open, or a partial DB — either way the report still returns */
    }
  }
  return created;
}

/** Open (unresolved) findings, newest first — for the admin banner. */
export async function openFindings(limit = 50) {
  try {
    await ensurePaymentIntegritySchema();
    const db = getDb();
    const rows = await db.select().from(schema.reconciliationFindings);
    return rows
      .filter((r) => r.status === "open")
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  } catch {
    return [];
  }
}

/** Last completed run — so the admin UI can say when the books were last proven. */
export async function lastReconciliation() {
  try {
    await ensurePaymentIntegritySchema();
    const db = getDb();
    const rows = await db.select().from(schema.reconciliationRuns);
    return rows
      .filter((r) => r.finishedAt != null)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  } catch {
    return undefined;
  }
}

export { OUTSTANDING };
