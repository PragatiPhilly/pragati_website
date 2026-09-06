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
import { ADJUSTMENT_REASONS, VOID_REASONS, parseAmountToCents, type AdjustmentKind, type VoidReason } from "@/lib/desk/constants";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function OrderControls({
  registrationId,
  balanceCents,
  deskState,
  buyerEmail,
  buyerPhone,
  buyerName,
  isAdmin,
  hasEmail,
}: {
  registrationId: string;
  balanceCents: number;
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
        {!voided && (
          <button className="btn-secondary" onClick={() => setPanel(panel === "details" ? null : "details")}>
            Fill in details
          </button>
        )}
        {!voided && !closed && balanceCents > 0 && (
          <button className="btn-secondary" disabled={busy} onClick={() => act(() => admitWithBalanceAction(registrationId))}>
            Let them in owing {money(balanceCents)}
          </button>
        )}
        {!voided && isAdmin && (
          <button className="btn-secondary" onClick={() => setPanel(panel === "comp" ? null : "comp")}>
            Comp / discount
          </button>
        )}
        {!voided && !closed && balanceCents <= 0 && (
          <button className="btn-primary" disabled={busy} onClick={() => act(() => closeOrderAction(registrationId))}>
            Close order
          </button>
        )}
        {hasEmail && (
          <button className="btn-secondary" disabled={busy} onClick={() => act(() => resendTicketsAction(registrationId))}>
            Email the tickets
          </button>
        )}
        <a className="btn-secondary" href={`/admin/desk/o/${registrationId}/stub`} target="_blank" rel="noreferrer">
          Print stub
        </a>
        <a className="btn-secondary" href={`/admin/desk/new?parent=${registrationId}`}>
          Add people
        </a>
        {!voided && (
          <button className="text-xs underline underline-offset-4" onClick={() => setPanel(panel === "void" ? null : "void")}>
            Void this order
          </button>
        )}
      </div>

      {closed && isAdmin && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="desk-field grow">
            Reopen — why?
            <input value={reopenWhy} onChange={(e) => setReopenWhy(e.target.value)} />
          </label>
          <button className="btn-secondary" disabled={busy} onClick={() => act(() => reopenOrderAction(registrationId, reopenWhy))}>
            Reopen
          </button>
        </div>
      )}

      {panel === "details" && (
        <div className="festive-card p-4 flex flex-col gap-3">
          <p className="desk-note">
            Filling in an email here sends this family their tickets straight away and clears the follow-up.
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
            The list price stays exactly as it is — the waiver sits beside it with your name on it, and a pass is still
            issued so the headcount and the kitchen are right.
          </p>
          <div className="desk-grid2">
            <label className="desk-field">
              What
              <select value={adjKind} onChange={(e) => setAdjKind(e.target.value as AdjustmentKind)}>
                <option value="comp">Comp (free)</option>
                <option value="discount">Discount</option>
                <option value="writeoff">Write off a balance</option>
                <option value="surcharge">Surcharge (they owe more)</option>
              </select>
            </label>
            <label className="desk-field">
              Amount
              <input value={adjAmount} inputMode="decimal" onChange={(e) => setAdjAmount(e.target.value)} />
            </label>
            <label className="desk-field">
              Reason
              <select value={adjReason} onChange={(e) => setAdjReason(e.target.value)}>
                {ADJUSTMENT_REASONS.filter((r) => r.kinds.includes(adjKind)).map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="desk-field">
              Note
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
            Nothing is deleted. The passes stop admitting, the seats go back, and any money already taken becomes a
            refund the treasurer owes.
          </p>
          <div className="desk-grid2">
            <label className="desk-field">
              Reason
              <select value={voidReason} onChange={(e) => setVoidReason(e.target.value as VoidReason)}>
                {VOID_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="desk-field">
              Note
              <input value={voidNote} onChange={(e) => setVoidNote(e.target.value)} />
            </label>
          </div>
          <button
            className="btn-secondary self-start"
            disabled={busy}
            onClick={() => act(() => voidOrderAction(registrationId, voidReason, voidNote))}
          >
            Void {money(balanceCents > 0 ? balanceCents : 0)}
          </button>
        </div>
      )}

      {error && <p className="desk-error">{error}</p>}
      {ok && <p className="desk-ok">{ok}</p>}
    </div>
  );
}
