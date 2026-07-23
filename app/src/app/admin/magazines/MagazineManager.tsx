"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMagazineAction } from "./actions";

type Mag = { id: string; year: number; title: string; bytes: number; uploadedAt: string };

function fmtBytes(n: number) {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default function MagazineManager({ magazines }: { magazines: Mag[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [pending, startTransition] = useTransition();

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a PDF first.");
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    form.set("year", year);
    form.set("title", title);
    try {
      const res = await fetch("/api/admin/magazines/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
      } else {
        if (fileRef.current) fileRef.current.value = "";
        setFileName("");
        setTitle("");
        router.refresh();
      }
    } catch {
      setError("Upload failed — check your connection and try again.");
    }
    setBusy(false);
  };

  return (
    <div className="grid gap-6">
      {/* ── upload ─────────────────────────────────────────────── */}
      <div className="festive-card p-5">
        <p className="font-bold mb-3">📤 Upload a magazine</p>
        <div className="grid gap-3">
          <div className="flex gap-3 flex-wrap">
            <label className="grid gap-1 text-xs font-semibold" style={{ color: "var(--ink-soft)" }}>
              Year
              <input
                className="input !w-28"
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold flex-1 min-w-48" style={{ color: "var(--ink-soft)" }}>
              Title (optional)
              <input
                className="input"
                placeholder={`Pragati Patrika · ${year}`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? "");
              setError("");
            }}
          />
          <div
            className="flex items-center gap-3 flex-wrap rounded-xl px-4 py-3"
            style={{ border: "1.5px dashed var(--line)", background: "var(--bg-soft)" }}
          >
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary !py-2 !px-4 text-sm">
              {fileName ? "Change PDF" : "📄 Choose PDF…"}
            </button>
            <span className="text-sm truncate" style={{ color: fileName ? "var(--ink)" : "var(--ink-soft)" }}>
              {fileName || "No file chosen yet"}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button
              className="btn-primary !py-2.5 !px-6 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={busy || !fileName}
              onClick={upload}
            >
              {busy ? "Uploading…" : "Upload PDF"}
            </button>
            {!fileName && !error && (
              <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                Choose a PDF to enable upload
              </span>
            )}
            {error && (
              <p className="text-sm font-medium" style={{ color: "var(--sindoor)" }}>
                {error}
              </p>
            )}
          </div>
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            PDF only, up to 50 MB. Uploading for a year that already has a magazine replaces it.
          </p>
        </div>
      </div>

      {/* ── existing ───────────────────────────────────────────── */}
      <div className="grid gap-3">
        {magazines.length === 0 && (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            No magazines uploaded yet — the homepage section will invite visitors to pick up a print copy
            until the first PDF goes up.
          </p>
        )}
        {magazines.map((m) => (
          <div key={m.id} className="festive-card p-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="font-semibold">
                📖 {m.title} <span className="font-mono text-xs ml-1" style={{ color: "var(--ink-soft)" }}>{m.year}</span>
              </p>
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                {fmtBytes(m.bytes)} · uploaded {m.uploadedAt}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <a
                href={`/api/magazines/${m.year}`}
                className="text-sm underline underline-offset-4 font-semibold"
                target="_blank"
                rel="noreferrer"
              >
                view
              </a>
              <button
                className="text-xs underline underline-offset-4 opacity-70 hover:opacity-100"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Delete the ${m.year} magazine?`)) {
                    startTransition(() => deleteMagazineAction(m.id));
                  }
                }}
              >
                delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
