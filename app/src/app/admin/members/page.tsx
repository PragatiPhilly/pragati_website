import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import StatusBadge from "@/components/admin/StatusBadge";
import MemberActions from "./MemberActions";
import { requireSectionAccess } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  await requireSectionAccess("members");
  const db = getDb();
  const members = await db.select().from(schema.members).orderBy(desc(schema.members.createdAt));
  const users = await db.select().from(schema.users);
  const family = await db.select().from(schema.familyMembers);

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Members</h1>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        One row per family. Activate after verifying dues (Zelle memo "MEM …" in the bank feed).
      </p>
      <div className="festive-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
              <th className="px-4 py-3">Family</th>
              <th className="px-4 py-3">Primary</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Family size</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Since</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const user = users.find((u) => u.id === m.userId);
              const famCount = family.filter((f) => f.memberId === m.id).length + 1;
              return (
                <tr key={m.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-3 font-semibold">{m.familyName}</td>
                  <td className="px-4 py-3">{m.primaryFirstName} {m.primaryLastName}</td>
                  <td className="px-4 py-3" style={{ color: "var(--ink-soft)" }}>{user?.email}</td>
                  <td className="px-4 py-3">{famCount}</td>
                  <td className="px-4 py-3"><StatusBadge status={m.membershipStatus} /></td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--ink-soft)" }}>{m.membershipStartedAt ?? "—"}</td>
                  <td className="px-4 py-3">
                    <MemberActions memberId={m.id} status={m.membershipStatus} />
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--ink-soft)" }}>No members yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
