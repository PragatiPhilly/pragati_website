"use client";

import { useState, useTransition } from "react";
import { setRoleAction, inviteUserAction, sendResetLinkAction, type Role } from "./actions";

type UserRow = { id: string; email: string; role: string; name: string | null; lastLoginAt: string };

const ROLE_META: Record<string, { label: string; bg: string; fg: string }> = {
  super_admin: { label: "Super admin", bg: "rgba(200,16,46,0.14)", fg: "var(--sindoor)" },
  admin: { label: "Admin", bg: "rgba(232,169,60,0.22)", fg: "var(--terracotta-deep)" },
  volunteer: { label: "Volunteer", bg: "rgba(92,138,58,0.16)", fg: "var(--leaf-deep)" },
  member: { label: "Member", bg: "rgba(0,0,0,0.06)", fg: "var(--ink-soft)" },
};

export default function RoleManager({ users, meId, supersCount }: { users: UserRow[]; meId: string; supersCount: number }) {
  const [note, setNote] = useState<{ msg: string; ok: boolean } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("admin");
  const [pending, startTransition] = useTransition();
  const flash = (msg: string, ok: boolean) => {
    setNote({ msg, ok });
    setTimeout(() => setNote(null), 5000);
  };

  return (
    <div className="grid gap-6">
      {/* invite */}
      <div className="festive-card p-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-1">Invite someone</h2>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          They get an email with a one-time link to set their own password — you never handle it.
        </p>
        <div className="flex gap-3 flex-wrap">
          <input
            className="input flex-1 min-w-56 !py-2.5"
            type="email"
            placeholder="their-email@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <select className="input w-44 !py-2.5" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
            <option value="admin">Admin</option>
            <option value="volunteer">Gate volunteer</option>
            <option value="super_admin">Super admin</option>
            <option value="member">Member</option>
          </select>
          <button
            className="btn-primary !py-2.5 !px-6 text-sm"
            disabled={pending || !inviteEmail.includes("@")}
            onClick={() =>
              startTransition(async () => {
                const res = await inviteUserAction(inviteEmail, inviteRole);
                flash(res.message, res.ok);
                if (res.ok) setInviteEmail("");
              })
            }
          >
            {pending ? "…" : "Send invite ✉"}
          </button>
        </div>
      </div>

      {note && (
        <p
          className="rounded-xl px-4 py-3 text-sm font-semibold"
          style={{ background: note.ok ? "rgba(92,138,58,0.14)" : "var(--accent-soft)", color: note.ok ? "var(--leaf-deep)" : "var(--sindoor)" }}
        >
          {note.msg}
        </p>
      )}

      {/* user list */}
      <div className="festive-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
              <th className="px-4 py-3">Person</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Last sign-in</th>
              <th className="px-4 py-3 text-right">Change role</th>
              <th className="px-4 py-3 text-right">Password</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const meta = ROLE_META[u.role] ?? ROLE_META.member;
              const isMe = u.id === meId;
              const lastSuper = u.role === "super_admin" && supersCount <= 1;
              return (
                <tr key={u.id} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{u.name ?? u.email}</p>
                    {u.name && <p className="text-xs" style={{ color: "var(--ink-soft)" }}>{u.email}</p>}
                    {isMe && <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--terracotta)" }}>you</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-[11px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 whitespace-nowrap" style={{ background: meta.bg, color: meta.fg }}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--ink-soft)" }}>{u.lastLoginAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      {isMe ? (
                        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>ask another super admin</span>
                      ) : lastSuper ? (
                        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>last super admin 🔒</span>
                      ) : (
                        <select
                          className="input !py-1.5 !px-3 text-xs w-40"
                          defaultValue={u.role}
                          disabled={pending}
                          onChange={(e) => {
                            const role = e.target.value as Role;
                            if (!window.confirm(`Change ${u.email} to ${ROLE_META[role].label}?`)) {
                              e.target.value = u.role;
                              return;
                            }
                            startTransition(async () => {
                              const res = await setRoleAction(u.id, role);
                              flash(res.message, res.ok);
                            });
                          }}
                        >
                          <option value="member">Member</option>
                          <option value="volunteer">Volunteer</option>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super admin</option>
                        </select>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <button
                        className="btn-secondary !py-1.5 !px-3 text-xs whitespace-nowrap"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const res = await sendResetLinkAction(u.id);
                            flash(res.message, res.ok);
                          })
                        }
                      >
                        ✉ Send reset link
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
