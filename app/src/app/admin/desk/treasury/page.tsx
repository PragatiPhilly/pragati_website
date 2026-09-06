import Link from "next/link";
import { inArray } from "drizzle-orm";
import "../desk.css";
import { getDb, schema } from "@/db/client";
import { requireSectionAccess } from "@/lib/auth/access";
import { getConfig } from "@/lib/system-config";
import { formatCents } from "@/lib/pricing";
import { ensureDeskSchema } from "@/lib/desk/ensure";
import { custodyGroups } from "@/lib/desk/tenders";
import { adjustmentTotals } from "@/lib/desk/adjustments";
import CustodyPanel, { type CustodyGroupView, type CustodyRow } from "./CustodyPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Desk treasury" };

const days = (d: Date) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);

export default async function TreasuryPage() {
  // Clearing money into the org account is the one desk power a volunteer
  // never has — this page is gated on the desk_money section, not on `desk`.
  await requireSectionAccess("desk_money");
  await ensureDeskSchema();
  const db = getDb();

  const groups = await custodyGroups();
  const overdueDays = Number(await getConfig<number>("desk_custody_overdue_days")) || 7;

  const regIds = [...new Set(groups.flatMap((g) => g.tenders.map((t) => t.entityId)))];
  const regs = regIds.length
    ? await db
        .select({ id: schema.registrations.id, conf: schema.registrations.confirmationNumber })
        .from(schema.registrations)
        .where(inArray(schema.registrations.id, regIds))
    : [];
  const userIds = [...new Set(groups.flatMap((g) => g.tenders.map((t) => t.collectedBy).filter(Boolean) as string[]))];
  const users = userIds.length
    ? await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(inArray(schema.users.id, userIds))
    : [];

  const view: CustodyGroupView[] = groups.map((g) => ({
    key: g.key,
    label: g.label,
    custody: g.custody,
    amountCents: g.amountCents,
    oldestDays: g.oldestAt ? days(g.oldestAt) : 0,
    rows: g.tenders.map((t): CustodyRow => {
      const inst = (t.instrument ?? {}) as Record<string, unknown>;
      const detail =
        t.method === "check"
          ? `cheque no. ${inst.checkNumber ?? "?"}${inst.bank ? ` · ${inst.bank}` : ""}${inst.checkDate ? ` · dated ${inst.checkDate}` : ""}`
          : t.method === "zelle"
            ? typeof inst.sentTo === "object"
              ? `from ${inst.senderHandle ?? "sender unknown"}${inst.senderLast4 ? ` (…${inst.senderLast4})` : ""}`
              : "org account"
            : "cash";
      return {
        id: t.id,
        amountCents: t.amountCents,
        method: t.method,
        custody: g.custody,
        detail,
        conf: regs.find((r) => r.id === t.entityId)?.conf ?? null,
        registrationId: t.entityId,
        takenByEmail: users.find((u) => u.id === t.collectedBy)?.email ?? null,
        ageDays: days(t.createdAt),
      };
    }),
  }));

  const total = view.reduce((s, g) => s + g.amountCents, 0);
  const givenAway = await adjustmentTotals();

  return (
    <div className="desk-shell max-w-4xl">
      <div>
        <Link href="/admin/desk" className="text-xs underline underline-offset-4">
          ← Desk
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Treasury</h1>
        <p className="desk-note">
          Money the desk took that has <strong>not reached the organisation</strong>. These guests are settled — this
          page is not about them, it is about where their money physically is.
        </p>
      </div>

      <div className="desk-balance desk-balance--owed">
        <span>
          <span className="lbl">Not in the org account</span>
          <br />
          <span className="amount">{formatCents(total)}</span>
        </span>
        <span className="desk-note">
          across {view.length} holder{view.length === 1 ? "" : "s"} · anything older than {overdueDays} days is flagged
          to the nightly reconciler
        </span>
      </div>

      <CustodyPanel groups={view} overdueDays={overdueDays} />

      {givenAway.length > 0 && (
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-2">Comped &amp; discounted</h2>
          <div className="festive-card overflow-hidden">
            {givenAway.map((a) => (
              <div key={`${a.kind}:${a.reasonCode}`} className="desk-row">
                <span className="money">{formatCents(Math.abs(a.amountCents))}</span>
                <span className="grow">
                  <strong className="capitalize">{a.kind}</strong> · {a.reasonCode.replaceAll("_", " ")}
                </span>
                <span className="desk-note">
                  {a.n} order{a.n === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
