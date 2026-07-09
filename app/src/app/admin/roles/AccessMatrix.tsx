"use client";

/**
 * Section-access matrix — super admins decide which admin sections the
 * `admin` and `volunteer` roles can open. Locked sections (Roles, Audit,
 * Settings) are shown but not editable: super-admin-only, always.
 */
import { useState, useTransition } from "react";
import { saveRoleAccessAction } from "./actions";
import type { RoleAccess, Section, SectionKey } from "@/lib/auth/access";

export default function AccessMatrix({
  sections,
  locked,
  initial,
}: {
  sections: Section[]; // all sections, nav order
  locked: SectionKey[];
  initial: RoleAccess;
}) {
  const [access, setAccess] = useState<RoleAccess>(initial);
  const [saved, setSaved] = useState(true);
  const [pending, startTransition] = useTransition();

  const toggle = (role: "admin" | "volunteer", key: SectionKey) => {
    setAccess((prev) => {
      const has = prev[role].includes(key);
      return { ...prev, [role]: has ? prev[role].filter((k) => k !== key) : [...prev[role], key] };
    });
    setSaved(false);
  };

  const cell = (role: "admin" | "volunteer", key: SectionKey, isLocked: boolean) => (
    <td className="px-3 py-2 text-center">
      {isLocked ? (
        <span className="opacity-30" title="Super admins only — cannot be granted">🔒</span>
      ) : (
        <input
          type="checkbox"
          className="w-4 h-4 accent-[var(--sindoor)] cursor-pointer"
          checked={access[role].includes(key)}
          onChange={() => toggle(role, key)}
        />
      )}
    </td>
  );

  return (
    <div className="festive-card p-5 mt-8">
      <p className="font-bold mb-1">🗂 Section access by role</p>
      <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
        Choose which admin sections each role can open — applies immediately, no redeploy. Super admins
        always see everything; 🔒 sections stay super-admin-only. Note: this controls what a role can{" "}
        <em>view</em> — sensitive actions (verifying payments, editing events, uploads) additionally
        require the admin role even if a volunteer can open the page.
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm w-full max-w-xl">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
              <th className="px-3 py-2">Section</th>
              <th className="px-3 py-2 text-center">Admin</th>
              <th className="px-3 py-2 text-center">Volunteer</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const isLocked = locked.includes(s.key);
              return (
                <tr key={s.key} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="px-3 py-2 font-medium">
                    <span className="mr-2">{s.icon}</span>
                    {s.label}
                    {isLocked && <span className="ml-2 text-[10px] uppercase tracking-wider opacity-50">super only</span>}
                  </td>
                  {cell("admin", s.key, isLocked)}
                  {cell("volunteer", s.key, isLocked)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button
        className="btn-primary !py-2 !px-6 text-sm mt-4"
        disabled={pending || saved}
        onClick={() =>
          startTransition(async () => {
            await saveRoleAccessAction(access);
            setSaved(true);
          })
        }
      >
        {pending ? "Saving…" : saved ? "✓ Saved" : "Save access matrix"}
      </button>
    </div>
  );
}
