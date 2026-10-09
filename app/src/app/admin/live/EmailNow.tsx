"use client";

import { useState, useTransition } from "react";
import { emailSummaryNowAction } from "./actions";

export default function EmailNow({ dayKey }: { dayKey: string }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState("");
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <button
        type="button"
        className="btn-secondary !py-2 !px-4 text-xs"
        disabled={busy}
        onClick={() =>
          start(async () => {
            const r = await emailSummaryNowAction(dayKey);
            setMsg(r.message);
          })
        }
      >
        {busy ? "Sending…" : "✉ Email this summary now"}
      </button>
      {msg && <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{msg}</span>}
    </span>
  );
}
