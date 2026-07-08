"use client";

import { useState } from "react";
import { submitContactAction } from "./actions";

const TOPICS = [
  { value: "general", label: "General enquiry" },
  { value: "membership", label: "Membership" },
  { value: "events", label: "Events & tickets" },
  { value: "sponsorship", label: "Sponsorship" },
  { value: "volunteer", label: "Volunteering" },
  { value: "donation", label: "Donations" },
];

export default function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await submitContactAction({
      name: fd.get("name"),
      email: fd.get("email"),
      phone: fd.get("phone"),
      topic: fd.get("topic"),
      message: fd.get("message"),
    });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error ?? "Something went wrong.");
  }

  if (done) {
    return (
      <div className="festive-card p-8 text-center" style={{ boxShadow: "var(--shadow)" }}>
        <p className="text-4xl mb-3">🪔</p>
        <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold">Thank you!</h3>
        <p className="font-[family-name:var(--font-bangla)] mt-1" style={{ color: "var(--sindoor)" }}>
          আপনার বার্তা পৌঁছেছে
        </p>
        <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
          Your message is on its way to the Pragati team. We&apos;ll get back to you soon.
        </p>
      </div>
    );
  }

  const inputCls = "w-full rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--sindoor)] transition-colors";
  const inputStyle: React.CSSProperties = {
    background: "var(--card)",
    border: "1px solid var(--line)",
  };

  return (
    <form onSubmit={onSubmit} className="festive-card p-6 md:p-8 grid gap-4" style={{ boxShadow: "var(--shadow)" }}>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Your name *</span>
          <input name="name" required maxLength={120} className={inputCls} style={inputStyle} placeholder="e.g. Rahul Sen" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Email *</span>
          <input name="email" type="email" required className={inputCls} style={inputStyle} placeholder="you@example.com" />
        </label>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">Phone <span className="font-normal" style={{ color: "var(--ink-soft)" }}>(optional)</span></span>
          <input name="phone" maxLength={40} className={inputCls} style={inputStyle} placeholder="(610) 555-0123" />
        </label>
        <label className="grid gap-1.5">
          <span className="text-sm font-semibold">What is this about?</span>
          <select name="topic" defaultValue="general" className={inputCls} style={inputStyle}>
            {TOPICS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1.5">
        <span className="text-sm font-semibold">Message *</span>
        <textarea name="message" required rows={6} maxLength={4000} className={inputCls} style={inputStyle} placeholder="How can the Pragati team help you?" />
      </label>

      {error && (
        <p className="text-sm rounded-lg px-3 py-2" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <button type="submit" disabled={busy} className="btn-primary !px-8 justify-center">
          {busy ? "Sending…" : "Send message →"}
        </button>
        <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
          We usually reply within a couple of days.
        </p>
      </div>
    </form>
  );
}
