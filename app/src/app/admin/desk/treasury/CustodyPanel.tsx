"use client";

/**
 * Money we took that the organisation does not have yet.
 *
 * Grouped by who is holding it, because that is the shape of the actual
 * problem: "Rina has three Zelles totalling $420" is a conversation you can
 * have; "there is $420 unreconciled" is not. Clearing takes a deposit
 * reference — a slip number, a batch id, anything traceable — and never
 * changes what the guest owes, because they settled weeks ago.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearCustodyAction } from "../actions";
import { CUSTODY_LABEL, type Custody } from "@/lib/desk/constants";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export type CustodyRow = {
  id: string;
  amountCents: number;
  method: string;
  custody: Custody;
  detail: string;
  conf: string | null;
  registrationId: string;
  takenByEmail: string | null;
  ageDays: number;
};

export type CustodyGroupView = {
  key: string;
  label: string;
  custody: Custody;
  amountCents: number;
  oldestDays: number;
  rows: CustodyRow[];
};

export default function CustodyPanel({ groups, overdueDays }: { groups: CustodyGroupView[]; overdueDays: number }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [depositRef, setDepositRef] = useState("");

  const toggle = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const selectGroup = (g: CustodyGroupView) =>
    setSelected((prev) => {
      const n = new Set(prev);
      const all = g.rows.every((r) => n.has(r.id));
      for (const r of g.rows) {
        if (all) n.delete(r.id);
        else n.add(r.id);
      }
      return n;
    });

  const total = groups
    .flatMap((g) => g.rows)
    .filter((r) => selected.has(r.id))
    .reduce((s, r) => s + r.amountCents, 0);

  if (groups.length === 0)
    return (
      <p className="desk-note">
        Everything the desk took has reached Pragati’s account. Nothing to chase.
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      {selected.size > 0 && (
        <div className="desk-shift">
          <span>
            <b>
              {selected.size} payment{selected.size === 1 ? "" : "s"} · {money(total)}
            </b>
          </span>
          <label className="desk-field">
            Bank slip or reference
            <input
              value={depositRef}
              onChange={(e) => setDepositRef(e.target.value)}
              placeholder="Deposit slip number"
              style={{ width: 200 }}
            />
          </label>
          <button
            className="btn-primary"
            disabled={busy}
            onClick={() =>
              start(async () => {
                setError("");
                setOk("");
                const res = await clearCustodyAction([...selected], depositRef);
                if (!res.ok) setError(res.error);
                else {
                  setOk(res.message ?? "Cleared ✓");
                  setSelected(new Set());
                  setDepositRef("");
                  router.refresh();
                }
              })
            }
          >
            {busy ? "Saving…" : "✓ This has been banked"}
          </button>
        </div>
      )}

      {groups.map((g) => (
        <div key={g.key}>
          <div className="flex flex-wrap items-baseline gap-3 mb-2">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">{g.label}</h2>
            <span className="desk-chip chip-warn">{CUSTODY_LABEL[g.custody]}</span>
            <span className="money">{money(g.amountCents)}</span>
            {g.oldestDays >= overdueDays && (
              <span className="desk-chip chip-stop">out for {g.oldestDays} days — chase this</span>
            )}
            <button className="text-xs underline underline-offset-4" onClick={() => selectGroup(g)}>
              tick all of these
            </button>
          </div>
          <div className="festive-card overflow-hidden">
            {g.rows.map((r) => (
              <div key={r.id} className="desk-row">
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label="Select payment" />
                <span className="money">{money(r.amountCents)}</span>
                <span className="grow">
                  <strong className="capitalize">{r.method}</strong>
                  {r.detail ? ` · ${r.detail}` : ""}
                  {r.takenByEmail && <span className="desk-note"> · taken by {r.takenByEmail}</span>}
                </span>
                <span className="desk-note">{r.ageDays} days ago</span>
                <a className="text-xs underline underline-offset-4" href={`/admin/desk/o/${r.registrationId}`}>
                  {r.conf ?? "order"}
                </a>
              </div>
            ))}
          </div>
        </div>
      ))}

      {error && <p className="desk-error">{error}</p>}
      {ok && <p className="desk-ok">{ok}</p>}
    </div>
  );
}
