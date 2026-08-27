import { and, eq } from "drizzle-orm";
import "@/components/admin/adminnav.css";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { SECTIONS, sectionsForRole, groupSections } from "@/lib/auth/access";
import AdminNav, { type NavItem } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

/**
 * Counts worth interrupting somebody for. Deliberately a short list: a badge on
 * every section is the same as a badge on none. Each is a queue with a person
 * waiting at the other end of it.
 *
 * Best-effort — a nav that fails to render is worse than a nav without counts.
 */
async function navBadges(): Promise<Record<string, number>> {
  const db = getDb();
  const out: Record<string, number> = {};
  try {
    const zelle = await db
      .select({ id: schema.registrations.id })
      .from(schema.registrations)
      .where(eq(schema.registrations.status, "pending_zelle_verification"));
    if (zelle.length > 0) out.zelle = zelle.length;
  } catch {
    /* skip */
  }
  try {
    const findings = await db
      .select({ id: schema.reconciliationFindings.id })
      .from(schema.reconciliationFindings)
      .where(and(eq(schema.reconciliationFindings.status, "open")));
    if (findings.length > 0) out.reconciliation = findings.length;
  } catch {
    /* the table may not exist yet on an older database */
  }
  return out;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Nav = the sections this role may open (matrix set in Roles & access;
  // super admins see everything; each page enforces its own access too).
  const allowed = session ? await sectionsForRole(session.role) : [];
  const visible = SECTIONS.filter((s) => allowed.includes(s.key));
  const badges = await navBadges();

  const toItem = (s: (typeof SECTIONS)[number]): NavItem => ({
    key: s.key,
    label: s.label,
    href: s.href,
    icon: s.icon,
    badge: badges[s.key],
  });

  const pinned = visible.filter((s) => !s.group).map(toItem);
  const groups = groupSections(visible).map(({ group, items }) => ({
    key: group.key,
    label: group.label,
    defaultOpen: group.defaultOpen,
    items: items.map(toItem),
  }));

  return (
    <div className="admin-shell" data-admin>
      <AdminNav
        pinned={pinned}
        groups={groups}
        footer={
          <>
            <p className="truncate font-medium">{session?.email}</p>
            <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>
              {session?.role}
            </p>
            <form action={logoutAction}>
              <button className="text-xs underline underline-offset-4 opacity-70 hover:opacity-100">Sign out</button>
            </form>
          </>
        }
      />
      <main className="admin-main">{children}</main>
    </div>
  );
}
