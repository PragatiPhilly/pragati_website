import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db/client";
import { getSession } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { SECTIONS, sectionsForRole } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // Nav = the sections this role may open (matrix set in Roles & access;
  // super admins see everything; each page enforces its own access too).
  const allowed = session ? await sectionsForRole(session.role) : [];
  const nav = SECTIONS.filter((s) => allowed.includes(s.key));
  const db = getDb();
  const pendingZelle = await db
    .select({ id: schema.registrations.id })
    .from(schema.registrations)
    .where(eq(schema.registrations.status, "pending_zelle_verification"));

  return (
    <div className="min-h-screen flex" data-admin>
      <aside
        className="w-60 shrink-0 border-r flex flex-col sticky top-0 h-screen"
        style={{ borderColor: "var(--line)", background: "var(--card)" }}
      >
        <Link href="/" className="flex items-baseline gap-2 px-5 py-5 border-b" style={{ borderColor: "var(--line)" }}>
          <span className="font-[family-name:var(--font-bangla)] text-xl" style={{ color: "var(--sindoor)" }}>প্রগতি</span>
          <span className="font-[family-name:var(--font-display)] font-bold">Admin</span>
        </Link>
        <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium hover:bg-[var(--accent-soft)] transition-colors"
            >
              <span className="w-5 text-center">{n.icon}</span>
              {n.label}
              {n.href.includes("pending-zelle") && pendingZelle.length > 0 && (
                <span
                  className="ml-auto text-xs font-bold rounded-full px-2 py-0.5"
                  style={{ background: "var(--sindoor)", color: "var(--cream)" }}
                >
                  {pendingZelle.length}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="px-5 py-4 border-t text-sm" style={{ borderColor: "var(--line)" }}>
          <p className="truncate font-medium">{session?.email}</p>
          <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>{session?.role}</p>
          <form action={logoutAction}>
            <button className="text-xs underline underline-offset-4 opacity-70 hover:opacity-100">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 px-8 py-8 max-w-6xl">{children}</main>
    </div>
  );
}
