"use client";

/**
 * The payments taken on this order, and what can still be done to each.
 *
 * Every row shows BOTH answers: what the guest settled, and where that money
 * physically is. "Cash · $200 · in the drawer" and "Zelle · $260 · held by
 * rina@… " are different facts, and the row says so rather than collapsing them
 * into a green tick.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { failTenderAction, pollCardAction, reverseTenderAction, voidTenderAction } from "../../actions";
import { CUSTODY_LABEL, type Custody } from "@/lib/desk/constants";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export type TenderView = {
  id: string;
  method: string;
  amountCents: number;
  feeCents: number;
  status: string;
  custody: Custody | null;
  seq: number | null;
  collectedByEmail: string | null;
  createdAt: string;
  reversedAt: string | null;
  reversalReason: string | null;
  depositRef: string | null;
  detail: string;
  payUrl: string | null;
};

export default function TenderList({
  tenders,
  registrationId,
  currentShiftId,
  canReverse,
}: {
  tenders: TenderView[];
  registrationId: string;
  currentShiftId: string | null;
  canReverse: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [why, setWhy] = useState("");

  const act = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      setError("");
      setOk("");
      const res = await fn();
      if (!res.ok) setError(res.error ?? "That didn't work.");
      else {
        setOk(res.message ?? "Done ✓");
        setConfirming(null);
        setWhy("");
        router.refresh();
      }
    });

  if (tenders.length === 0) return <p className="desk-note">No payments taken yet.</p>;

  return (
    <div className="flex flex-col">
      {tenders.map((t) => {
        const dead = t.status === "cancelled";
        return (
          <div key={t.id} className="desk-row">
            <span className="money">{money(t.amountCents)}</span>
            {t.feeCents > 0 && <span className="desk-note">+{money(t.feeCents)} fee</span>}
            <span className="grow">
              <strong className="capitalize">{t.method}</strong> — {t.detail}
              {t.collectedByEmail && <span className="desk-note"> · taken by {t.collectedByEmail}</span>}
              {t.depositRef && <span className="desk-note"> · deposited {t.depositRef}</span>}
              {t.reversalReason && <span className="desk-note"> · {t.reversalReason}</span>}
            </span>

            {dead ? (
              <span className="desk-chip chip-mute">{t.reversedAt ? "reversed" : "not taken"}</span>
            ) : t.status === "paid" ? (
              <>
                <span className="desk-chip chip-ok">settled</span>
                {t.custody && t.custody !== "org_account" && t.custody !== "n_a" ? (
                  <span className="desk-chip chip-warn">{CUSTODY_LABEL[t.custody]}</span>
                ) : (
                  <span className="desk-chip chip-hold">in the org account</span>
                )}
              </>
            ) : (
              <span className="desk-chip chip-warn">waiting on Square</span>
            )}

            {!dead && t.status !== "paid" && (
              <>
                <button
                  className="btn-secondary !py-1.5 !px-3 text-xs"
                  disabled={busy}
                  onClick={() => act(() => pollCardAction(t.id, registrationId))}
                >
                  Check with Square
                </button>
                <button
                  className="text-xs underline underline-offset-4"
                  disabled={busy}
                  onClick={() => act(() => failTenderAction(t.id, registrationId, "Card declined / abandoned"))}
                >
                  Didn&apos;t go through
                </button>
              </>
            )}

            {!dead && confirming !== t.id && (
              <button className="text-xs underline underline-offset-4" onClick={() => setConfirming(t.id)}>
                {t.status === "paid" ? "Undo / reverse" : "Undo"}
              </button>
            )}

            {confirming === t.id && (
              <span className="flex flex-wrap items-end gap-2 w-full mt-1">
                <label className="desk-field grow">
                  Why?
                  <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Taken by mistake / cheque bounced" />
                </label>
                <button
                  className="btn-secondary !py-1.5 !px-3 text-xs"
                  disabled={busy}
                  onClick={() => act(() => voidTenderAction(t.id, registrationId, why, currentShiftId))}
                >
                  Undo (taken by mistake)
                </button>
                {canReverse && t.status === "paid" && (
                  <button
                    className="btn-secondary !py-1.5 !px-3 text-xs"
                    disabled={busy}
                    onClick={() => act(() => reverseTenderAction(t.id, registrationId, why))}
                  >
                    Reverse (money never arrived)
                  </button>
                )}
                <button className="text-xs underline" onClick={() => setConfirming(null)}>
                  cancel
                </button>
              </span>
            )}
          </div>
        );
      })}
      {error && <p className="desk-error mt-2">{error}</p>}
      {ok && <p className="desk-ok mt-2">{ok}</p>}
    </div>
  );
}
