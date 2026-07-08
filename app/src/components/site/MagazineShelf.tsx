"use client";

/**
 * Homepage magazine section — the cover stack plus a year-picker popup.
 * When magazines exist, any cover (or the button) opens the popup; picking a
 * year downloads that PDF. With none uploaded yet, it falls back to the
 * "pick up a print copy" note.
 */
import { useEffect, useState } from "react";

export type MagazineItem = { year: number; title: string };

function roman(n: number): string {
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  for (const [v, s] of table) while (n >= v) { out += s; n -= v; }
  return out;
}

export default function MagazineShelf({
  magazines,
  firstYear = 2012, // Vol. I
}: {
  magazines: MagazineItem[];
  firstYear?: number;
}) {
  const [open, setOpen] = useState(false);
  const has = magazines.length > 0;

  // stack shows the three most recent years (real when available, decorative otherwise)
  const coverYears = has
    ? magazines.slice(0, 3).map((m) => m.year)
    : [2024, 2023, 2022];

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
        {coverYears.map((y) => (
          <div key={y} className="mag-cover">
            <div>
              <span className="label">Vol. {roman(Math.max(1, y - firstYear + 1))}</span>
              <div className="rule" />
            </div>
            <h4>
              <span className="bn">প্রগতি</span>Pragati
            </h4>
            <div>
              <div className="rule" />
              <span className="year">{y}</span>
            </div>
          </div>
        ))}
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
                  className="group rounded-2xl p-4 text-center transition-transform hover:-translate-y-0.5"
                  style={{ background: "linear-gradient(160deg, var(--sindoor, #c8102e), #7e1020)", color: "#fff" }}
                  download
                >
                  <p className="text-[10px] font-bold uppercase tracking-[0.25em] opacity-80">
                    Vol. {roman(Math.max(1, m.year - firstYear + 1))}
                  </p>
                  <p className="font-[family-name:var(--font-display)] text-3xl font-black my-1">{m.year}</p>
                  <p className="text-[11px] font-semibold opacity-90 group-hover:opacity-100">⤓ Download PDF</p>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
