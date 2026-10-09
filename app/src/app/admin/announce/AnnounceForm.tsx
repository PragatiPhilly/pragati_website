"use client";

import { useState, useTransition } from "react";
import { sendAnnouncementAction, sendTestAnnouncementAction } from "./actions";

export default function AnnounceForm({
  options,
  budgetLeft,
}: {
  options: { key: string; label: string; count: number; noEmail: number }[];
  budgetLeft: number;
}) {
  const [day, setDay] = useState(options[0]?.key ?? "all");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const opt = options.find((o) => o.key === day);
  const count = opt?.count ?? 0;

  return (
    <div className="festive-card p-5 grid gap-4">
      <label className="grid gap-1 text-sm font-semibold">
        Who gets it
        <select className="input" value={day} onChange={(e) => { setDay(e.target.value); setTyped(""); }}>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label} — {o.count} families
            </option>
          ))}
        </select>
        {opt && opt.noEmail > 0 && (
          <span className="text-xs font-normal" style={{ color: "var(--ink-soft)" }}>
            {`${opt.noEmail} walk-in booking${opt.noEmail === 1 ? " has" : "s have"} no email and won't get it.`}
          </span>
        )}
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        Subject
        <input className="input" value={subject} maxLength={150} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Parking update for Saturday" />
      </label>
      <label className="grid gap-1 text-sm font-semibold">
        Message
        <textarea
          className="input min-h-40"
          value={message}
          maxLength={5000}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={"Plain text. Leave a blank line between paragraphs.\n\nThe email goes out with the usual Pragati header and footer."}
        />
      </label>

      <div className="flex gap-2 flex-wrap items-center">
        <button
          type="button"
          className="btn-secondary !py-2 !px-4 text-sm"
          disabled={busy}
          onClick={() => start(async () => setResult(await sendTestAnnouncementAction(subject, message)))}
        >
          Send a test to me first
        </button>
      </div>

      <div className="rounded-xl p-4 grid gap-2" style={{ background: "var(--accent-soft)" }}>
        <p className="text-sm">
          This goes to <strong>{count} families</strong>. Type <strong>{count}</strong> to confirm.
          {count > budgetLeft && (
            <span className="block text-xs mt-1" style={{ color: "#8a5a00" }}>
              About {budgetLeft} emails are left in today&apos;s budget, so the rest go out over the coming rounds — tickets and receipts
              always send first.
            </span>
          )}
        </p>
        <div className="flex gap-2 flex-wrap items-center">
          <input className="input !w-28" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ""))} aria-label="Type the number of families to confirm" />
          <button
            type="button"
            className="btn-primary !py-2 !px-5 text-sm"
            disabled={busy || Number(typed) !== count || count === 0}
            onClick={() =>
              start(async () => {
                const r = await sendAnnouncementAction(day, subject, message, Number(typed));
                setResult(r);
                if (r.ok) setTyped("");
              })
            }
          >
            {busy ? "Sending…" : `Send to ${count} families`}
          </button>
        </div>
      </div>
      {result && (
        <p className="text-sm font-medium" style={{ color: result.ok ? "var(--leaf-deep)" : "var(--sindoor)" }}>
          {result.message}
        </p>
      )}
    </div>
  );
}
