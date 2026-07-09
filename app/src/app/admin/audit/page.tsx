import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const session = await getSession();
  const db = getDb();
  const rows = await db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt)).limit(200);
  const users = await db.select().from(schema.users);
  const who = (id: string | null) => users.find((u) => u.id === id)?.email ?? "system";

  if (session?.role !== "super_admin") {
    return <p style={{ color: "var(--ink-soft)" }}>The audit log is visible to super-admins only.</p>;
  }

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-6">Audit log</h1>
      <div className="festive-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Who</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Changes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t align-top" style={{ borderColor: "var(--line)" }}>
                <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>
                  {r.createdAt.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </td>
                <td className="px-4 py-3">{who(r.userId)}</td>
                <td className="px-4 py-3 font-semibold">{r.action}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {r.entityType}
                  {r.entityId && <span style={{ color: "var(--ink-soft)" }}> {r.entityId.slice(0, 8)}</span>}
                </td>
                <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--ink-soft)" }}>
                  {r.changes ? JSON.stringify(r.changes).slice(0, 120) : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--ink-soft)" }}>Nothing logged yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
