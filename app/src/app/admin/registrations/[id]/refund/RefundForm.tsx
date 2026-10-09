"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelAndRefundAction } from "./actions";

type T = { id: string; name: string; pass: string; dayKey: string; priceCents: number; used: boolean; voided: boolean };
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const METHODS: { key: "square" | "zelle" | "cash" | "check"; label: string }[] = [
  { key: "square", label: "Card — I refunded it in the Square dashboard" },
  { key: "zelle", label: "Zelle back to them" },
  { key: "cash", label: "Cash back" },
  { key: "check", label: "Cheque" },
];

export default function RefundForm({ registrationId, tickets, roomCents }: { registrationId: string; tickets: T[]; roomCents: number }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [amount, setAmount] = useState("");
  const [touched, setTouched] = useState(false);
  const [method, setMethod] = useState<(typeof METHODS)[number]["key"]>("square");
  const [note, setNote] = useState("");
  const [busy, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const suggested = useMemo(() => Math.min(roomCents, tickets.filter((t) => picked.includes(t.id)).reduce((n, t) => n + t.priceCents, 0)), [picked, tickets, roomCents]);
  const shown = touched ? amount : (suggested / 100).toFixed(2);
  const cents = Math.round(Number(shown || "0") * 100);

  return (
    <div className="festive-card p-5 grid gap-4">
      <div>
        <p className="text-sm font-semibold mb-2">1. Which passes stop working? (leave all unticked for a money-only refund)</p>
        <div className="grid gap-1.5">
          {tickets.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm" style={{ opacity: t.voided || t.used ? 0.5 : 1 }}>
              <input
                type="checkbox"
                disabled={t.voided || t.used}
                checked={picked.includes(t.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, t.id] : picked.filter((x) => x !== t.id))}
              />
              <span>
                <strong>{t.name}</strong> · {t.pass} · {t.dayKey === "all" ? "all days" : t.dayKey} · {money(t.priceCents)}
                {t.voided && " · already cancelled"}
                {t.used && !t.voided && " · already used at the gate"}
              </span>
            </label>
          ))}
        </div>
      </div>
      <label className="grid gap-1 text-sm font-semibold">
        2. How much went back to them? (up to {money(roomCents)})
        <input className="input !w-40" inputMode="decimal" value={shown} onChange={(e) => { setTouched(true); setAmount(e.target.value); }} />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        3. How
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          {METHODS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        {method === "square" && (
          <span className="text-xs font-normal" style={{ color: "#8a5a00" }}>
            This page does NOT refund the card. Do it in the Square dashboard first, then record it here.
          </span>
        )}
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        4. Why
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. paid twice · can't come Sunday" />
      </label>
      <div className="flex gap-3 items-center flex-wrap">
        <button
          type="button"
          className="btn-primary !py-2 !px-5 text-sm"
          disabled={busy || (!picked.length && cents <= 0) || !note.trim()}
          onClick={() => {
            const what = `${picked.length ? `Cancel ${picked.length} pass${picked.length === 1 ? "" : "es"}` : "Cancel no passes"} and record a ${money(cents)} refund?`;
            if (!window.confirm(what)) return;
            start(async () => {
              const r = await cancelAndRefundAction(registrationId, { ticketIds: picked, refundCents: cents, method, note });
              setResult(r);
              if (r.ok) {
                setPicked([]);
                setTouched(false);
                setNote("");
                router.refresh();
              }
            });
          }}
        >
          {busy ? "Saving…" : "Record it"}
        </button>
        {result && <span className="text-sm font-medium" style={{ color: result.ok ? "var(--leaf-deep)" : "var(--sindoor)" }}>{result.message}</span>}
      </div>
    </div>
  );
}
