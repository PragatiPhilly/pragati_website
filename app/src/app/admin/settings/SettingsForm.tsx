"use client";

import { useState, useTransition } from "react";
import { saveSettingsAction } from "./actions";

type Group = { title: string; note?: string; keys: { key: string; label: string; type?: "number" | "text" | "toggle" }[] };

export default function SettingsForm({
  groups,
  values,
  readOnly,
}: {
  groups: Group[];
  values: Record<string, unknown>;
  readOnly: boolean;
}) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.flatMap((g) => g.keys.map((k) => [k.key, String(values[k.key] ?? "")])))
  );
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="grid gap-6">
      {groups.map((g) => (
        <div key={g.title} className="festive-card p-6">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold mb-1">{g.title}</h2>
          {g.note && (
            <p className="text-xs mb-4 rounded-lg px-3 py-2" style={{ background: "var(--accent-soft)", color: "var(--ink-soft)" }}>
              {g.note}
            </p>
          )}
          <div className="grid gap-4 mt-3">
            {g.keys.map((k) =>
              k.type === "toggle" ? (
                <div key={k.key} className="flex items-center justify-between gap-4 text-sm font-semibold">
                  <span>{k.label}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={form[k.key] === "yes"}
                    disabled={readOnly}
                    onClick={() => {
                      setSaved(false);
                      setForm((f) => ({ ...f, [k.key]: f[k.key] === "yes" ? "no" : "yes" }));
                    }}
                    className="relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-50"
                    style={{ background: form[k.key] === "yes" ? "#2e7d32" : "var(--line)" }}
                  >
                    <span
                      className="absolute top-1 left-1 w-5 h-5 rounded-full transition-transform"
                      style={{ background: "#fff", transform: form[k.key] === "yes" ? "translateX(20px)" : "none" }}
                    />
                  </button>
                </div>
              ) : (
                <label key={k.key} className="text-sm font-semibold">
                  {k.label}
                  <input
                    className="input mt-1.5 font-normal"
                    type={k.type === "number" ? "number" : "text"}
                    value={form[k.key] ?? ""}
                    disabled={readOnly}
                    onChange={(e) => {
                      setSaved(false);
                      setForm((f) => ({ ...f, [k.key]: e.target.value }));
                    }}
                  />
                </label>
              )
            )}
          </div>
        </div>
      ))}
      {!readOnly && (
        <button
          className="btn-primary w-fit"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await saveSettingsAction(form);
              setSaved(true);
            })
          }
        >
          {pending ? "Saving…" : saved ? "Saved ✓" : "Save settings"}
        </button>
      )}
    </div>
  );
}
