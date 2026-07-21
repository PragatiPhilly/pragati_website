"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { simulateSquarePayment } from "./actions";

export default function SimulatorForm({ refId, conf, redirect }: { refId: string; conf: string; redirect?: string }) {
  const router = useRouter();
  const [card, setCard] = useState("4111 1111 1111 1111");
  const [state, setState] = useState<"idle" | "busy" | "declined">("idle");

  const inputCls = "w-full rounded-lg border border-neutral-300 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/70";

  return (
    <div className="grid gap-3">
      <label className="text-xs font-semibold text-neutral-600">
        Card number
        <input className={`${inputCls} mt-1 font-mono`} value={card} onChange={(e) => setCard(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-neutral-600">
          Expiry
          <input className={`${inputCls} mt-1`} defaultValue="12/28" />
        </label>
        <label className="text-xs font-semibold text-neutral-600">
          CVV
          <input className={`${inputCls} mt-1`} defaultValue="111" />
        </label>
      </div>
      <p className="text-[11px] text-neutral-400">
        Sandbox cards: 4111… succeeds · anything ending in 0002 is declined
      </p>
      {state === "declined" && (
        <p className="text-sm font-medium text-red-600 bg-red-50 rounded-lg px-3 py-2">Card declined (simulated). Try 4111 1111 1111 1111.</p>
      )}
      <button
        className="mt-2 rounded-lg bg-black text-white font-semibold py-3 hover:bg-neutral-800 transition-colors disabled:opacity-50"
        disabled={state === "busy"}
        onClick={async () => {
          if (card.replaceAll(" ", "").endsWith("0002")) return setState("declined");
          setState("busy");
          await simulateSquarePayment(refId);
          router.push(redirect || `/checkout/success?conf=${encodeURIComponent(conf)}`);
        }}
      >
        {state === "busy" ? "Processing…" : "Pay now"}
      </button>
    </div>
  );
}
