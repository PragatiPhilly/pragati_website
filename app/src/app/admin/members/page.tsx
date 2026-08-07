import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import StatusBadge from "@/components/admin/StatusBadge";
import MemberActions from "./MemberActions";
import { requireSectionAccess } from "@/lib/auth/access";
import { getConfig } from "@/lib/system-config";
import { formatCents } from "@/lib/pricing";
import { listPayments } from "@/lib/ledger";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<string, string> = {
  square: "card",
  zelle: "Zelle",
  offline: "cash/cheque",
  comped: "comped",
};

export default async function AdminMembersPage() {
  await requireSectionAccess("members");
  const db = getDb();
  const members = await db.select().from(schema.members).orderBy(desc(schema.members.createdAt));
  const users = await db.select().from(schema.users);
  const family = await db.select().from(schema.familyMembers);
  const duesPayments = await listPayments({ kind: "membership" });
  const duesCents = Number(await getConfig<number>("membership_annual_price_cents"));

  const collected = duesPayments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.amountCents, 0);
  const outstanding = duesPayments
    .filter((p) => p.status === "pending" || p.status === "pending_verification")
    .reduce((s, p) => s + p.amountCents, 0);

  const activeCount = members.filter((m) => m.membershipStatus === "active").length;
  const awaitingCount = members.filter((m) => m.membershipStatus === "pending_payment").length;
  const inactiveCount = members.filter((m) => m.membershipStatus === "inactive").length;

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Members</h1>
      <p className="text-sm mb-5" style={{ color: "var(--ink-soft)" }}>
        One row per family. Activating records the dues payment, so every active membership has money behind it —
        see the <Link href="/admin/payments" className="underline">Payments log</Link> for the full trail.
      </p>

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <div className="festive-card p-4">
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Dues collected</p>
          <p className="font-[family-name:var(--font-display)] text-2xl font-black">{formatCents(collected)}</p>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>from {activeCount} active {activeCount === 1 ? "family" : "families"}</p>
        </div>
        <div className="festive-card p-4">
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Awaiting dues</p>
          <p className="font-[family-name:var(--font-display)] text-2xl font-black">{formatCents(outstanding)}</p>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>{awaitingCount} {awaitingCount === 1 ? "family has" : "families have"} not paid yet</p>
        </div>
        <div className="festive-card p-4">
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>Roster</p>
          <p className="font-[family-name:var(--font-display)] text-2xl font-black">{members.length}</p>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            {activeCount} active · {awaitingCount} awaiting · {inactiveCount} inactive
          </p>
        </div>
      </div>

      <div className="festive-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
              <th className="px-4 py-3">Family</th>
              <th className="px-4 py-3">Primary</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Family size</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Dues</th>
              <th className="px-4 py-3">Since</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const user = users.find((u) => u.id === m.userId);
              const famCount = family.filter((f) => f.memberId === m.id).length + 1;
              const mine = duesPayments.filter((p) => p.memberId === m.id || p.entityId === m.id);
              const paid = mine.find((p) => p.status === "paid");
              const pending = mine.find((p) => p.status === "pending" || p.status === "pending_verification");
              return (
                <tr key={m.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-3 font-semibold">{m.familyName}</td>
                  <td className="px-4 py-3">{m.primaryFirstName} {m.primaryLastName}</td>
                  <td className="px-4 py-3" style={{ color: "var(--ink-soft)" }}>{user?.email}</td>
                  <td className="px-4 py-3">{famCount}</td>
                  <td className="px-4 py-3"><StatusBadge status={m.membershipStatus} /></td>
                  <td className="px-4 py-3 text-xs">
                    {paid ? (
                      <span style={{ color: "var(--leaf-deep)" }}>
                        {formatCents(paid.amountCents)}
                        <span style={{ color: "var(--ink-soft)" }}> · {METHOD_LABEL[paid.method] ?? paid.method}</span>
                      </span>
                    ) : pending ? (
                      <span style={{ color: "var(--ink-soft)" }}>
                        {formatCents(pending.amountCents)} awaiting
                      </span>
                    ) : (
                      <span style={{ color: "var(--ink-soft)" }}>—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--ink-soft)" }}>{m.membershipStartedAt ?? "—"}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--ink-soft)" }}>
                    {m.membershipExpiresAt ? new Date(m.membershipExpiresAt).toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <MemberActions
                      memberId={m.id}
                      status={m.membershipStatus}
                      duesCents={duesCents}
                      paidLabel={paid ? `${formatCents(paid.amountCents)} · ${METHOD_LABEL[paid.method] ?? paid.method}` : null}
                    />
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center" style={{ color: "var(--ink-soft)" }}>No members yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
