"use client";

import { useActionState, useState } from "react";
import { donateAction } from "./actions";

const AMOUNTS = [25, 50, 100, 500];

export default function DonateForm({
  squareEnabled = true,
  zelleEnabled = true,
}: {
  squareEnabled?: boolean;
  zelleEnabled?: boolean;
}) {
  const [state, action, pending] = useActionState(donateAction, undefined);
  const [amount, setAmount] = useState<string>("50");
  const [honor, setHonor] = useState("none");
  const [method, setMethod] = useState(squareEnabled ? "square" : "zelle");

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <p className="font-[family-name:var(--font-bangla)] text-2xl mb-2" style={{ color: "var(--sindoor)" }}>
        আপনার আশীর্বাদে
      </p>
      <h1 className="font-[family-name:var(--font-display)] text-4xl md:text-5xl font-black mb-3">Donate to Pragati</h1>
      <p className="mb-10" style={{ color: "var(--ink-soft)" }}>
        Pragati is a 501(c)(3) nonprofit — donations are tax-deductible and go straight to pujo, prasad, and programs.
      </p>

      <form action={action} className="festive-card p-7 flex flex-col gap-6">
        <div>
          <p className="text-sm font-semibold mb-3">Amount</p>
          <div className="flex flex-wrap gap-3">
            {AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                className="choice-chip !py-3 !px-6"
                data-selected={amount === String(a)}
                onClick={() => setAmount(String(a))}
              >
                ${a}
              </button>
            ))}
            <button type="button" className="choice-chip !py-3 !px-6" data-selected={amount === "custom"} onClick={() => setAmount("custom")}>
              Custom
            </button>
          </div>
          <input type="hidden" name="amount" value={amount} />
          {amount === "custom" && (
            <input name="customAmount" type="number" min="1" step="1" placeholder="Amount in USD" className="input mt-3 max-w-48" />
          )}
        </div>

        <div>
          <p className="text-sm font-semibold mb-3">This donation is…</p>
          <div className="flex flex-wrap gap-3">
            {[
              ["none", "Just a gift"],
              ["in_honor_of", "In honor of…"],
              ["in_memory_of", "In memory of…"],
            ].map(([v, label]) => (
              <button key={v} type="button" className="choice-chip !py-3" data-selected={honor === v} onClick={() => setHonor(v)}>
                {label}
              </button>
            ))}
          </div>
          <input type="hidden" name="inHonorOrMemory" value={honor} />
          {honor !== "none" && (
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <input name="honoreeName" placeholder="Honoree's name" className="input" />
              <input name="honoreeNotifyEmail" type="email" placeholder="Notify them at (optional)" className="input" />
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <input name="donorName" required placeholder="Your name" className="input" />
          <input name="donorEmail" required type="email" placeholder="Your email" className="input" />
          <input name="donorPhone" placeholder="Phone (optional)" className="input sm:col-span-2" />
          <textarea name="message" placeholder="A message to Pragati (optional)" className="input sm:col-span-2 min-h-24" />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isAnonymous" className="accent-[var(--sindoor)] w-4 h-4" />
          Make this donation anonymous
        </label>

        <div>
          <p className="text-sm font-semibold mb-3">Payment method</p>
          <div className="flex flex-wrap gap-3">
            {squareEnabled && (
              <button type="button" className="choice-chip" data-selected={method === "square"} onClick={() => setMethod("square")}>
                💳 Card — instant receipt
              </button>
            )}
            {zelleEnabled && (
              <button type="button" className="choice-chip" data-selected={method === "zelle"} onClick={() => setMethod("zelle")}>
                🏦 Zelle — bank transfer
              </button>
            )}
          </div>
          <input type="hidden" name="paymentMethod" value={method} />
        </div>

        {state?.error && (
          <p className="text-sm font-medium rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
            {state.error}
          </p>
        )}

        <button className="btn-primary text-lg" disabled={pending}>
          {pending ? "One moment…" : method === "zelle" ? "Continue — pay via Zelle →" : "Continue to card payment →"}
        </button>
      </form>
    </div>
  );
}
