/**
 * The money ledger — every dollar in or out goes through here.
 *
 * WHY THIS EXISTS: payment state used to live in three places with three
 * different vocabularies (registrations.status = "paid", donations.status =
 * "paid", members.membership_status = "active"), and standalone membership dues
 * were never recorded as money at all — the only trace of a card dues payment
 * was a jsonb blob in the audit log. That made the dashboard's totals
 * unreconcilable and the Members page silently disagree with the Registrations
 * page.
 *
 * The owning tables still drive their own lifecycles (a registration's status
 * controls ticketing; a member's status controls portal access). This ledger
 * answers every *financial* question, and it's the only thing the dashboard and
 * the Payments log read.
 *
 * A checkout that buys tickets + adds a donation + joins as a member writes
 * THREE rows sharing a `groupId`, so each revenue stream sums on its own
 * instead of being flattened into registrations.total_cents.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensurePaymentsTable } from "@/lib/ledger-ensure";

export type PaymentKind = "registration" | "donation" | "membership";
export type PaymentMethod = "square" | "zelle" | "offline" | "comped";
export type PaymentStatus = "pending" | "pending_verification" | "paid" | "cancelled" | "refunded";

/** Statuses that represent money we actually have. */
export const SETTLED: PaymentStatus[] = ["paid"];
/** Statuses that represent money we're still waiting on. */
export const OUTSTANDING: PaymentStatus[] = ["pending", "pending_verification"];

export type NewPayment = {
  kind: PaymentKind;
  entityId: string;
  groupId?: string | null;
  memberId?: string | null;
  payerName: string;
  payerEmail: string;
  amountCents: number;
  feeCents?: number;
  method: PaymentMethod;
  status?: PaymentStatus;
  squareOrderId?: string | null;
  squarePaymentId?: string | null;
  reference?: string | null;
  verifiedBy?: string | null;
  source?: string;
  note?: string | null;
  /**
   * Write the row even though the amount is 0. Normal checkouts skip zero-value
   * components so the log isn't littered with $0 entries, but an unattributed
   * Square payment has no known amount yet and MUST still be recorded.
   */
  keepZero?: boolean;
};

/** Map an owning table's payment method to a ledger method. */
export function toLedgerMethod(m: string | null | undefined): PaymentMethod {
  return m === "square" || m === "zelle" || m === "offline" || m === "comped" ? m : "offline";
}

/**
 * The ledger status a freshly-created charge should start in. Zelle needs a
 * human to eyeball the bank feed, so it's distinguishable from a card payment
 * we're merely waiting on.
 */
export function openingStatus(method: PaymentMethod): PaymentStatus {
  return method === "zelle" ? "pending_verification" : method === "comped" ? "paid" : "pending";
}

/**
 * Record one or more intended payments (usually `pending`). Zero-amount
 * components are skipped so we don't litter the log with $0 rows.
 * Best-effort: the ledger must never break a checkout that otherwise succeeded.
 */
export async function openPayments(rows: NewPayment[]): Promise<void> {
  const real = rows.filter((r) => r.keepZero || (r.amountCents ?? 0) > 0 || (r.feeCents ?? 0) > 0);
  if (real.length === 0) return;
  try {
    await ensurePaymentsTable();
    const db = getDb();
    const now = new Date();
    await db.insert(schema.payments).values(
      real.map((r) => {
        const status = r.status ?? openingStatus(r.method);
        return {
          kind: r.kind,
          entityId: r.entityId,
          groupId: r.groupId ?? r.entityId,
          memberId: r.memberId ?? null,
          payerName: r.payerName,
          payerEmail: r.payerEmail.toLowerCase(),
          amountCents: Math.round(r.amountCents),
          feeCents: Math.round(r.feeCents ?? 0),
          method: r.method,
          status,
          squareOrderId: r.squareOrderId ?? null,
          squarePaymentId: r.squarePaymentId ?? null,
          reference: r.reference ?? null,
          verifiedBy: r.verifiedBy ?? null,
          verifiedAt: r.verifiedBy ? now : null,
          paidAt: status === "paid" ? now : null,
          source: r.source ?? "app",
          note: r.note ?? null,
        };
      })
    );
  } catch {
    /* never block the payment path on bookkeeping */
  }
}

/** Attach a Square order id to every open row of an entity (set after the link is created). */
export async function attachSquareOrder(kind: PaymentKind, entityId: string, squareOrderId: string): Promise<void> {
  try {
    await ensurePaymentsTable();
    const db = getDb();
    await db
      .update(schema.payments)
      .set({ squareOrderId, updatedAt: new Date() })
      .where(and(eq(schema.payments.kind, kind), eq(schema.payments.entityId, entityId), inArray(schema.payments.status, OUTSTANDING)));
  } catch {
    /* best-effort */
  }
}

/**
 * Money received. Settles every outstanding row for the entity — including the
 * sibling donation / membership components of the same checkout, which share the
 * entity id of the registration they were bought with.
 * Idempotent: rows already `paid` are left alone.
 */
export async function settlePayments(
  kind: PaymentKind,
  entityId: string,
  via: { method?: PaymentMethod; squarePaymentId?: string | null; verifiedBy?: string | null; reference?: string | null } = {}
): Promise<void> {
  try {
    await ensurePaymentsTable();
    const db = getDb();
    const now = new Date();
    const open = await db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.entityId, entityId), inArray(schema.payments.status, OUTSTANDING)));
    if (open.length === 0) return;
    await db
      .update(schema.payments)
      .set({
        status: "paid",
        paidAt: now,
        method: via.method ?? sql`${schema.payments.method}`,
        squarePaymentId: via.squarePaymentId ?? sql`${schema.payments.squarePaymentId}`,
        verifiedBy: via.verifiedBy ?? sql`${schema.payments.verifiedBy}`,
        verifiedAt: via.verifiedBy ? now : sql`${schema.payments.verifiedAt}`,
        reference: via.reference ?? sql`${schema.payments.reference}`,
        updatedAt: now,
      })
      .where(and(eq(schema.payments.entityId, entityId), inArray(schema.payments.status, OUTSTANDING)));
  } catch {
    /* best-effort */
  }
}

/**
 * Backfill the member link on rows written before we knew who the member was —
 * a guest checkout that included membership dues only becomes a member once the
 * payment lands and enrollment runs.
 */
export async function linkPaymentsToMember(entityId: string, memberId: string): Promise<void> {
  try {
    await ensurePaymentsTable();
    const db = getDb();
    await db
      .update(schema.payments)
      .set({ memberId, updatedAt: new Date() })
      .where(eq(schema.payments.entityId, entityId));
  } catch {
    /* best-effort */
  }
}

/** Money that never arrived (swept reservation, admin cancel). Paid rows are never voided here. */
export async function voidPayments(entityId: string, note?: string): Promise<void> {
  try {
    await ensurePaymentsTable();
    const db = getDb();
    await db
      .update(schema.payments)
      .set({ status: "cancelled", cancelledAt: new Date(), note: note ?? sql`${schema.payments.note}`, updatedAt: new Date() })
      .where(and(eq(schema.payments.entityId, entityId), inArray(schema.payments.status, OUTSTANDING)));
  } catch {
    /* best-effort */
  }
}

/**
 * Read the ledger without ever throwing. Admin pages render money alongside
 * other data, and a brand-new database (or a transient hiccup while the table is
 * being created) must degrade to "no payments yet" rather than 500 the page.
 */
export async function listPayments(filter?: { kind?: PaymentKind; status?: PaymentStatus }): Promise<(typeof schema.payments.$inferSelect)[]> {
  try {
    await ensurePaymentsTable();
    const db = getDb();
    const where = [
      filter?.kind ? eq(schema.payments.kind, filter.kind) : undefined,
      filter?.status ? eq(schema.payments.status, filter.status) : undefined,
    ].filter(Boolean);
    const q = db.select().from(schema.payments);
    const rows = where.length > 0 ? await q.where(and(...where)) : await q;
    return rows;
  } catch {
    return [];
  }
}

export type MoneyTotals = {
  registration: { collected: number; outstanding: number; count: number };
  donation: { collected: number; outstanding: number; count: number };
  membership: { collected: number; outstanding: number; count: number };
  fees: number;
  totalCollected: number;
  totalOutstanding: number;
};

const empty = () => ({ collected: 0, outstanding: 0, count: 0 });

/**
 * Everything the dashboard's money cards need, in one pass over the ledger.
 * `collected` counts only `paid`; `outstanding` counts pending + awaiting Zelle
 * verification. Cancelled and refunded rows are excluded from both.
 */
export async function moneyTotals(): Promise<MoneyTotals> {
  const out: MoneyTotals = {
    registration: empty(),
    donation: empty(),
    membership: empty(),
    fees: 0,
    totalCollected: 0,
    totalOutstanding: 0,
  };
  try {
    await ensurePaymentsTable();
    const db = getDb();
    const rows = await db
      .select({
        kind: schema.payments.kind,
        status: schema.payments.status,
        amount: sql<number>`coalesce(sum(${schema.payments.amountCents}),0)`,
        fees: sql<number>`coalesce(sum(${schema.payments.feeCents}),0)`,
        n: sql<number>`count(*)`,
      })
      .from(schema.payments)
      .where(inArray(schema.payments.status, [...SETTLED, ...OUTSTANDING]))
      .groupBy(schema.payments.kind, schema.payments.status);

    for (const r of rows) {
      const bucket = out[r.kind as PaymentKind];
      if (!bucket) continue;
      const amount = Number(r.amount) || 0;
      if (r.status === "paid") {
        bucket.collected += amount;
        bucket.count += Number(r.n) || 0;
        out.totalCollected += amount;
        out.fees += Number(r.fees) || 0;
      } else {
        bucket.outstanding += amount;
        out.totalOutstanding += amount;
      }
    }
  } catch {
    /* a dashboard card is not worth a 500 */
  }
  return out;
}
