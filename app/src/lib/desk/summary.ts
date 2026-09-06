/**
 * What an order actually owes — computed, never stored.
 *
 * Storing a balance is how balances go wrong: two writers, one forgotten
 * update, and the number on the screen stops being the number in the ledger.
 * Every desk screen, every server action and every test calls this one
 * function, so they cannot disagree with each other.
 *
 * The invariant, asserted in tests after every action:
 *
 *     due = listPrice + donation − adjusted
 *     due = collected + pending + balance
 *
 * `registrations.total_cents` is kept equal to `due` so the rest of the admin
 * (dashboard, exports, backups) reads the same figure without knowing the desk
 * exists.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { OPEN_CUSTODY, type Custody, type TenderMethod } from "@/lib/desk/constants";

export type Tender = typeof schema.payments.$inferSelect;
export type Adjustment = typeof schema.deskAdjustments.$inferSelect;
export type Ticket = typeof schema.tickets.$inferSelect;
export type Registration = typeof schema.registrations.$inferSelect;

export type DeskOrderSummary = {
  reg: Registration;
  tickets: Ticket[];
  tenders: Tender[];
  adjustments: Adjustment[];
  /** Σ list price of the passes issued. */
  listPriceCents: number;
  donationCents: number;
  /** Σ adjustments — positive reduces what the guest owes (a surcharge is negative). */
  adjustedCents: number;
  /** What the guest owes in total. */
  dueCents: number;
  /** Σ tenders the guest has actually settled. */
  collectedCents: number;
  /** Σ tenders taken but not yet confirmed (a card link not yet paid). */
  pendingCents: number;
  /** What is still owed. Negative means they overpaid. */
  balanceCents: number;
  /** Card surcharges collected on top — never part of `due`. */
  feeCents: number;
  /** Settled money that has NOT reached the org account. The second axis. */
  custodyOpenCents: number;
  custodyBreakdown: { custody: Custody; amountCents: number; n: number }[];
  /** True when the guest is square with us and can be closed out. */
  settled: boolean;
};

/** Tender rows that count as money the guest has handed over. */
const SETTLED_TENDER = ["paid"];
/** Tender rows we are still waiting on (a Square link that has not been paid). */
const PENDING_TENDER = ["pending", "pending_verification"];

export async function loadTenders(registrationId: string): Promise<Tender[]> {
  const db = getDb();
  return await db
    .select()
    .from(schema.payments)
    .where(and(eq(schema.payments.entityId, registrationId), eq(schema.payments.source, "desk")))
    .orderBy(schema.payments.tenderSeq);
}

export async function deskOrderSummary(registrationId: string): Promise<DeskOrderSummary | null> {
  await ensureDeskSchema();
  const db = getDb();
  const [reg] = await db.select().from(schema.registrations).where(eq(schema.registrations.id, registrationId));
  if (!reg) return null;

  const tickets = await db.select().from(schema.tickets).where(eq(schema.tickets.registrationId, registrationId));
  const tenders = await loadTenders(registrationId);
  const adjustments = await db
    .select()
    .from(schema.deskAdjustments)
    .where(eq(schema.deskAdjustments.registrationId, registrationId));

  const listPriceCents = tickets.reduce((s, t) => s + (t.priceCents ?? 0), 0);
  const donationCents = reg.donationCents ?? 0;
  const adjustedCents = adjustments.filter((a) => !a.voidedAt).reduce((s, a) => s + a.amountCents, 0);
  // A comp cannot make the organisation owe the guest money.
  const dueCents = Math.max(0, listPriceCents + donationCents - adjustedCents);

  const live = tenders.filter((t) => !t.reversedAt);
  const collectedCents = live.filter((t) => SETTLED_TENDER.includes(t.status)).reduce((s, t) => s + t.amountCents, 0);
  const pendingCents = live.filter((t) => PENDING_TENDER.includes(t.status)).reduce((s, t) => s + t.amountCents, 0);
  const feeCents = live
    .filter((t) => SETTLED_TENDER.includes(t.status))
    .reduce((s, t) => s + (t.feeCents ?? 0), 0);

  const balanceCents = dueCents - collectedCents - pendingCents;

  const openCustody = live.filter(
    (t) => t.status === "paid" && OPEN_CUSTODY.includes((t.custody ?? "org_account") as Custody)
  );
  const custodyOpenCents = openCustody.reduce((s, t) => s + t.amountCents, 0);
  const byCustody = new Map<Custody, { amountCents: number; n: number }>();
  for (const t of openCustody) {
    const key = (t.custody ?? "org_account") as Custody;
    const cur = byCustody.get(key) ?? { amountCents: 0, n: 0 };
    byCustody.set(key, { amountCents: cur.amountCents + t.amountCents, n: cur.n + 1 });
  }

  return {
    reg,
    tickets,
    tenders,
    adjustments,
    listPriceCents,
    donationCents,
    adjustedCents,
    dueCents,
    collectedCents,
    pendingCents,
    balanceCents,
    feeCents,
    custodyOpenCents,
    custodyBreakdown: [...byCustody.entries()].map(([custody, v]) => ({ custody, ...v })),
    settled: balanceCents <= 0,
  };
}

/**
 * The arithmetic that must hold after EVERY desk action, including a void, a
 * bounced cheque and a partial refund. Exported so tests can assert it and the
 * order screen can shout rather than quietly show a wrong number.
 */
export function checkInvariant(s: DeskOrderSummary): { ok: true } | { ok: false; why: string } {
  const lhs = s.listPriceCents + s.donationCents - s.adjustedCents;
  const due = Math.max(0, lhs);
  if (s.dueCents !== due) return { ok: false, why: `due ${s.dueCents} ≠ listPrice+donation−adjusted ${due}` };
  const rhs = s.collectedCents + s.pendingCents + s.balanceCents;
  if (s.dueCents !== rhs)
    return { ok: false, why: `due ${s.dueCents} ≠ collected+pending+balance ${rhs}` };
  return { ok: true };
}

/** The single method to show on the Registrations list: one tender's, or "split". */
export function dominantMethod(tenders: Tender[]): string {
  const live = tenders.filter((t) => !t.reversedAt && t.status !== "cancelled");
  const methods = [...new Set(live.map((t) => t.method))];
  if (methods.length === 0) return "offline";
  if (methods.length === 1) return methods[0];
  return "split";
}

/** Money the desk has taken that is not in the org account, across all orders. */
export async function custodyQueue(): Promise<Tender[]> {
  await ensureDeskSchema();
  const db = getDb();
  try {
    return await db
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.source, "desk"),
          eq(schema.payments.status, "paid"),
          inArray(schema.payments.custody, OPEN_CUSTODY as unknown as string[])
        )
      )
      .orderBy(schema.payments.createdAt);
  } catch {
    return [];
  }
}

export function tenderMethodOf(t: Tender): TenderMethod {
  const m = t.method as TenderMethod;
  return (["cash", "check", "zelle", "square", "comped"] as TenderMethod[]).includes(m) ? m : "cash";
}
