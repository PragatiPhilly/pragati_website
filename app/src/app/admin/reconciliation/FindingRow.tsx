"use client";

import { useState, useTransition } from "react";
import { approveFinding, dismissFinding, type ActionResult } from "./actions";

export type FindingView = {
  id: string;
  kind: string;
  reference: string | null;
  entityKind: string | null;
  detail: string | null;
  squarePaymentId: string | null;
  squareOrderId: string | null;
  squareAmountCents: number | null;
  ledgerAmountCents: number | null;
  createdAt: string;
};

const money = (c: number | null) => (c == null ? "—" : `$${(c / 100).toFixed(2)}`);

/** Plain-English framing. Nobody reviewing money should have to decode jargon. */
const KIND: Record<string, { title: string; means: string; action: string | null; actionHint: string }> = {
  false_negative: {
    title: "Square took a payment we have not recorded as received",
    means:
      "The money is in the Square account. Our website still shows this order as unpaid or cancelled, so the buyer has no tickets.",
    action: "Record as paid",
    actionHint:
      "Re-checks Square first, then marks the order paid, settles the money, takes the seats and emails the buyer their tickets.",
  },
  false_positive: {
    title: "We record a card payment Square has no matching record for",
    means:
      "Our website says this was paid by card, but Square did not list a completed payment for it in the window checked. This is often innocent — an older payment outside the window, or a manually-entered one.",
    action: null,
    actionHint:
      "There is nothing safe to apply automatically. Check the order in the Square dashboard, then dismiss with what you found.",
  },
  amount_mismatch: {
    title: "The amounts do not agree",
    means: "Both sides agree it was paid, but for different amounts.",
    action: null,
    actionHint: "Compare against the Square receipt, correct by hand if needed, then dismiss with a note.",
  },
  orphan: {
    title: "Square took money against an order we cannot identify",
    means: "A completed payment in Square that matches no registration, donation or membership on our side.",
    action: null,
    actionHint: "Find the buyer from the Square receipt, record it by hand, then dismiss with a note.",
  },
};

export default function FindingRow({ f }: { f: FindingView }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const meta = KIND[f.kind] ?? {
    title: f.kind,
    means: "",
    action: null,
    actionHint: "Review and dismiss with a note.",
  };

  const run = (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn()));

  return (
    <li className="finding">
      <div className="head">
        <div>
          <p className="ref">{f.reference ?? "No confirmation number"}</p>
          <h3>{meta.title}</h3>
        </div>
        <p className="when">flagged {new Date(f.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
      </div>

      <p className="means">{meta.means}</p>
      {f.detail && <p className="detail">{f.detail}</p>}

      <dl className="figures">
        <div><dt>Square says</dt><dd>{money(f.squareAmountCents)}</dd></div>
        <div><dt>Our books say</dt><dd>{money(f.ledgerAmountCents)}</dd></div>
        <div><dt>Square payment</dt><dd className="id">{f.squarePaymentId ?? "—"}</dd></div>
        <div><dt>Square order</dt><dd className="id">{f.squareOrderId ?? "—"}</dd></div>
      </dl>

      <p className="hint">{meta.actionHint}</p>

      <label className="note-label">
        <span>Note (recorded with your name)</span>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What did you check, and what did you decide?"
          disabled={pending}
        />
      </label>

      <div className="actions">
        {meta.action && (
          <button className="approve" disabled={pending} onClick={() => run(() => approveFinding(f.id, note))}>
            {pending ? "Working…" : meta.action}
          </button>
        )}
        <button className="dismiss" disabled={pending} onClick={() => run(() => dismissFinding(f.id, note))}>
          Dismiss
        </button>
      </div>

      {result && <p className={result.ok ? "res ok" : "res bad"}>{result.message}</p>}
    </li>
  );
}
