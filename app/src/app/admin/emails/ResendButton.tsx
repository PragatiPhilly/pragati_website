"use client";

import { useState, useTransition } from "react";
import { resendEmailAction } from "./actions";

export default function ResendButton({ emailLogId }: { emailLogId: string }) {
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex items-center gap-3">
      <button
        className="text-xs underline underline-offset-4 font-semibold opacity-80 hover:opacity-100"
        disabled={pending}
        onClick={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const r = await resendEmailAction(emailLogId);
            setNote(r.note);
          });
        }}
      >
        {pending ? "Re-sending…" : "↻ Re-send"}
      </button>
      {note && <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{note}</span>}
    </span>
  );
}
