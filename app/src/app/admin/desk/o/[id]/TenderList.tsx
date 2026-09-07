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

  if (tenders.length === 0)
    return <p className="desk-note">Nothing taken yet. Use “Take a payment” above.</p>;

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
              {t.depositRef && <span className="desk-note"> · banked, ref {t.depositRef}</span>}
              {t.reversalReason && <span className="desk-note"> · {t.reversalReason}</span>}
            </span>

            {dead ? (
              <span className="desk-chip chip-mute">{t.reversedAt ? "undone" : "didn’t go through"}</span>
            ) : t.status === "paid" ? (
              <>
                <span className="desk-chip chip-ok">paid</span>
                {t.custody && t.custody !== "org_account" && t.custody !== "n_a" ? (
                  <span className="desk-chip chip-warn">{CUSTODY_LABEL[t.custody]}</span>
                ) : (
                  <span className="desk-chip chip-hold">reached Pragati</span>
                )}
              </>
            ) : (
              <span className="desk-chip chip-warn">card not confirmed yet</span>
            )}

            {/* The code the guest actually scans, on the payment row itself.
                It used to live only inside the payment form — and a card tender
                drives the balance to zero, which collapses that form the
                instant it is created. The volunteer was left holding a booking
                that said "waiting on the card" with no code anywhere on screen
                for the guest to scan. It belongs to the payment, so it lives on
                the payment. */}
            {!dead && t.status !== "paid" && t.payUrl && (
              <div className="pay-qr">
                <p className="desk-note">Turn the screen round — they scan this and pay on their own phone:</p>
                {/* Drawn by us rather than fetched from an image host: bad
                    venue wi-fi must not produce a broken image mid-payment.
                    eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="Payment QR code"
                  width={200}
                  height={200}
                  src={`/api/admin/desk/qr?data=${encodeURIComponent(t.payUrl)}`}
                  style={{ background: "#fff", padding: 8, borderRadius: 8 }}
                />
                <a className="text-xs underline underline-offset-4 break-all" href={t.payUrl} target="_blank" rel="noreferrer">
                  {t.payUrl}
                </a>
                <p className="desk-note">
                  When they say it has gone through, tap <strong>Check if it went through</strong>.
                </p>
              </div>
            )}

            {!dead && t.status !== "paid" && (
              <>
                <button
                  className="btn-secondary !py-1.5 !px-3 text-xs"
                  disabled={busy}
                  onClick={() => act(() => pollCardAction(t.id, registrationId))}
                >
                  Check if it went through
                </button>
                <button
                  className="text-xs underline underline-offset-4"
                  disabled={busy}
                  onClick={() => act(() => failTenderAction(t.id, registrationId, "Card declined / abandoned"))}
                >
                  It didn’t work
                </button>
              </>
            )}

            {!dead && confirming !== t.id && (
              <button className="text-xs underline underline-offset-4" onClick={() => setConfirming(t.id)}>
                Undo this
              </button>
            )}

            {/* The two buttons ARE the reason. They used to sit beside a
                required "Why?" box, so tapping the one that already said
                "I recorded it by mistake" answered with an error demanding a
                reason. Each button now carries its own, and the box is for
                anything the volunteer wants to add on top. */}
            {confirming === t.id && (
              <span className="undo-panel">
                <span className="desk-note w-full">
                  Undoing {money(t.amountCents)} {t.method}. Which is it?
                </span>
                <button
                  className="btn-secondary !py-1.5 !px-3 text-xs"
                  disabled={busy}
                  title="It never should have been recorded — a mis-key, or the wrong booking"
                  onClick={() =>
                    act(() =>
                      voidTenderAction(t.id, registrationId, why.trim() || "Recorded by mistake", currentShiftId)
                    )
                  }
                >
                  I recorded it by mistake
                </button>
                {canReverse && t.status === "paid" && (
                  <button
                    className="btn-secondary !py-1.5 !px-3 text-xs"
                    disabled={busy}
                    title="It was real at the time, but the money did not arrive — a bounced cheque, a reversed Zelle"
                    onClick={() =>
                      act(() => reverseTenderAction(t.id, registrationId, why.trim() || "The money never arrived"))
                    }
                  >
                    The money never actually arrived
                  </button>
                )}
                <label className="desk-field grow">
                  Anything to add? (optional)
                  <input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Cheque bounced on the 12th" />
                </label>
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
