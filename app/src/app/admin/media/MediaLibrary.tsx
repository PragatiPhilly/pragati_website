"use client";

import { useCallback, useRef, useState } from "react";
import { setPlacementsAction, deleteMediaAction, type Placements } from "./actions";

type Img = {
  id: string;
  fileBase: string;
  width: number;
  height: number;
  variants: number[];
  blurDataUrl: string;
  bytes: number;
  originalName: string | null;
  inCarousel: boolean;
  inSlideshow: boolean;
  eventSlug: string | null;
};

type EventOpt = { slug: string; name: string };

const MAX_EDGE = 2560; // downscale huge originals before upload

function thumbUrl(img: Img) {
  const w = img.variants[0] ?? img.variants[img.variants.length - 1];
  return `/media/${img.fileBase}-${w}.webp`;
}

function normalize(row: Record<string, unknown>): Img {
  return {
    id: String(row.id),
    fileBase: String(row.fileBase),
    width: Number(row.width),
    height: Number(row.height),
    variants: (row.variants as number[]) ?? [],
    blurDataUrl: String(row.blurDataUrl ?? ""),
    bytes: Number(row.bytes ?? 0),
    originalName: (row.originalName as string) ?? null,
    inCarousel: !!row.inCarousel,
    inSlideshow: !!row.inSlideshow,
    eventSlug: (row.eventSlug as string) ?? null,
  };
}

/** Shrink a possibly-huge photo to a web-friendly size in the browser. */
async function downscale(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/webp", 0.92),
    );
    return blob ?? file;
  } catch {
    return file; // server-side sharp will still handle it
  }
}

export default function MediaLibrary({
  initialImages,
  events,
}: {
  initialImages: Img[];
  events: EventOpt[];
}) {
  const [images, setImages] = useState<Img[]>(initialImages);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [assigning, setAssigning] = useState<Img | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0) return;
    setError(null);
    setProgress({ done: 0, total: files.length });
    const added: Img[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const blob = await downscale(files[i]);
        const form = new FormData();
        const name = files[i].name.replace(/\.[^.]+$/, "") + ".webp";
        form.append("files", blob, name);
        const res = await fetch("/api/admin/media/upload", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        for (const row of data.created ?? []) added.push(normalize(row));
        if (data.errors?.length) setError(data.errors.join(" · "));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
      setProgress({ done: i + 1, total: files.length });
    }
    if (added.length) setImages((prev) => [...prev, ...added]);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  return (
    <div>
      {/* ── Upload dropzone ── */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className="rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors"
        style={{
          borderColor: dragOver ? "var(--sindoor)" : "var(--line)",
          background: dragOver ? "var(--accent-soft)" : "var(--card)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        <p className="text-3xl mb-1">🖼️</p>
        <p className="font-semibold">
          {progress
            ? `Optimising & uploading… ${progress.done}/${progress.total}`
            : "Drop photos here, or click to choose"}
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
          JPG, PNG, HEIC, WebP · any size · portrait or landscape — we shrink & convert automatically
        </p>
        {progress && (
          <div className="mt-4 h-1.5 rounded-full overflow-hidden mx-auto max-w-xs" style={{ background: "var(--line)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%`, background: "var(--sindoor)" }}
            />
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm rounded-lg px-3 py-2" style={{ background: "var(--accent-soft)", color: "var(--sindoor)" }}>
          {error}
        </p>
      )}

      {/* ── Grid ── */}
      {images.length === 0 ? (
        <p className="mt-8 text-sm text-center" style={{ color: "var(--ink-soft)" }}>
          No photos yet. Upload a few to get started.
        </p>
      ) : (
        <div className="mt-7 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((img) => (
            <MediaCard
              key={img.id}
              img={img}
              onAssign={() => setAssigning(img)}
              onDeleted={() => setImages((prev) => prev.filter((x) => x.id !== img.id))}
            />
          ))}
        </div>
      )}

      {assigning && (
        <AssignModal
          img={assigning}
          events={events}
          onClose={() => setAssigning(null)}
          onSaved={(next) => {
            setImages((prev) => prev.map((x) => (x.id === next.id ? next : x)));
            setAssigning(null);
          }}
        />
      )}
    </div>
  );
}

function PlacementTags({ img }: { img: Img }) {
  const tags: string[] = [];
  if (img.inCarousel) tags.push("Carousel");
  if (img.inSlideshow) tags.push("Slideshow");
  if (img.eventSlug) tags.push(`Event`);
  if (tags.length === 0) return <span className="text-[11px]" style={{ color: "var(--ink-soft)" }}>Unassigned</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="text-[10px] font-bold uppercase tracking-wide rounded-full px-2 py-0.5"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {t}
        </span>
      ))}
    </div>
  );
}

function MediaCard({
  img,
  onAssign,
  onDeleted,
}: {
  img: Img;
  onAssign: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const portrait = img.height > img.width;

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={{ background: "var(--card)", boxShadow: "var(--shadow)" }}>
      <div className="relative aspect-[4/3]" style={{ backgroundImage: `url(${img.blurDataUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl(img)} alt={img.originalName ?? "photo"} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
        <span className="absolute top-2 left-2 text-[10px] font-bold uppercase rounded px-1.5 py-0.5" style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
          {portrait ? "Portrait" : "Landscape"}
        </span>
      </div>
      <div className="p-3 flex flex-col gap-2.5">
        <PlacementTags img={img} />
        {confirm ? (
          <div className="flex gap-2">
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const r = await deleteMediaAction(img.id);
                setBusy(false);
                if (r.ok) onDeleted();
                else setConfirm(false);
              }}
              className="flex-1 text-xs font-semibold rounded-lg py-2"
              style={{ background: "var(--sindoor)", color: "var(--cream)" }}
            >
              {busy ? "Deleting…" : "Confirm delete"}
            </button>
            <button onClick={() => setConfirm(false)} className="text-xs rounded-lg py-2 px-3" style={{ background: "var(--bg-soft)" }}>
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button onClick={onAssign} className="flex-1 text-xs font-semibold rounded-lg py-2" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
              Assign
            </button>
            <button onClick={() => setConfirm(true)} className="text-xs rounded-lg py-2 px-3 hover:opacity-100 opacity-70" style={{ background: "var(--bg-soft)" }} aria-label="Delete">
              🗑
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function AssignModal({
  img,
  events,
  onClose,
  onSaved,
}: {
  img: Img;
  events: EventOpt[];
  onClose: () => void;
  onSaved: (next: Img) => void;
}) {
  const [draft, setDraft] = useState<Placements>({
    inCarousel: img.inCarousel,
    inSlideshow: img.inSlideshow,
    eventSlug: img.eventSlug,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    const r = await setPlacementsAction(img.id, draft);
    setBusy(false);
    if (r.ok) onSaved({ ...img, ...draft });
    else setErr(r.error ?? "Failed");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: "var(--card)" }} onClick={(e) => e.stopPropagation()}>
        <div className="relative aspect-[16/10]" style={{ backgroundImage: `url(${img.blurDataUrl})`, backgroundSize: "cover", backgroundPosition: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbUrl(img)} alt="" className="absolute inset-0 w-full h-full object-contain" style={{ backdropFilter: "blur(2px)" }} />
        </div>
        <div className="p-5">
          <h3 className="font-[family-name:var(--font-display)] text-xl font-bold mb-1">Where should this photo show?</h3>
          <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
            Pick any combination — a photo can appear in several places.
          </p>

          <div className="grid gap-2.5">
            <Toggle
              label="Homepage carousel"
              hint="“Pragati by the numbers” photo reel"
              checked={draft.inCarousel}
              onChange={(v) => setDraft((d) => ({ ...d, inCarousel: v }))}
            />
            <Toggle
              label="Community slideshow"
              hint="The mission panel on the homepage"
              checked={draft.inSlideshow}
              onChange={(v) => setDraft((d) => ({ ...d, inSlideshow: v }))}
            />
            <div className="rounded-xl p-3" style={{ background: "var(--bg-soft)" }}>
              <label className="text-sm font-semibold">Feature on an event page</label>
              <p className="text-xs mb-2" style={{ color: "var(--ink-soft)" }}>
                Shown centred with a themed border on that event.
              </p>
              <select
                value={draft.eventSlug ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, eventSlug: e.target.value || null }))}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--card)", border: "1px solid var(--line)" }}
              >
                <option value="">— none —</option>
                {events.map((ev) => (
                  <option key={ev.slug} value={ev.slug}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {err && <p className="mt-3 text-sm" style={{ color: "var(--sindoor)" }}>{err}</p>}

          <div className="flex gap-3 mt-5">
            <button onClick={save} disabled={busy} className="btn-primary flex-1 justify-center !py-2.5">
              {busy ? "Saving…" : "Save"}
            </button>
            <button onClick={onClose} className="btn-secondary !py-2.5 !px-5">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 rounded-xl p-3 text-left transition-colors"
      style={{ background: checked ? "var(--accent-soft)" : "var(--bg-soft)" }}
    >
      <span>
        <span className="text-sm font-semibold block">{label}</span>
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>{hint}</span>
      </span>
      <span
        className="w-11 h-6 rounded-full relative shrink-0 transition-colors"
        style={{ background: checked ? "var(--sindoor)" : "var(--line)" }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
          style={{ left: checked ? "22px" : "2px" }}
        />
      </span>
    </button>
  );
}
