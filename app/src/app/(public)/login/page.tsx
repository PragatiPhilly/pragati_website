"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { loginAction } from "@/lib/auth/actions";

function LoginForm() {
  const params = useSearchParams();
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <form action={action} className="festive-card p-8 flex flex-col gap-4">
      <input type="hidden" name="next" value={params.get("next") ?? ""} />
      <label className="text-sm font-semibold">
        Email
        <input name="email" type="email" required className="input mt-1.5" placeholder="you@example.com" />
      </label>
      <label className="text-sm font-semibold">
        Password
        <input name="password" type="password" required className="input mt-1.5" placeholder="••••••••" />
      </label>
      <Link href="/forgot-password" className="text-sm underline underline-offset-4 -mt-2 w-fit" style={{ color: "var(--ink-soft)" }}>
        Forgot password?
      </Link>
      {state?.error && (
        <p className="text-sm font-medium rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
          {state.error}
        </p>
      )}
      <button className="btn-primary mt-2" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-sm text-center" style={{ color: "var(--ink-soft)" }}>
        New to Pragati?{" "}
        <Link href="/signup" className="underline underline-offset-4 font-medium">
          Become a member
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-black mb-2 text-center">Welcome back</h1>
      <p className="text-center mb-8" style={{ color: "var(--ink-soft)" }}>
        Sign in for member pricing and your ticket history.
      </p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
