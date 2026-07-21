"use client";

import { useState, useTransition } from "react";
import { startMembershipCardCheckout } from "./actions";

export default function MembershipPayButtons() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <button
        className="btn-primary w-full justify-center"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            const r = await startMembershipCardCheckout();
            if (r.url) window.location.href = r.url;
            else setErr(r.error ?? "Something went wrong — please try again.");
          })
        }
      >
        {pending ? "One moment…" : "Pay dues by card →"}
      </button>
      {err && <p className="mt-2 text-sm" style={{ color: "var(--sindoor)" }}>{err}</p>}
    </div>
  );
}
