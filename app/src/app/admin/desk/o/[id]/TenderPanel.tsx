"use client";

/**
 * Take a payment.
 *
 * Five shapes, one form. The balance is the headline and the amount defaults to
 * it, because the overwhelmingly common case is "they are paying what they
 * owe" and a volunteer should not have to type a number they can already see.
 *
 * The two shapes the old kiosk could not express at all get first-class fields:
 * a cheque records its NUMBER (which is what the treasurer matches on), and a
 * Zelle records WHO IT WENT TO — picked from the staff list, never free text,
 * because "Rina" is not something you can chase and a user id is.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addTenderAction } from "../../actions";
import { parseAmountToCents, type TenderMethod } from "@/lib/desk/constants";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

const METHODS: { key: TenderMethod; label: string; hint: string }[] = [
  { key: "cash", label: "Cash", hint: "Counted into this till" },
  { key: "check", label: "Cheque", hint: "Held until the treasurer banks it" },
  { key: "zelle", label: "Zelle", hint: "To the org, or to a person" },
  { key: "square", label: "Card", hint: "QR on this screen, they pay on their phone" },
];

export default function TenderPanel({
  registrationId,
  balanceCents,
  shiftId,
  staff,
  cardFeeDefault,
  disabled,
  disabledWhy,
}: {
  registrationId: string;
  balanceCents: number;
  shiftId: string | null;
  staff: { userId: string; label: string }[];
  cardFeeDefault: boolean;
  disabled?: boolean;
  disabledWhy?: string;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<TenderMethod>("cash");
  const [amount, setAmount] = useState((Math.max(0, balanceCents) / 100).toFixed(2));
  const [cashTendered, setCashTendered] = useState("");
  const [checkNumber, setCheckNumber] = useState("");
  const [bank, setBank] = useState("");
  const [payerName, setPayerName] = useState("");
  const [checkDate, setCheckDate] = useState("");
  const [zelleTo, setZelleTo] = useState<"org" | string>("org");
  const [senderHandle, setSenderHandle] = useState("");
  const [senderLast4, setSenderLast4] = useState("");
  const [confirmationSeen, setConfirmationSeen] = useState(true);
  const [withCardFee, setWithCardFee] = useState(cardFeeDefault);
  const [note, setNote] = useState("");

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const amountCents = parseAmountToCents(amount) ?? 0;
  const feeCents = method === "square" && withCardFee ? Math.round(amountCents * 0.03) : 0;
  const cashCents = parseAmountToCents(cashTendered) ?? 0;
  const change = method === "cash" && cashCents > amountCents ? cashCents - amountCents : 0;

  if (disabled) return <p className="desk-note">{disabledWhy}</p>;

  const submit = () =>
    start(async () => {
      setError("");
      setOk("");
      setPayUrl(null);
      const cents = parseAmountToCents(amount);
      if (cents === null || cents <= 0) return setError("Type an amount, e.g. 40 or 40.00");
      if (method === "zelle" && zelleTo !== "org" && !staff.find((s) => s.userId === zelleTo))
        return setError("Pick who the Zelle went to.");

      const res = await addTenderAction({
        registrationId,
        method,
        amountCents: cents,
        withCardFee,
        shiftId,
        note: note.trim() || undefined,
        cash: method === "cash" ? { cashTenderedCents: cashCents || undefined } : undefined,
        check:
          method === "check"
            ? { checkNumber, bank, payerName, checkDate: checkDate || undefined }
            : undefined,
        zelle:
          method === "zelle"
            ? {
                sentTo:
                  zelleTo === "org"
                    ? "org"
                    : { userId: zelleTo, displayName: staff.find((s) => s.userId === zelleTo)?.label ?? "a volunteer" },
                senderHandle: senderHandle.trim() || undefined,
                senderLast4: senderLast4.trim() || undefined,
                confirmationSeen,
              }
            : undefined,
      });
      if (!res.ok) return setError(res.error);
      setOk(res.message ?? "Recorded ✓");
      if (res.data?.paymentUrl) setPayUrl(res.data.paymentUrl);
      setCashTendered("");
      setCheckNumber("");
      setNote("");
      router.refresh();
    });

  return (
    <div className="festive-card p-4 flex flex-col gap-3">
      <div className="kind-row">
        {METHODS.map((m) => (
          <button key={m.key} className="kind-btn" aria-pressed={method === m.key} onClick={() => setMethod(m.key)}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="desk-note">{METHODS.find((m) => m.key === method)?.hint}</p>

      <div className="desk-grid2">
        <label className="desk-field">
          Amount to apply
          <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
        </label>

        {method === "cash" && (
          <label className="desk-field">
            Cash handed over (optional)
            <input value={cashTendered} inputMode="decimal" onChange={(e) => setCashTendered(e.target.value)} />
          </label>
        )}

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
            <label className="desk-field">
              Payer name (as written)
              <input value={payerName} onChange={(e) => setPayerName(e.target.value)} />
            </label>
            <label className="desk-field">
              Date on the cheque
              <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} />
            </label>
          </>
        )}

        {method === "zelle" && (
          <>
            <label className="desk-field">
              Where did it go?
              <select value={zelleTo} onChange={(e) => setZelleTo(e.target.value)}>
                <option value="org">The Pragati account</option>
                {staff.map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.label} (personal)
                  </option>
                ))}
              </select>
            </label>
            <label className="desk-field">
              Sender&apos;s Zelle handle / phone
              <input value={senderHandle} onChange={(e) => setSenderHandle(e.target.value)} />
            </label>
            <label className="desk-field">
              Last 4 of their number
              <input
                value={senderLast4}
                inputMode="numeric"
                onChange={(e) => setSenderLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              />
            </label>
          </>
        )}

        <label className="desk-field">
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      {method === "zelle" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmationSeen} onChange={(e) => setConfirmationSeen(e.target.checked)} />
          I saw the confirmation on their phone
        </label>
      )}

      {method === "square" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withCardFee} onChange={(e) => setWithCardFee(e.target.checked)} />
          Add the 3% card fee ({money(feeCents)}) — charged on top, not part of what they owe
        </label>
      )}

      {change > 0 && <p className="desk-ok">Change to give back: {money(change)}</p>}
      {zelleTo !== "org" && method === "zelle" && (
        <p className="desk-note">
          This is recorded as <strong>held by a person</strong>, not as money in the org account — it stays on the
          treasury queue with their name on it until they hand it over.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={submit}>
          {pending ? "Recording…" : `Take ${money(amountCents + feeCents)}`}
        </button>
        <span className="desk-note">Balance {money(balanceCents)}</span>
      </div>

      {error && <p className="desk-error">{error}</p>}
      {ok && <p className="desk-ok">{ok}</p>}
      {payUrl && (
        <div className="flex flex-col items-start gap-2">
          <p className="desk-note">Show this to the guest — they pay on their own phone:</p>
          {/* Rendered by us, not a third-party image host: a venue with bad
              wi-fi must not be shown a broken image mid-payment.
              eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Payment QR"
            width={200}
            height={200}
            src={`/api/admin/desk/qr?data=${encodeURIComponent(payUrl)}`}
            style={{ background: "#fff", padding: 8, borderRadius: 8 }}
          />
          <a className="text-xs underline underline-offset-4 break-all" href={payUrl} target="_blank" rel="noreferrer">
            {payUrl}
          </a>
          <p className="desk-note">
            When they&apos;ve paid, tap <strong>Check with Square</strong> on the payment below — the desk asks Square
            directly rather than waiting on a webhook.
          </p>
        </div>
      )}
    </div>
  );
}
