"use client";

import { useState } from "react";
import { zelleSentAction } from "./actions";

export default function ZelleSentButton({
  conf,
  kind,
  already,
}: {
  conf: string;
  kind: "registration" | "donation";
  already: boolean;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done">(already ? "done" : "idle");

  if (state === "done") {
    return (
      <div className="mt-7 rounded-2xl px-5 py-4 text-center" style={{ background: "rgba(92,138,58,0.12)" }}>
        <p className="font-semibold" style={{ color: "var(--leaf-deep)" }}>
          ✓ We've noted your payment
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--ink-soft)" }}>
          Watch your inbox for the confirmation email.
        </p>
      </div>
    );
  }

  return (
    <button
      className="btn-primary w-full mt-7 text-lg"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        await zelleSentAction(conf, kind);
        setState("done");
      }}
    >
      {state === "busy" ? "Noting it down…" : "I've sent the Zelle payment →"}
    </button>
  );
}
