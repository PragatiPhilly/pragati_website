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
import { addTenderAction, openShiftAction } from "../../actions";
import { parseAmountToCents, type TenderMethod } from "@/lib/desk/constants";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

const METHODS: { key: TenderMethod; label: string; hint: string }[] = [
  { key: "cash", label: "💵 Cash", hint: "Goes into your cash box. Type what they hand you and it works out the change." },
  { key: "check", label: "🏦 Cheque", hint: "We hold the cheque until the treasurer banks it. Write down its number." },
  { key: "zelle", label: "📱 Zelle", hint: "Say whether it went to Pragati's account or to somebody's own phone." },
  { key: "square", label: "💳 Card", hint: "A code appears on screen — they scan it and pay on their own phone." },
];

export default function TenderPanel({
  registrationId,
  balanceCents,
  shiftId,
  staff,
  cardFeeDefault,
  noCashBox,
  defaultStation,
}: {
  registrationId: string;
  balanceCents: number;
  shiftId: string | null;
  staff: { userId: string; label: string }[];
  cardFeeDefault: boolean;
  /** No cash box started yet. We ask for one HERE, where the money is, rather
   *  than blocking the whole desk before anybody has done anything. */
  noCashBox?: boolean;
  defaultStation?: string;
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
  const [station, setStation] = useState(defaultStation ?? "desk-1");
  const [float, setFloat] = useState("200");

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const amountCents = parseAmountToCents(amount) ?? 0;
  const feeCents = method === "square" && withCardFee ? Math.round(amountCents * 0.03) : 0;
  const cashCents = parseAmountToCents(cashTendered) ?? 0;
  const change = method === "cash" && cashCents > amountCents ? cashCents - amountCents : 0;

  // ── no cash box yet: ask for it in context, in one step ────────────────
  // The first version of this screen said "no till is open" and stopped. That
  // leaves a volunteer stuck with a family in front of them and a word they
  // don't know. Start it right here instead.
  if (noCashBox) {
    return (
      <div className="festive-card p-4 flex flex-col gap-3">
        <p style={{ margin: 0 }}>
          <strong>Before you take money, start your cash box.</strong>
        </p>
        <p className="desk-note" style={{ margin: 0 }}>
          It just records the money in front of you, so every payment has a name on it and the totals add up at the
          end of the night. Takes one tap.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="desk-field">
            Which desk are you on?
            <input value={station} onChange={(e) => setStation(e.target.value)} style={{ width: 140 }} />
          </label>
          <label className="desk-field">
            Change you’re starting with
            <input value={float} inputMode="decimal" onChange={(e) => setFloat(e.target.value)} style={{ width: 140 }} />
          </label>
          <button
            className="btn-primary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const cents = parseAmountToCents(float);
                if (cents === null) return setError("Type a number, like 200");
                const res = await openShiftAction({ station, openingFloatCents: cents });
                if (!res.ok) setError(res.error);
                else {
                  setError("");
                  router.refresh();
                }
              })
            }
          >
            {pending ? "Starting…" : "Start the cash box"}
          </button>
        </div>
        {error && <p className="desk-error">{error}</p>}
      </div>
    );
  }

  const submit = () =>
    start(async () => {
      setError("");
      setOk("");
      setPayUrl(null);
      const cents = parseAmountToCents(amount);
      if (cents === null || cents <= 0) return setError("Type how much they're paying, like 40");
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
      // Reset the amount to what is LEFT. Leaving the old figure sitting there
      // meant a $145 order paid $100 still offered a "Take $100.00" button
      // beside a $45.00 balance — one more tap and the family is overcharged.
      // A card tender is only pending until Square answers, so nothing has been
      // collected yet and the balance has not moved.
      if (method !== "square") setAmount((Math.max(0, balanceCents - cents) / 100).toFixed(2));
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
          How much are they paying now?
          <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
        </label>

        {method === "cash" && (
          <label className="desk-field">
            What they handed you (so we can work out the change)
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
              Name written on the cheque
              <input value={payerName} onChange={(e) => setPayerName(e.target.value)} />
            </label>
            <label className="desk-field">
              Date written on the cheque
              <input type="date" value={checkDate} onChange={(e) => setCheckDate(e.target.value)} />
            </label>
          </>
        )}

        {method === "zelle" && (
          <>
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
            <label className="desk-field">
              Their Zelle name or phone
              <input value={senderHandle} onChange={(e) => setSenderHandle(e.target.value)} />
            </label>
            <label className="desk-field">
              Last 4 digits of their number
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
          I saw the “sent” screen on their phone
        </label>
      )}

      {method === "square" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={withCardFee} onChange={(e) => setWithCardFee(e.target.checked)} />
          Add the 3% card fee ({money(feeCents)}) — charged on top of what they owe
        </label>
      )}

      {change > 0 && <p className="desk-ok">💵 Give them {money(change)} change</p>}
      {zelleTo !== "org" && method === "zelle" && (
        <p className="desk-note">
          Noted: this money is <strong>with that person</strong>, not with Pragati yet. It stays on the to-do list
          with their name on it until they hand it over. The guest is finished either way.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={pending} onClick={submit}>
          {pending ? "Saving…" : `Take ${money(amountCents + feeCents)}`}
        </button>
        <span className="desk-note">They still owe {money(balanceCents)}</span>
      </div>

      {error && <p className="desk-error">{error}</p>}
      {ok && <p className="desk-ok">{ok}</p>}
      {/* The payment code itself is drawn on the payment row down in "Money
          taken", not here. It used to be in both places, which meant either two
          QR codes on one screen or — far worse — none at all, because a card
          payment zeroes the balance and collapses this whole panel the moment
          it is created. One code, attached to the payment it belongs to, that
          stays put until Square answers. */}
      {payUrl && (
        <p className="desk-ok">
          Code ready — it’s on the payment under <strong>Money taken</strong> below. Turn the screen round so they
          can scan it.
        </p>
      )}
    </div>
  );
}
