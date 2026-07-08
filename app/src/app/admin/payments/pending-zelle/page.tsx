import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { formatCents } from "@/lib/pricing";
import ZelleQueueRow from "./ZelleQueueRow";

export const dynamic = "force-dynamic";

function ago(d: Date | null): string {
  if (!d) return "—";
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default async function PendingZellePage() {
  const db = getDb();
  const regs = await db
    .select()
    .from(schema.registrations)
    .where(eq(schema.registrations.status, "pending_zelle_verification"))
    .orderBy(asc(schema.registrations.createdAt));
  const dons = await db
    .select()
    .from(schema.donations)
    .where(eq(schema.donations.status, "pending_zelle_verification"))
    .orderBy(asc(schema.donations.createdAt));

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Pending Zelle verification</h1>
      <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
        Cross-reference each memo + amount against the bank's Zelle feed, then mark paid. Oldest first.
      </p>

      <h2 className="font-bold mb-3">Ticket registrations ({regs.length})</h2>
      <div className="festive-card overflow-hidden mb-10">
        {regs.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--ink-soft)" }}>
            Queue is clear. 🎉
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
                <th className="px-4 py-3">Memo / Conf #</th>
                <th className="px-4 py-3">Buyer</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">"I've sent it"</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {regs.map((r) => (
                <ZelleQueueRow
                  key={r.id}
                  kind="registration"
                  id={r.id}
                  conf={r.confirmationNumber}
                  who={`${r.buyerName} · ${r.buyerEmail}`}
                  amount={formatCents(r.totalCents)}
                  sentClicked={r.zelleSentClickedAt ? ago(r.zelleSentClickedAt) : "not yet"}
                  created={ago(r.createdAt)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="font-bold mb-3">Donations ({dons.length})</h2>
      <div className="festive-card overflow-hidden">
        {dons.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--ink-soft)" }}>
            No pending donations.
          </p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {dons.map((d) => (
                <ZelleQueueRow
                  key={d.id}
                  kind="donation"
                  id={d.id}
                  conf={d.confirmationNumber}
                  who={`${d.donorName} · ${d.donorEmail}`}
                  amount={formatCents(d.amountCents)}
                  sentClicked="—"
                  created={ago(d.createdAt)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
