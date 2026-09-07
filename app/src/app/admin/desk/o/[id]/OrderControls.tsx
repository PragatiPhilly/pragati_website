"use client";

/**
 * What can be done to the order as a whole: fill in what we didn't have, comp
 * it, admit them owing, close it, void it.
 *
 * The destructive ones all ask for a reason and none of them delete anything.
 * A voided order keeps its passes, its payments and its timeline, and shows at
 * the gate as "send to desk" — because the thing that actually happened on the
 * night is worth more than a tidy table.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addAdjustmentAction,
  admitWithBalanceAction,
  closeOrderAction,
  fillDetailsAction,
  reopenOrderAction,
  resendTicketsAction,
  voidOrderAction,
} from "../../actions";
import {
  ADJUSTMENT_REASONS,
  VOID_REASONS,
  VOID_REASON_LABEL,
  parseAmountToCents,
  type AdjustmentKind,
  type VoidReason,
} from "@/lib/desk/constants";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function OrderControls({
  registrationId,
  balanceCents,
  pendingCents,
  deskState,
  buyerEmail,
  buyerPhone,
  buyerName,
  isAdmin,
  hasEmail,
}: {
  registrationId: string;
  balanceCents: number;
  /** Money on a card that Square has not confirmed. Zero balance, but not paid. */
  pendingCents: number;
  deskState: string | null;
  buyerEmail: string;
  buyerPhone: string;
  buyerName: string;
  isAdmin: boolean;
  hasEmail: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [panel, setPanel] = useState<"details" | "comp" | "void" | null>(null);

  const [email, setEmail] = useState(buyerEmail);
  const [phone, setPhone] = useState(buyerPhone);
  const [name, setName] = useState(buyerName);

  const [adjKind, setAdjKind] = useState<AdjustmentKind>("comp");
  const [adjAmount, setAdjAmount] = useState((Math.max(0, balanceCents) / 100).toFixed(2));
  const [adjReason, setAdjReason] = useState("volunteer");
  const [adjNote, setAdjNote] = useState("");

  const [voidReason, setVoidReason] = useState<VoidReason>("created_in_error");
  const [voidNote, setVoidNote] = useState("");
  const [reopenWhy, setReopenWhy] = useState("");

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      setError("");
      setOk("");
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That didn't work.");
      else {
        setOk(res.message ?? "Done ✓");
        setPanel(null);
        router.refresh();
      }
    });

  const voided = deskState === "voided";
  const closed = deskState === "closed";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {!voided && !closed && balanceCents > 0 && (
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => act(() => admitWithBalanceAction(registrationId))}
          >
            Let them in, collect later
          </button>
        )}
        {/* A pending card zeroes the balance without the money arriving, so
            "All done" would be a green tick over an unconfirmed payment. The
            booking can still be finished — the card follow-up and the nightly
            reconciliation both stay on it — but the button has to say what it
            is doing. */}
        {!voided && !closed && balanceCents <= 0 && (
          <button
            className={pendingCents > 0 ? "btn-secondary" : "btn-primary"}
            disabled={busy}
            onClick={() => act(() => closeOrderAction(registrationId))}
          >
            {pendingCents > 0 ? "Finish anyway — the card is still unconfirmed" : "✓ All done — finish this booking"}
          </button>
        )}
        <a className="btn-secondary" href={`/admin/desk/o/${registrationId}/stub`} target="_blank" rel="noreferrer">
          🖨 Print their slip
        </a>
        {hasEmail && (
          <button className="btn-secondary" disabled={busy} onClick={() => act(() => resendTicketsAction(registrationId))}>
            ✉ Email their passes
          </button>
        )}
        {!voided && (
          <button className="btn-secondary" onClick={() => setPanel(panel === "details" ? null : "details")}>
            Add their email or phone
          </button>
        )}
        <a className="btn-secondary" href={`/admin/desk/new?parent=${registrationId}`}>
          + Add more people
        </a>
      </div>

      {/* Everything that is rarely right, and never urgent, lives behind one
          click — so the six things a volunteer might do never sit at the same
          weight as the one thing they came here for. */}
      {!voided && (
        <details className="more-actions">
          <summary>Something unusual? Free passes, corrections, cancelling…</summary>
          <div className="action-row">
            {isAdmin && (
              <button className="btn-secondary" onClick={() => setPanel(panel === "comp" ? null : "comp")}>
                Make it free / give a discount
              </button>
            )}
            {!isAdmin && (
              <span className="desk-note self-center">
                Making a pass free needs an admin — ask one to sign in here.
              </span>
            )}
            <button className="btn-secondary" onClick={() => setPanel(panel === "void" ? null : "void")}>
              Cancel this booking
            </button>
          </div>
        </details>
      )}

      {closed && isAdmin && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="desk-field grow">
            Why are you reopening it?
            <input value={reopenWhy} onChange={(e) => setReopenWhy(e.target.value)} />
          </label>
          <button className="btn-secondary" disabled={busy} onClick={() => act(() => reopenOrderAction(registrationId, reopenWhy))}>
            Reopen this booking
          </button>
        </div>
      )}

      {panel === "details" && (
        <div className="festive-card p-4 flex flex-col gap-3">
          <p className="desk-note">
            Add an email and their passes are sent straight away. Never make one up — leaving it blank is fine.
          </p>
          <div className="desk-grid2">
            <label className="desk-field">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="desk-field">
              Email
              <input value={email} inputMode="email" onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label className="desk-field">
              Mobile
              <input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} />
            </label>
          </div>
          <button
            className="btn-primary self-start"
            disabled={busy}
            onClick={() => act(() => fillDetailsAction(registrationId, { buyerEmail: email, buyerPhone: phone, buyerName: name }))}
          >
            Save
          </button>
        </div>
      )}

      {panel === "comp" && (
        <div className="festive-card p-4 flex flex-col gap-3">
          <p className="desk-note">
            The pass still gets issued, so they’re counted at the gate and by the kitchen. The price stays on the
            record with your name next to the reason — nothing is hidden.
          </p>
          <div className="desk-grid2">
            <label className="desk-field">
              What are you doing?
              <select value={adjKind} onChange={(e) => setAdjKind(e.target.value as AdjustmentKind)}>
                <option value="comp">Make it free</option>
                <option value="discount">Give a discount</option>
                <option value="writeoff">Give up on money owed</option>
                <option value="surcharge">Charge them more</option>
              </select>
            </label>
            <label className="desk-field">
              Amount
              <input value={adjAmount} inputMode="decimal" onChange={(e) => setAdjAmount(e.target.value)} />
            </label>
            <label className="desk-field reason-wide">
              Why?
              <select value={adjReason} onChange={(e) => setAdjReason(e.target.value)}>
                {ADJUSTMENT_REASONS.filter((r) => r.kinds.includes(adjKind)).map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="desk-field">
              Anything to add? (optional)
              <input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} />
            </label>
          </div>
          <button
            className="btn-primary self-start"
            disabled={busy}
            onClick={() => {
              const cents = parseAmountToCents(adjAmount);
              if (cents === null || cents === 0) return setError("Type an amount.");
              act(() =>
                addAdjustmentAction({
                  registrationId,
                  kind: adjKind,
                  amountCents: cents,
                  reasonCode: adjReason,
                  note: adjNote,
                })
              );
            }}
          >
            Apply
          </button>
        </div>
      )}

      {panel === "void" && (
        <div className="festive-card p-4 flex flex-col gap-3">
          <p className="desk-note">
            Nothing gets deleted. Their passes stop working at the gate, the places go back on sale, and any money
            already taken is flagged for the treasurer to refund.
          </p>
          <div className="desk-grid2">
            <label className="desk-field">
              Why?
              <select value={voidReason} onChange={(e) => setVoidReason(e.target.value as VoidReason)}>
                {VOID_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {VOID_REASON_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            <label className="desk-field">
              Anything to add? (optional)
              <input value={voidNote} onChange={(e) => setVoidNote(e.target.value)} />
            </label>
          </div>
          <button
            className="btn-secondary self-start"
            disabled={busy}
            onClick={() => act(() => voidOrderAction(registrationId, voidReason, voidNote))}
          >
            Cancel this booking
          </button>
        </div>
      )}

      {error && <p className="desk-error">{error}</p>}
      {ok && <p className="desk-ok">{ok}</p>}
    </div>
  );
}
