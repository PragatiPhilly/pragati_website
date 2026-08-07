"use client";

import { useState, useTransition } from "react";
import { startMembershipCardCheckout, declareMembershipZelleSent } from "./actions";

/**
 * Tells the treasurer a Zelle is on its way, which puts the dues into the
 * pending-Zelle queue. Without this the payment existed nowhere until someone
 * manually spotted it in the bank feed.
 */
export function MembershipZelleSent() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (done) {
    return (
      <p className="mt-4 text-sm rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)" }}>
        ✅ Thanks — we&apos;ve told our treasurer to look for it. Your membership activates once the payment is
        confirmed, and you&apos;ll get a welcome email then.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <button
        className="btn-secondary w-full justify-center"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setErr(null);
            const r = await declareMembershipZelleSent();
            if (r.ok) setDone(true);
            else setErr(r.error ?? "Something went wrong — please try again.");
          })
        }
      >
        {pending ? "One moment…" : "I've sent the Zelle →"}
      </button>
      {err && <p className="mt-2 text-sm" style={{ color: "var(--sindoor)" }}>{err}</p>}
    </div>
  );
}

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
