"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMagazineAction, finalizeMagazineUploadAction } from "./actions";

type Mag = { id: string; year: number; title: string; bytes: number; uploadedAt: string };

/** Serverless functions cap request bodies at 4.5 MB — anything near that must
 *  go browser → Blob directly. We keep a margin. */
const SERVER_ROUTE_LIMIT = 4 * 1024 * 1024;

function fmtBytes(n: number) {
  if (n > 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export default function MagazineManager({
  magazines,
  blobEnabled,
  blobAccess = "public",
}: {
  magazines: Mag[];
  blobEnabled: boolean;
  blobAccess?: "public" | "private";
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(0);
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const done = () => {
    if (fileRef.current) fileRef.current.value = "";
    setFileName("");
    setFileSize(0);
    setTitle("");
    setProgress(null);
    router.refresh();
  };

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Choose a PDF first.");
    setBusy(true);
    setError("");
    setProgress(null);

    try {
      // Big files (and anything on Blob-backed production) go straight from the
      // browser to Blob storage — never through a serverless function, which
      // would reject the body at 4.5 MB.
      if (blobEnabled && file.size > SERVER_ROUTE_LIMIT) {
        const { upload: blobUpload } = await import("@vercel/blob/client");
        setProgress(0);
        const result = await blobUpload(`magazines/pragati-magazine-${year}.pdf`, file, {
          // must match the store's real mode, or the token and upload disagree
          access: blobAccess,
          handleUploadUrl: "/api/admin/magazines/upload-url",
          contentType: "application/pdf",
          multipart: true, // parallel chunks + retries: survives a flaky connection
          onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
        });
        const fin = await finalizeMagazineUploadAction({
          year: Number(year),
          title,
          url: result.url,
          pathname: result.pathname,
          bytes: file.size,
        });
        if (!fin.ok) setError(fin.error);
        else done();
      } else {
        const form = new FormData();
        form.set("file", file);
        form.set("year", year);
        form.set("title", title);
        const res = await fetch("/api/admin/magazines/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) setError(data.error ?? "Upload failed.");
        else done();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        /413|payload|too large/i.test(msg)
          ? "That file is too large for this route. Blob storage isn't configured — connect a Blob store in Vercel → Storage."
          : msg || "Upload failed — check your connection and try again."
      );
      setProgress(null);
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
              const f = e.target.files?.[0];
              setFileName(f?.name ?? "");
              setFileSize(f?.size ?? 0);
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
              {fileSize > 0 && <span style={{ color: "var(--ink-soft)" }}> · {fmtBytes(fileSize)}</span>}
            </span>
          </div>

          {progress !== null && (
            <div>
              <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--accent-soft)" }}>
                <div
                  className="h-full rounded-full transition-[width] duration-200"
                  style={{ width: `${progress}%`, background: "var(--sindoor)" }}
                />
              </div>
              <p className="text-xs mt-1.5" style={{ color: "var(--ink-soft)" }}>
                {progress < 100
                  ? `Uploading directly to storage — ${progress}%`
                  : "Upload complete — saving…"}
              </p>
            </div>
          )}
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
            PDF only, up to 300 MB — large files upload straight to storage, so they aren&apos;t limited by the
            server. Uploading for a year that already has a magazine replaces it.
            {fileSize > 40 * 1024 * 1024 && (
              <span className="block mt-1" style={{ color: "var(--sindoor)" }}>
                Heads up: {fmtBytes(fileSize)} is a big download for phone readers. Compressing the PDF (Preview →
                Export → Reduce File Size, or ilovepdf.com) usually cuts it by 70–90% with no visible loss.
              </span>
            )}
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
