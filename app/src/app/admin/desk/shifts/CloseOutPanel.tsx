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
  const [counted, setCounted] = useState((expectedCashCents / 100).toFixed(2));
  const [note, setNote] = useState("");
  const [force, setForce] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, start] = useTransition();

  const countedCents = parseAmountToCents(counted) ?? 0;
  const variance = countedCents - expectedCashCents;

  return (
    <div className="festive-card p-4 flex flex-col gap-3">
      <h3 className="font-[family-name:var(--font-display)] text-lg font-bold">Close {station}</h3>

      {openOrders.length > 0 && (
        <div className="desk-error">
          {openOrders.length} order{openOrders.length === 1 ? " is" : "s are"} still open on this till:{" "}
          {openOrders.map((o) => (
            <a key={o.id} className="underline mr-2" href={`/admin/desk/o/${o.id}`}>
              {o.conf}
            </a>
          ))}
          <label className="flex items-center gap-2 mt-2 text-xs font-normal">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Close anyway — I have dealt with these
          </label>
        </div>
      )}

      <div className="desk-grid2">
        <div className="desk-field">
          Drawer should hold
          <div className="amount" style={{ fontSize: 24, fontWeight: 900 }}>
            {money(expectedCashCents)}
          </div>
        </div>
        <label className="desk-field">
          Counted
          <input value={counted} inputMode="decimal" onChange={(e) => setCounted(e.target.value)} />
        </label>
      </div>

      <p className={variance === 0 ? "desk-ok" : "desk-error"}>
        {variance === 0
          ? "Balanced."
          : `${variance > 0 ? "Over" : "Short"} by ${money(Math.abs(variance))} — add a note before closing.`}
      </p>

      {variance !== 0 && (
        <label className="desk-field">
          What happened?
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Gave change from the wrong pile, etc." />
        </label>
      )}

      <button
        className="btn-primary self-start"
        disabled={busy}
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
        {busy ? "Closing…" : "Close the till"}
      </button>

      {error && <p className="desk-error">{error}</p>}
      {ok && <p className="desk-ok">{ok}</p>}
    </div>
  );
}
