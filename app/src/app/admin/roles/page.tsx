import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import RoleManager from "./RoleManager";

export const dynamic = "force-dynamic";

export default async function RolesPage() {
  const session = await getSession();
  if (session?.role !== "super_admin") {
    return (
      <p className="rounded-xl px-5 py-4 text-sm font-medium max-w-lg" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
        🔒 Role management is for super admins only.
      </p>
    );
  }

  const db = getDb();
  const users = await db.select().from(schema.users).orderBy(desc(schema.users.createdAt));
  const members = await db.select().from(schema.members);
  const supersCount = users.filter((u) => u.role === "super_admin" && !u.deletedAt).length;

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Roles &amp; access</h1>
      <p className="text-sm mb-8" style={{ color: "var(--ink-soft)" }}>
        <strong>Super admins</strong> manage roles + everything · <strong>Admins</strong> everything except this page ·{" "}
        <strong>Volunteers</strong> check-in desk only · <strong>Members</strong> no admin access.
        Role changes are audit-logged; super-admin changes also email an alert.
      </p>
      <RoleManager
        meId={session.userId}
        supersCount={supersCount}
        users={users
          .filter((u) => !u.deletedAt)
          .map((u) => {
            const m = members.find((mm) => mm.userId === u.id);
            return {
              id: u.id,
              email: u.email,
              role: u.role,
              name: m ? `${m.primaryFirstName} ${m.primaryLastName}` : null,
              lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }) : "never",
            };
          })}
      />
    </div>
  );
}
