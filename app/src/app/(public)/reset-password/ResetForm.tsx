"use client";

import { useActionState } from "react";
import Link from "next/link";
import { resetPasswordAction } from "./actions";

export default function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPasswordAction, undefined);

  if (state?.done) {
    return (
      <div className="festive-card p-8 text-center">
        <p className="text-4xl mb-3">✅</p>
        <p className="font-semibold mb-2">Password set!</p>
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          You can sign in with it right away.
        </p>
        <Link href="/login" className="btn-primary !py-2.5 !px-8 text-sm">
          Sign in →
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="festive-card p-8 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <label className="text-sm font-semibold">
        New password
        <input name="password" type="password" required minLength={8} className="input mt-1.5" placeholder="8+ characters" autoFocus />
      </label>
      <label className="text-sm font-semibold">
        Confirm password
        <input name="confirm" type="password" required minLength={8} className="input mt-1.5" placeholder="Same again" />
      </label>
      {state?.error && (
        <p className="text-sm font-medium rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
          {state.error}
        </p>
      )}
      <button className="btn-primary mt-2" disabled={pending}>
        {pending ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}
