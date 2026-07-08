import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { getConfig } from "@/lib/system-config";
import { formatCents } from "@/lib/pricing";
import StatusBadge from "@/components/admin/StatusBadge";
import RowActions from "./RowActions";
import BackupControls from "./BackupControls";

export const dynamic = "force-dynamic";

export default async function AdminRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status, q } = await searchParams;
  const session = await getSession();
  const backupEmail = await getConfig<string>("backup_email");
  const db = getDb();
  let regs = await db
    .select()
    .from(schema.registrations)
    .where(status ? eq(schema.registrations.status, status) : undefined)
    .orderBy(desc(schema.registrations.createdAt))
    .limit(500);
  if (q?.trim()) {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    regs = regs.filter(
      (r) =>
        r.buyerName.toLowerCase().includes(needle) ||
        r.buyerEmail.toLowerCase().includes(needle) ||
        r.confirmationNumber.toLowerCase().includes(needle) ||
        (digits.length >= 4 && (r.buyerPhone ?? "").replace(/\D/g, "").includes(digits))
    );
  }
  regs = regs.slice(0, 200);

  const filters = ["", "paid", "pending_zelle_verification", "pending_payment", "cancelled_no_payment"];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">Registrations</h1>
        <a href="/api/admin/export/registrations" className="btn-secondary !py-2 !px-5 text-sm">
          ⬇ Export CSV
        </a>
      </div>
      <BackupControls isSuper={session?.role === "super_admin"} backupEmail={backupEmail} />
      <form className="flex gap-2 mb-4" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="Search name, email, phone or PRG-…" className="input flex-1 !py-2.5" />
        <button className="btn-secondary !py-2 !px-5 text-sm">Search</button>
      </form>
      <div className="flex gap-2 mb-5 flex-wrap">
        {filters.map((f) => (
          <a key={f} href={f ? `?status=${f}${q ? `&q=${encodeURIComponent(q)}` : ""}` : `?${q ? `q=${encodeURIComponent(q)}` : ""}`} className="choice-chip !py-1.5 !px-4 text-xs" data-selected={(status ?? "") === f}>
            {f === "" ? "All" : f.replaceAll("_", " ")}
          </a>
        ))}
      </div>
      <div className="festive-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
              <th className="px-4 py-3">Conf #</th>
              <th className="px-4 py-3">Buyer</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Member?</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {regs.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="px-4 py-3 font-mono text-xs">{r.confirmationNumber}</td>
                <td className="px-4 py-3">
                  {r.buyerName}
                  <span className="block text-xs" style={{ color: "var(--ink-soft)" }}>{r.buyerEmail}</span>
                </td>
                <td className="px-4 py-3">{r.source === "day_of_kiosk" ? "🚶 day-of" : "web"}</td>
                <td className="px-4 py-3">{r.isMemberPurchase ? "✓" : "—"}</td>
                <td className="px-4 py-3 font-semibold">{formatCents(r.totalCents)}</td>
                <td className="px-4 py-3">{r.paymentMethod}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3 text-xs" style={{ color: "var(--ink-soft)" }}>
                  {r.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </td>
                <td className="px-4 py-3">
                  <RowActions
                    registrationId={r.id}
                    conf={r.confirmationNumber}
                    status={r.status}
                    passesHref={`/lookup?email=${encodeURIComponent(r.buyerEmail)}&conf=${r.confirmationNumber}`}
                  />
                </td>
              </tr>
            ))}
            {regs.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center" style={{ color: "var(--ink-soft)" }}>Nothing here yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
