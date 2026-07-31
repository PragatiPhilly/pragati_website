"use client";

/**
 * Homepage magazine section — the cover stack plus a year-picker popup.
 * When magazines exist, any cover (or the button) opens the popup; picking a
 * year downloads that PDF. With none uploaded yet, it falls back to the
 * "pick up a print copy" note.
 */
import { useEffect, useState } from "react";

export type MagazineItem = { year: number; title: string; coverUrl?: string | null };

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

/** 2025 → "২০২৫" */
export function toBengaliDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

/**
 * Bengali era (বঙ্গাব্দ) year for a Pujo issue.
 *
 * The Bengali new year, Pohela Boishakh, falls in mid-April — and the patrika
 * is published at Durga Pujo in the autumn, always after it. So the Bengali
 * year is simply the Gregorian year minus 593: 2025 CE → ১৪৩২ বঙ্গাব্দ.
 */
export function bengaliEraYear(gregorianYear: number): number {
  return gregorianYear - 593;
}

/** "১৪৩২ বঙ্গাব্দ" — what a Bengali magazine actually prints on its cover. */
export function bengaliEraLabel(gregorianYear: number): string {
  return `${toBengaliDigits(bengaliEraYear(gregorianYear))} বঙ্গাব্দ`;
}

export default function MagazineShelf({ magazines }: { magazines: MagazineItem[] }) {
  const [open, setOpen] = useState(false);
  const has = magazines.length > 0;

  // stack shows the three most recent issues (real when available, decorative otherwise)
  const covers: MagazineItem[] = has
    ? magazines.slice(0, 3)
    : [{ year: 2024, title: "" }, { year: 2023, title: "" }, { year: 2022, title: "" }];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="mag-stack pr-10 bg-transparent border-0 p-0 text-left"
        style={{ cursor: has ? "pointer" : "default" }}
        onClick={() => has && setOpen(true)}
        aria-label={has ? "Open the magazine archive" : undefined}
        disabled={!has}
      >
        {covers.map((m) =>
          m.coverUrl ? (
            // Real page-1 artwork. The year sits in a gradient scrim along the
            // bottom so it stays legible over any cover.
            <div key={m.year} className="mag-cover mag-cover--art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.coverUrl} alt={`${m.title || "Pragati Patrika"} — ${m.year} cover`} loading="lazy" />
              <span className="scrim">
                <span className="era">{bengaliEraLabel(m.year)}</span>
                <span className="year">{m.year}</span>
              </span>
            </div>
          ) : (
            <div key={m.year} className="mag-cover">
              <div>
                <span className="label">{bengaliEraLabel(m.year)}</span>
                <div className="rule" />
              </div>
              <h4>
                <span className="bn">প্রগতি</span>Pragati
              </h4>
              <div>
                <div className="rule" />
                <span className="year">{m.year}</span>
              </div>
            </div>
          )
        )}
      </button>

      {has && (
        <button className="btn-primary mt-6 !py-3 !px-7" onClick={() => setOpen(true)}>
          📖 Read the magazine
        </button>
      )}

      {/* ── year-picker popup ──────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-[90] grid place-items-center px-5"
          style={{ background: "rgba(20,12,8,0.55)", backdropFilter: "blur(6px)" }}
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Choose a magazine year"
        >
          <div
            className="w-full max-w-lg rounded-3xl p-7 max-h-[85vh] overflow-y-auto"
            style={{ background: "var(--cream, #fdf6ec)", boxShadow: "0 30px 80px rgba(0,0,0,0.4)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-1">
              <h3 className="font-[family-name:var(--font-display)] text-2xl font-black">
                <span className="font-[family-name:var(--font-bangla)] block text-base font-normal" style={{ color: "var(--terracotta)" }}>
                  প্রগতি পত্রিকা
                </span>
                The Pragati archive
              </h3>
              <button
                className="rounded-full w-9 h-9 grid place-items-center font-bold shrink-0"
                style={{ background: "var(--accent-soft)" }}
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <p className="text-sm mb-5" style={{ color: "var(--ink-soft)" }}>
              Pick a year — the PDF downloads straight to your device.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {magazines.map((m) => (
                <a
                  key={m.year}
                  href={`/api/magazines/${m.year}`}
                  className="group rounded-2xl overflow-hidden text-center transition-transform hover:-translate-y-0.5"
                  style={{
                    background: "linear-gradient(160deg, var(--sindoor, #c8102e), #7e1020)",
                    color: "#fff",
                    boxShadow: "0 10px 26px -10px rgba(0,0,0,0.45)",
                  }}
                  download
                >
                  {m.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.coverUrl}
                      alt=""
                      loading="lazy"
                      className="w-full block"
                      style={{ aspectRatio: "3 / 4", objectFit: "cover" }}
                    />
                  )}
                  <span className="block p-4">
                    <span className="block text-[11px] font-semibold tracking-wide opacity-85 font-[family-name:var(--font-bangla)]">
                      {bengaliEraLabel(m.year)}
                    </span>
                    <span className="block font-[family-name:var(--font-display)] text-3xl font-black my-1">{m.year}</span>
                    <span className="block text-[11px] font-semibold opacity-90 group-hover:opacity-100">⤓ Download PDF</span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
