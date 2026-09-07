/**
 * Section-level access control for the admin portal.
 *
 * Super admins configure which admin sections the `admin` and `volunteer`
 * roles can open (Admin → Roles & access). Stored in system_config under
 * `role_access` — editable live, no redeploy.
 *
 * Safety rails:
 *  - super_admin always sees everything and is not configurable
 *  - LOCKED sections (Roles, Audit log, Settings) are super-admin-only and
 *    can never be granted — so an admin can't be given the power to widen
 *    their own access
 *  - the matrix controls which pages a role can OPEN; destructive actions
 *    keep their own role checks on top (e.g. volunteers can scan tickets,
 *    but verifying payments stays admin-and-up even if they can see a page)
 */
import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { getConfig } from "@/lib/system-config";

export * from "@/lib/auth/sections";
import { SECTIONS, type SectionKey } from "@/lib/auth/sections";

/** Never grantable — super admins only, regardless of the matrix. */
export const LOCKED_SECTIONS: SectionKey[] = ["roles", "audit", "settings", "email_preview", "projections"];

/** What the matrix can hand out. */
export const CONFIGURABLE_SECTIONS = SECTIONS.filter((s) => !LOCKED_SECTIONS.includes(s.key));

export type RoleAccess = { admin: SectionKey[]; volunteer: SectionKey[] };

export const DEFAULT_ROLE_ACCESS: RoleAccess = {
  admin: CONFIGURABLE_SECTIONS.map((s) => s.key), // admins: everything grantable
  // Volunteers run the door: they scan, and they take walk-ins. Every money
  // action inside the desk carries its own role check on top (comps, voids and
  // custody clearing are not theirs) — see lib/desk/guards.ts.
  volunteer: ["checkin", "desk"],
};

/** Current matrix (config merged over defaults, locked sections stripped). */
export async function getRoleAccess(): Promise<RoleAccess> {
  const raw = await getConfig<RoleAccess | undefined>("role_access");
  const clean = (list: unknown, fallback: SectionKey[]): SectionKey[] => {
    if (!Array.isArray(list)) return fallback;
    const valid = CONFIGURABLE_SECTIONS.map((s) => s.key);
    return list.filter((k): k is SectionKey => valid.includes(k as SectionKey));
  };
  return {
    admin: clean(raw?.admin, DEFAULT_ROLE_ACCESS.admin),
    volunteer: clean(raw?.volunteer, DEFAULT_ROLE_ACCESS.volunteer),
  };
}

/** Sections a given role may open (supers get all). */
export async function sectionsForRole(role: string): Promise<SectionKey[]> {
  if (role === "super_admin") return SECTIONS.map((s) => s.key);
  if (role !== "admin" && role !== "volunteer") return [];
  const access = await getRoleAccess();
  return access[role];
}

/**
 * Page guard. Call at the top of every admin page:
 *   const session = await requireSectionAccess("kitchen");
 * Redirects: signed-out → login; no access → their first allowed section
 * (or home if they have none).
 */
export async function requireSectionAccess(section: SectionKey): Promise<SessionUser> {
  const s = await getSession();
  const target = SECTIONS.find((x) => x.key === section);
  if (!s) redirect(`/login?next=${encodeURIComponent(target?.href ?? "/admin")}`);
  if (s.role === "super_admin") return s;
  if (!["admin", "volunteer"].includes(s.role)) redirect("/");

  const allowed = await sectionsForRole(s.role);
  if (!allowed.includes(section) || LOCKED_SECTIONS.includes(section)) {
    const first = SECTIONS.find((x) => allowed.includes(x.key));
    redirect(first ? first.href : "/");
  }
  return s;
}
