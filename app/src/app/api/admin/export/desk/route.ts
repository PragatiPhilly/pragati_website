/**
 * The treasurer's export: one CSV per question she actually asks.
 *
 *   ?view=tenders      every payment the desk took — shape, who took it, which
 *                      till, where the money is now, deposit reference
 *   ?view=orders       every desk order — what was owed, collected, adjusted,
 *                      and what is still outstanding
 *   ?view=adjustments  every cent given away, with the reason and the approver
 *   ?view=shifts       tills, floats, expected vs counted, variance and note
 *
 * Deliberately four narrow files rather than one wide one: reconciling a bank
 * deposit and explaining a comp are different jobs, and a spreadsheet that
 * serves both serves neither.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { requireSectionAccess } from "@/lib/auth/access";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { deskOrderSummary } from "@/lib/desk/summary";
import { CUSTODY_LABEL, type Custody } from "@/lib/desk/constants";

const csvCell = (v: unknown): string => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const toCsv = (headers: string[], rows: unknown[][]) =>
  [headers.join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");

const dollars = (c: number | null | undefined) => ((c ?? 0) / 100).toFixed(2);
const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : "");

export async function GET(req: NextRequest) {
  await requireSectionAccess("desk");
  await ensureDeskSchema();
  const db = getDb();
  const view = req.nextUrl.searchParams.get("view") ?? "tenders";

  const users = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users);
  const emailOf = (id: string | null) => users.find((u) => u.id === id)?.email ?? "";

  let csv = "";
  let name = "desk";

  if (view === "orders") {
    name = "desk-orders";
    const regs = await db.select().from(schema.registrations).where(eq(schema.registrations.source, "desk"));
    const rows: unknown[][] = [];
    for (const r of regs) {
      const s = await deskOrderSummary(r.id);
      if (!s) continue;
      rows.push([
        r.confirmationNumber,
        r.buyerName,
        r.buyerEmail,
        r.buyerPhone ?? "",
        r.deskState ?? "",
        r.status,
        s.tickets.length,
        dollars(s.listPriceCents),
        dollars(s.donationCents),
        dollars(s.adjustedCents),
        dollars(s.dueCents),
        dollars(s.collectedCents),
        dollars(s.pendingCents),
        dollars(s.balanceCents),
        dollars(s.custodyOpenCents),
        emailOf(r.createdByUserId),
        r.admittedUnsettledAt ? emailOf(r.admittedUnsettledBy) : "",
        r.voidReason ?? "",
        iso(r.createdAt),
      ]);
    }
    csv = toCsv(
      [
        "confirmation",
        "buyer",
        "email",
        "phone",
        "desk_state",
        "status",
        "passes",
        "list_price",
        "donation",
        "adjusted",
        "due",
        "collected",
        "pending",
        "balance",
        "not_in_org_account",
        "opened_by",
        "admitted_owing_by",
        "void_reason",
        "created_at",
      ],
      rows
    );
  } else if (view === "adjustments") {
    name = "desk-adjustments";
    const adj = await db.select().from(schema.deskAdjustments);
    const regIds = [...new Set(adj.map((a) => a.registrationId))];
    const regs = regIds.length
      ? await db
          .select({ id: schema.registrations.id, conf: schema.registrations.confirmationNumber, buyer: schema.registrations.buyerName })
          .from(schema.registrations)
          .where(inArray(schema.registrations.id, regIds))
      : [];
    csv = toCsv(
      ["confirmation", "buyer", "kind", "amount", "reason", "note", "approved_by", "voided", "created_at"],
      adj.map((a) => {
        const r = regs.find((x) => x.id === a.registrationId);
        return [
          r?.conf ?? "",
          r?.buyer ?? "",
          a.kind,
          dollars(Math.abs(a.amountCents)),
          a.reasonCode,
          a.note ?? "",
          emailOf(a.approvedBy),
          a.voidedAt ? "yes" : "",
          iso(a.createdAt),
        ];
      })
    );
  } else if (view === "shifts") {
    name = "desk-shifts";
    const shifts = await db.select().from(schema.deskShifts);
    csv = toCsv(
      [
        "station",
        "day",
        "status",
        "opened_by",
        "opened_at",
        "float",
        "drops",
        "expected_cash",
        "counted_cash",
        "variance",
        "variance_note",
        "closed_by",
        "closed_at",
      ],
      shifts.map((s) => [
        s.station,
        s.dayKey,
        s.status,
        s.openedByEmail ?? emailOf(s.openedBy),
        iso(s.openedAt),
        dollars(s.openingFloatCents),
        dollars(s.dropsCents),
        dollars(s.expectedCashCents),
        dollars(s.countedCashCents),
        dollars(s.varianceCents),
        s.varianceNote ?? "",
        emailOf(s.closedBy),
        iso(s.closedAt),
      ])
    );
  } else {
    name = "desk-tenders";
    const tenders = await db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.source, "desk")));
    const regIds = [...new Set(tenders.map((t) => t.entityId))];
    const regs = regIds.length
      ? await db
          .select({ id: schema.registrations.id, conf: schema.registrations.confirmationNumber, buyer: schema.registrations.buyerName })
          .from(schema.registrations)
          .where(inArray(schema.registrations.id, regIds))
      : [];
    const shifts = await db.select().from(schema.deskShifts);

    csv = toCsv(
      [
        "confirmation",
        "buyer",
        "seq",
        "method",
        "amount",
        "fee",
        "status",
        "custody",
        "detail",
        "taken_by",
        "till",
        "deposit_ref",
        "cleared_by",
        "cleared_at",
        "reversed_at",
        "reversal_reason",
        "taken_at",
      ],
      tenders.map((t) => {
        const r = regs.find((x) => x.id === t.entityId);
        const inst = (t.instrument ?? {}) as Record<string, unknown>;
        const detail =
          t.method === "check"
            ? `cheque ${inst.checkNumber ?? ""} ${inst.bank ?? ""} ${inst.checkDate ?? ""}`.trim()
            : t.method === "zelle"
              ? typeof inst.sentTo === "object"
                ? `to ${(inst.sentTo as { displayName: string }).displayName}; from ${inst.senderHandle ?? "?"}`
                : "to the org account"
              : t.method === "cash"
                ? `change ${dollars(Number(inst.changeGivenCents ?? 0))}`
                : (t.squarePaymentId ?? "");
        return [
          r?.conf ?? "",
          r?.buyer ?? "",
          t.tenderSeq ?? "",
          t.method,
          dollars(t.amountCents),
          dollars(t.feeCents),
          t.status,
          t.custody ? CUSTODY_LABEL[t.custody as Custody] : "",
          detail,
          emailOf(t.collectedBy),
          shifts.find((s) => s.id === t.shiftId)?.station ?? "",
          t.depositRef ?? "",
          emailOf(t.custodyClearedBy),
          iso(t.custodyClearedAt),
          iso(t.reversedAt),
          t.reversalReason ?? "",
          iso(t.createdAt),
        ];
      })
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
