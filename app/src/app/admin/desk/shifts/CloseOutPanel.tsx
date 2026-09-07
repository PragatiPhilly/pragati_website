"use client";

/**
 * Close-out.
 *
 * Expected = float + cash taken − drops. Counted is typed in by whoever is
 * holding the box. A variance is never refused, only recorded — and never
 * without a note, because "$15 short" with no explanation is exactly the thing
 * that becomes an accusation three weeks later.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeShiftAction } from "../actions";
import { parseAmountToCents } from "@/lib/desk/constants";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function CloseOutPanel({
  shiftId,
  station,
  expectedCashCents,
  openOrders,
}: {
  shiftId: string;
  station: string;
  expectedCashCents: number;
  openOrders: { id: string; conf: string; buyerName: string; balanceCents: number }[];
}) {
  const router = useRouter();
  // Deliberately EMPTY. Pre-filling the expected figure turned a count into a
  // rubber stamp: the screen already said "that matches exactly" before anyone
  // had touched the money, and a genuine shortfall would be signed off by a
  // tired volunteer tapping the only button on screen. The number has to come
  // from the cash, not from us.
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, start] = useTransition();

  const countedCents = parseAmountToCents(counted) ?? 0;
  const hasCount = counted.trim() !== "" && parseAmountToCents(counted) !== null;
  const variance = countedCents - expectedCashCents;

  return (
    <div className="festive-card p-4 flex flex-col gap-3">
      <h3 className="font-[family-name:var(--font-display)] text-lg font-bold">Count the {station} cash box</h3>
      <p className="desk-note" style={{ margin: 0 }}>
        Count what’s actually in the box and type it in. If it doesn’t match, say what you think happened —
        that’s normal at a busy door and it’s far better written down than not.
      </p>

      {openOrders.length > 0 && (
        <div className="desk-error">
          {openOrders.length} booking{openOrders.length === 1 ? " is" : "s are"} still unfinished on this desk:{" "}
          {openOrders.map((o) => (
            <a key={o.id} className="underline mr-2" href={`/admin/desk/o/${o.id}`}>
              {o.conf}
            </a>
          ))}
          <label className="flex items-center gap-2 mt-2 text-xs font-normal">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            I’ve dealt with these — count it anyway
          </label>
        </div>
      )}

      <div className="desk-grid2">
        <div className="desk-field">
          The box should hold
          <div className="amount" style={{ fontSize: 24, fontWeight: 900 }}>
            {money(expectedCashCents)}
          </div>
        </div>
        <label className="desk-field">
          What you actually counted
          <input
            value={counted}
            inputMode="decimal"
            placeholder="Count it first"
            autoFocus
            onChange={(e) => setCounted(e.target.value)}
          />
        </label>
      </div>

      {!hasCount ? (
        <p className="desk-note">Count the notes and coins in the box, then type the total above.</p>
      ) : (
        <p className={variance === 0 ? "desk-ok" : "desk-error"}>
          {variance === 0
            ? "That matches exactly."
            : `${money(Math.abs(variance))} ${variance > 0 ? "more" : "less"} than expected — say what you think happened.`}
        </p>
      )}

      {hasCount && variance !== 0 && (
        <label className="desk-field">
          What do you think happened?
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Gave change from the wrong pile, etc." />
        </label>
      )}

      <button
        className="btn-primary self-start"
        disabled={busy || !hasCount}
        onClick={() =>
          start(async () => {
            setError("");
            setOk("");
            const res = await closeShiftAction({
              shiftId,
              countedCashCents: countedCents,
              varianceNote: note.trim() || undefined,
              force,
            });
            if (!res.ok) setError(res.error);
            else {
              setOk(res.message ?? "Closed ✓");
              router.refresh();
            }
          })
        }
      >
        {busy ? "Saving…" : "Finish and lock this cash box"}
      </button>

      {error && <p className="desk-error">{error}</p>}
      {ok && <p className="desk-ok">{ok}</p>}
    </div>
  );
}
