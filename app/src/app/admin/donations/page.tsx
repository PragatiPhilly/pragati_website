import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { formatCents } from "@/lib/pricing";
import StatusBadge from "@/components/admin/StatusBadge";

export const dynamic = "force-dynamic";

export default async function AdminDonationsPage() {
  const db = getDb();
  const dons = await db.select().from(schema.donations).orderBy(desc(schema.donations.createdAt)).limit(200);

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-6">Donations</h1>
      <div className="festive-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
              <th className="px-4 py-3">Conf #</th>
              <th className="px-4 py-3">Donor</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Honoree</th>
              <th className="px-4 py-3">Anon</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {dons.map((d) => (
              <tr key={d.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="px-4 py-3 font-mono text-xs">{d.confirmationNumber}</td>
                <td className="px-4 py-3">
                  {d.donorName}
                  <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>{d.donorEmail}</span>
                </td>
                <td className="px-4 py-3 font-semibold">{formatCents(d.amountCents)}</td>
                <td className="px-4 py-3">
                  {d.inHonorOrMemory !== "none" ? `${d.inHonorOrMemory === "in_memory_of" ? "In memory of" : "In honor of"} ${d.honoreeName}` : "—"}
                </td>
                <td className="px-4 py-3">{d.isAnonymous ? "✓" : "—"}</td>
                <td className="px-4 py-3">{d.paymentMethod}</td>
                <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--ink-soft)" }}>
                  {d.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </td>
              </tr>
            ))}
            {dons.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--ink-soft)" }}>No donations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
