"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { verifyPaymentWithSquare } from "./actions";

/**
 * "Confirming your payment…" — but actually confirming it.
 *
 * For the first few seconds we just wait, because the webhook almost always
 * wins that race. If it hasn't, we stop waiting and ASK SQUARE directly, then
 * keep asking on a slow backoff. The buyer no longer depends on a webhook they
 * cannot see, and if something is genuinely wrong they are told so plainly
 * instead of watching a spinner forever. (PRG-2026-0025.)
 */
export default function PendingPayment({ conf }: { conf: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"waiting" | "checking" | "stuck">("waiting");
  const tries = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      tries.current += 1;
      if (tries.current > 2) setPhase("checking");
      try {
        const res = await verifyPaymentWithSquare(conf);
        if (cancelled) return;
        if (res.paid) {
          router.refresh();
          return;
        }
      } catch {
        /* keep trying — a failed check is not a failed payment */
      }
      // 2s, 2s, 4s, 6s, 10s, 15s, 15s… then tell the buyer honestly.
      const delays = [2000, 2000, 4000, 6000, 10000, 15000];
      if (tries.current >= 8) setPhase("stuck");
      timer = setTimeout(tick, delays[Math.min(tries.current, delays.length - 1)]);
    };

    timer = setTimeout(tick, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [conf, router]);

  if (phase === "stuck") {
    return (
      <p style={{ color: "var(--ink-soft)" }}>
        Your card may well have gone through — we just haven&apos;t had confirmation yet, and we&apos;d rather tell you
        that than leave you watching a spinner. <strong>Nothing is lost.</strong> If Square took the money, your tickets
        will arrive by email automatically within a few minutes. If they haven&apos;t after that, reply to your Square
        receipt or contact us with confirmation <strong>{conf}</strong> and we&apos;ll sort it out the same day.
      </p>
    );
  }

  return (
    <p style={{ color: "var(--ink-soft)" }}>
      {phase === "checking" ? "Checking with Square directly…" : "This page updates on its own — usually a few seconds."}
    </p>
  );
}
