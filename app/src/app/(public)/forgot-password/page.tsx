"use client";

import { useActionState } from "react";
import Link from "next/link";
import { forgotPasswordAction } from "./actions";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(forgotPasswordAction, undefined);

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-black mb-2 text-center">Forgot your password?</h1>
      <p className="text-center mb-8" style={{ color: "var(--ink-soft)" }}>
        No worries — we&apos;ll email you a reset link.
      </p>
      {state?.done ? (
        <div className="festive-card p-8 text-center">
          <p className="text-4xl mb-3">📬</p>
          <p className="font-semibold mb-2">Check your inbox</p>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            If an account exists for that email, a reset link is on its way. It works once and expires in 1 hour.
            (Check spam too.)
          </p>
          <Link href="/login" className="btn-secondary mt-6 inline-flex !py-2 !px-6 text-sm">
            ← Back to sign in
          </Link>
        </div>
      ) : (
        <form action={action} className="festive-card p-8 flex flex-col gap-4">
          <label className="text-sm font-semibold">
            Email
            <input name="email" type="email" required className="input mt-1.5" placeholder="you@example.com" autoFocus />
          </label>
          <button className="btn-primary mt-2" disabled={pending}>
            {pending ? "Sending…" : "Email me a reset link"}
          </button>
          <p className="text-sm text-center" style={{ color: "var(--ink-soft)" }}>
            Remembered it? <Link href="/login" className="underline underline-offset-4 font-medium">Sign in</Link>
          </p>
        </form>
      )}
    </div>
  );
}
