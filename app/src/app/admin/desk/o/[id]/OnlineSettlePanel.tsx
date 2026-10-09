"use client";

/**
 * Take payment for an ONLINE booking that was never paid.
 *
 * Same plain words as the walk-in payment form. The amount is fixed — it is
 * exactly what the booking costs. To change who or which days, use "+ Add more
 * people" or the Registrations page instead.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { settleOnlineBookingAction, startOnlineCardAction } from "../../online-actions";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
type Method = "cash" | "check" | "zelle" | "card";

const METHODS: { key: Method; label: string; hint: string }[] = [
  { key: "cash", label: "💵 Cash", hint: "Goes into your cash box." },
  { key: "check", label: "🏦 Cheque", hint: "We hold the cheque until the treasurer banks it. Write down its number." },
  { key: "zelle", label: "📱 Zelle", hint: "Say whether it went to Pragati's account or to somebody's own phone." },
  { key: "card", label: "💳 Card", hint: "A code appears on screen — they scan it and pay on their own phone." },
];

export default function OnlineSettlePanel({
  registrationId,
  owesCents,
  cardCents,
  status,
  paidSiblings,
  staff,
  noCashBox,
}: {
  registrationId: string;
  owesCents: number;
  cardCents: number;
  status: string;
  paidSiblings: { id: string; conf: string; passes: number }[];
  staff: { userId: string; label: string }[];
  noCashBox: boolean;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [method, setMethod] = useState<Method>("cash");
  const [checkNumber, setCheckNumber] = useState("");
  const [bank, setBank] = useState("");
  const [zelleTo, setZelleTo] = useState("org");
  const [seen, setSeen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [cardUrl, setCardUrl] = useState<string | null>(null);

  const why =
    status === "pending_zelle_verification"
      ? "They chose Zelle online, but nobody has confirmed the money arrived. If they show you it went to Pragati, pick Zelle below. If they never sent it, take payment now."
      : status === "cancelled_no_payment"
        ? "They started this booking online but never paid, and it was set aside as unpaid."
        : "They started this booking online but the card payment never finished.";

  const pay = () =>
    start(async () => {
      setError("");
      setOk("");
      if (method === "card") {
        const res = await startOnlineCardAction(registrationId);
        if (!res.ok) setError(res.error);
        else setCardUrl(res.data?.url ?? null);
        return;
      }
      const holder = staff.find((s) => s.userId === zelleTo);
      const res = await settleOnlineBookingAction(registrationId, {
        method: method === "zelle" ? (zelleTo === "org" ? "zelle_org" : "zelle_person") : method,
        checkNumber,
        bank,
        holder: holder ? { userId: holder.userId, displayName: holder.label } : undefined,
        note,
      });
      if (!res.ok) setError(res.error);
      else {
        setOk(res.message ?? "Paid ✓");
        router.refresh();
      }
    });

  const amount = method === "card" ? cardCents : owesCents;
  const blocked = (method === "cash" && noCashBox) || (method === "check" && !checkNumber.trim()) || (method === "zelle" && !seen);

  return (
    <div className="flex flex-col gap-3">
      <div className="desk-balance desk-balance--owed">
        <span>
          <span className="lbl">Not paid yet</span>
          <br />
          <span className="amount">{money(owesCents)}</span>
        </span>
        <span className="desk-note">{why}</span>
      </div>

      {paidSiblings.length > 0 && (
        <p className="desk-error">
          ⚠ This family already has a PAID booking:{" "}
          {paidSiblings.map((p, i) => (
            <span key={p.id}>
              {i > 0 ? ", " : ""}
              <a href={`/admin/desk/o/${p.id}`} className="underline">
                {p.conf}
              </a>{" "}
              ({p.passes} {p.passes === 1 ? "pass" : "passes"})
            </span>
          ))}
          . This unpaid one is probably an abandoned retry — check those passes first and don&apos;t charge twice.
        </p>
      )}

      <div className="festive-card p-4 flex flex-col gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-bold">Take payment for this online booking</h2>
        <div className="kind-row">
          {METHODS.map((m) => (
            <button key={m.key} className="kind-btn" aria-pressed={method === m.key} onClick={() => setMethod(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="desk-note">{METHODS.find((m) => m.key === method)?.hint}</p>

        {method === "cash" && noCashBox && (
          <p className="desk-error">Open the cash box first (top of the walk-in desk page) before taking cash.</p>
        )}

        <div className="desk-grid2">
          {method === "check" && (
            <>
              <label className="desk-field">
                Cheque number
                <input value={checkNumber} onChange={(e) => setCheckNumber(e.target.value)} />
              </label>
              <label className="desk-field">
                Bank
                <input value={bank} onChange={(e) => setBank(e.target.value)} />
              </label>
            </>
          )}
          {method === "zelle" && (
            <label className="desk-field">
              Where did the money go?
              <select value={zelleTo} onChange={(e) => setZelleTo(e.target.value)}>
                <option value="org">Pragati’s own account</option>
                {staff.map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.label} — their own account
                  </option>
                ))}
              </select>
            </label>
          )}
          {method !== "card" && (
            <label className="desk-field">
              Note (optional)
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          )}
        </div>

        {method === "zelle" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={seen} onChange={(e) => setSeen(e.target.checked)} />I saw the “sent” screen on their phone
          </label>
        )}

        {cardUrl ? (
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Card payment code"
              width={200}
              height={200}
              src={`/api/admin/desk/qr?data=${encodeURIComponent(cardUrl)}`}
              style={{ background: "#fff", padding: 8, borderRadius: 8 }}
            />
            <a className="text-xs underline underline-offset-4 break-all" href={cardUrl} target="_blank" rel="noreferrer">
              {cardUrl}
            </a>
            <p className="desk-note text-center">
              They scan this and pay {money(cardCents)} on their phone. When Square confirms it, this page shows it as paid — tap
              “Check again” in a moment.
            </p>
            <button className="btn-secondary" onClick={() => router.refresh()}>
              ↻ Check again
            </button>
          </div>
        ) : (
          <button className="btn-primary" disabled={busy || blocked} onClick={pay}>
            {busy ? "Saving…" : method === "card" ? `Show the card code for ${money(amount)}` : `Took ${money(amount)} — mark paid`}
          </button>
        )}
        {error && <p className="desk-error">{error}</p>}
        {ok && <p className="desk-ok">{ok}</p>}
      </div>
    </div>
  );
}
