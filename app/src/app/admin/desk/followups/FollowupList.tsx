"use client";

/**
 * The follow-up queue.
 *
 * Everything the desk couldn't finish on the night, typed and owned. The most
 * common row by far is "no email" — so that row does the useful thing in one
 * step: type the address, and the family's tickets go out and the item closes.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { bulkResolveAction, fillEmailAndSendAction, resolveFollowupAction } from "../actions";
import { FOLLOWUP_LABEL, type FollowupKind } from "@/lib/desk/constants";

export type FollowupRow = {
  id: string;
  kind: FollowupKind;
  detail: string | null;
  createdAt: string;
  registrationId: string | null;
  conf: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  buyerPhone: string | null;
  assignedToEmail: string | null;
  status: string;
};

export default function FollowupList({ rows }: { rows: FollowupRow[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [emailDraft, setEmailDraft] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      setError("");
      setOk("");
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That didn't work.");
      else {
        setOk(res.message ?? "Done ✓");
        router.refresh();
      }
    });

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (rows.length === 0)
    return <p className="desk-note">Nothing outstanding. Every gap the desk opened has been closed.</p>;

  return (
    <div className="flex flex-col gap-3">
      {selected.size > 0 && (
        <div className="desk-shift">
          <span>
            <b>{selected.size} selected</b>
          </span>
          <span className="spacer" />
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => act(async () => {
              const res = await bulkResolveAction([...selected], "Resolved in bulk from the queue");
              setSelected(new Set());
              return res;
            })}
          >
            Mark resolved
          </button>
        </div>
      )}

      <div className="festive-card overflow-hidden">
        {rows.map((f) => (
          <div key={f.id} className="desk-row" style={{ alignItems: "flex-start" }}>
            <input
              type="checkbox"
              checked={selected.has(f.id)}
              onChange={() => toggle(f.id)}
              aria-label={`Select ${FOLLOWUP_LABEL[f.kind]}`}
              style={{ marginTop: 4 }}
            />
            <span className="grow" style={{ minWidth: 220 }}>
              <span className="desk-chip chip-warn">{FOLLOWUP_LABEL[f.kind] ?? f.kind}</span>{" "}
              <strong>{f.buyerName ?? "—"}</strong>{" "}
              <span className="text-xs opacity-60">{f.conf ?? ""}</span>
              {f.detail && <div className="desk-note">{f.detail}</div>}
              {f.assignedToEmail && <div className="desk-note">assigned to {f.assignedToEmail}</div>}
              {f.buyerPhone && <div className="desk-note">☎ {f.buyerPhone}</div>}
            </span>

            {f.kind === "missing_email" && f.registrationId && (
              <span className="flex flex-wrap items-end gap-2">
                <label className="desk-field">
                  Email
                  <input
                    value={emailDraft[f.id] ?? ""}
                    inputMode="email"
                    placeholder="name@example.com"
                    onChange={(e) => setEmailDraft({ ...emailDraft, [f.id]: e.target.value })}
                  />
                </label>
                <button
                  className="btn-primary !py-1.5 !px-3 text-xs"
                  disabled={busy}
                  onClick={() => act(() => fillEmailAndSendAction(f.registrationId!, emailDraft[f.id] ?? ""))}
                >
                  Save &amp; send tickets
                </button>
              </span>
            )}

            <span className="flex flex-wrap items-end gap-2">
              <label className="desk-field">
                Note
                <input
                  value={noteDraft[f.id] ?? ""}
                  onChange={(e) => setNoteDraft({ ...noteDraft, [f.id]: e.target.value })}
                  style={{ width: 160 }}
                />
              </label>
              <button
                className="btn-secondary !py-1.5 !px-3 text-xs"
                disabled={busy}
                onClick={() => act(() => resolveFollowupAction(f.id, noteDraft[f.id] ?? ""))}
              >
                Resolve
              </button>
              <button
                className="text-xs underline underline-offset-4"
                disabled={busy}
                onClick={() => act(() => resolveFollowupAction(f.id, noteDraft[f.id] ?? "", true))}
                title="It will never be supplied — needs a note"
              >
                Waive
              </button>
            </span>

            {f.registrationId && (
              <a className="text-xs underline underline-offset-4" href={`/admin/desk/o/${f.registrationId}`}>
                open
              </a>
            )}
          </div>
        ))}
      </div>

      {error && <p className="desk-error">{error}</p>}
      {ok && <p className="desk-ok">{ok}</p>}
    </div>
  );
}
