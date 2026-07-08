"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "@/lib/auth/actions";

export default function SignupForm({ priceLabel }: { priceLabel: string }) {
  const [state, action, pending] = useActionState(signupAction, undefined);

  return (
    <div className="mx-auto max-w-lg px-5 py-16">
      <h1 className="font-[family-name:var(--font-display)] text-4xl font-black mb-2 text-center">Join the Pragati family</h1>
      <p className="text-center mb-8" style={{ color: "var(--ink-soft)" }}>
        One account per family · {priceLabel}/year · member pricing on every event
      </p>
      <form action={action} className="festive-card p-8 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-semibold">
            First name
            <input name="firstName" required className="input mt-1.5" />
          </label>
          <label className="text-sm font-semibold">
            Last name
            <input name="lastName" required className="input mt-1.5" />
          </label>
        </div>
        <label className="text-sm font-semibold">
          Family name <span className="font-normal" style={{ color: "var(--ink-soft)" }}>(how we'll greet you — optional)</span>
          <input name="familyName" placeholder="e.g. Kundu family" className="input mt-1.5" />
        </label>
        <label className="text-sm font-semibold">
          Phone
          <input name="phone" type="tel" className="input mt-1.5" placeholder="+1 (267) 555-0123" />
        </label>
        <label className="text-sm font-semibold">
          Email
          <input name="email" type="email" required className="input mt-1.5" />
        </label>
        <label className="text-sm font-semibold">
          Password
          <input name="password" type="password" required minLength={8} className="input mt-1.5" placeholder="8+ characters" />
        </label>
        {state?.error && (
          <p className="text-sm font-medium rounded-xl px-4 py-3" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
            {state.error}
          </p>
        )}
        <button className="btn-primary mt-2" disabled={pending}>
          {pending ? "Creating your account…" : "Create account → pay dues"}
        </button>
        <p className="text-sm text-center" style={{ color: "var(--ink-soft)" }}>
          Already a member?{" "}
          <Link href="/login" className="underline underline-offset-4 font-medium">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
