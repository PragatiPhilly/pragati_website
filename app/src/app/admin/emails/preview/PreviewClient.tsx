"use client";

/**
 * Email previews — see every template rendered inline, and send real copies of
 * any subset to one inbox so they can be checked on a phone.
 *
 * The inline preview uses an iframe with srcDoc, which renders the same HTML the
 * mail providers receive. It's a faithful preview of the markup, but Gmail's
 * mobile app is the only way to be sure of the last mile — hence the send.
 */
import { useState, useTransition } from "react";
import { sendTestEmailsAction } from "./actions";

type Sample = {
  key: string;
  label: string;
  description: string;
  subject: string;
  text: string;
  html: string;
};

export default function PreviewClient({
  samples,
  defaultEmail,
  replyTo,
  isTest,
  testOverride,
}: {
  samples: Sample[];
  defaultEmail: string;
  replyTo: string;
  isTest: boolean;
  testOverride: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [selected, setSelected] = useState<string[]>(samples.map((s) => s.key));
  const [open, setOpen] = useState<string>(samples[0]?.key ?? "");
  const [view, setView] = useState<"html" | "text">("html");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const send = (keys: string[]) =>
    startTransition(async () => {
      setMsg(null);
      const r = await sendTestEmailsAction(email, keys);
      setMsg(
        r.ok
          ? { ok: true, text: `Sent ${r.sent} email${r.sent === 1 ? "" : "s"} to ${r.to}. Check the inbox (and spam, once).` }
          : { ok: false, text: r.error }
      );
    });

  const current = samples.find((s) => s.key === open);

  return (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-black mb-1">Email previews</h1>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        Every email the site can send, built from your <strong>live event data</strong> — real pass names, real prices,
        real org details. Preview them here, then send real copies to yourself to check on a phone. Nothing is written
        to registrations or donations.
      </p>

      {isTest && (
        <div className="rounded-xl px-4 py-3 mb-5 text-sm" style={{ background: "var(--accent-soft)" }}>
          <strong>Test mode is on.</strong> All mail is redirected to <strong>{testOverride || "(unset)"}</strong>{" "}
          regardless of the address below.
        </div>
      )}

      {/* ── send bar ─────────────────────────────────────────── */}
      <div className="festive-card p-5 mb-6">
        <div className="flex gap-3 flex-wrap items-end">
          <label className="text-sm font-semibold flex-1 min-w-64">
            Send test copies to
            <input
              className="input mt-1.5"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <button className="btn-primary !px-6" disabled={pending || selected.length === 0} onClick={() => send(selected)}>
            {pending ? "Sending…" : `Send ${selected.length} selected →`}
          </button>
          <button
            className="btn-secondary !px-5"
            disabled={pending || !current}
            onClick={() => current && send([current.key])}
          >
            Send just this one
          </button>
        </div>
        <p className="text-xs mt-3" style={{ color: "var(--ink-soft)" }}>
          Subjects are prefixed <strong>[TEST]</strong> and the text body says it's a test. Replies go to{" "}
          <strong>{replyTo}</strong>.
        </p>
        {msg && (
          <p
            className="text-sm font-medium rounded-xl px-4 py-3 mt-3"
            style={{
              background: msg.ok ? "#EFF7EE" : "var(--accent-soft)",
              color: msg.ok ? "#2F6B2B" : "var(--sindoor)",
            }}
          >
            {msg.text}
          </p>
        )}
      </div>

      <div className="grid md:grid-cols-[280px_1fr] gap-5 items-start">
        {/* ── list ───────────────────────────────────────────── */}
        <div className="grid gap-2">
          <div className="flex gap-2 mb-1">
            <button className="text-xs underline underline-offset-4" onClick={() => setSelected(samples.map((s) => s.key))}>
              select all
            </button>
            <button className="text-xs underline underline-offset-4" onClick={() => setSelected([])}>
              none
            </button>
          </div>
          {samples.map((s) => (
            <div
              key={s.key}
              className="rounded-xl p-3 cursor-pointer transition-colors"
              style={{
                background: open === s.key ? "var(--accent-soft)" : "var(--card)",
                border: `1.5px solid ${open === s.key ? "var(--sindoor)" : "var(--line)"}`,
              }}
              onClick={() => setOpen(s.key)}
            >
              <label className="flex items-start gap-2.5" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  className="accent-[var(--sindoor)] w-4 h-4 mt-0.5"
                  checked={selected.includes(s.key)}
                  onChange={() => toggle(s.key)}
                />
                <span onClick={() => setOpen(s.key)}>
                  <span className="block text-sm font-bold">{s.label}</span>
                  <span className="block text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                    {s.description}
                  </span>
                </span>
              </label>
            </div>
          ))}
        </div>

        {/* ── preview ────────────────────────────────────────── */}
        <div className="festive-card p-4">
          {current ? (
            <>
              <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                <div className="min-w-0">
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    Subject
                  </p>
                  <p className="font-semibold text-sm break-words">{current.subject}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {(["html", "text"] as const).map((v) => (
                    <button
                      key={v}
                      className="rounded-full px-3.5 py-1.5 text-xs font-bold"
                      style={
                        view === v
                          ? { background: "var(--sindoor)", color: "var(--cream)" }
                          : { background: "var(--accent-soft)", color: "var(--ink)" }
                      }
                      onClick={() => setView(v)}
                    >
                      {v === "html" ? "Rendered" : "Plain text"}
                    </button>
                  ))}
                </div>
              </div>

              {view === "html" && current.html ? (
                <iframe
                  title={`${current.label} preview`}
                  srcDoc={current.html}
                  className="w-full rounded-xl"
                  style={{ height: 620, border: "1px solid var(--line)", background: "#fff" }}
                />
              ) : (
                <pre
                  className="text-xs whitespace-pre-wrap rounded-xl p-4 overflow-auto"
                  style={{ background: "var(--accent-soft)", maxHeight: 620 }}
                >
                  {current.text}
                </pre>
              )}
            </>
          ) : (
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
              Pick an email on the left.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
