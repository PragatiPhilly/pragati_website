"use client";

import { useEffect, useState } from "react";

export default function Countdown({ target }: { target: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (now === null) return <div className="h-16" />;
  const diff = Math.max(0, new Date(target).getTime() - now);
  const d = Math.floor(diff / 86400_000);
  const h = Math.floor((diff % 86400_000) / 3600_000);
  const m = Math.floor((diff % 3600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);

  const cell = (v: number, label: string) => (
    <div className="flex flex-col items-center">
      <span className="font-[family-name:var(--font-display)] text-3xl md:text-4xl font-bold tabular-nums" style={{ color: "var(--sindoor)" }}>
        {String(v).padStart(2, "0")}
      </span>
      <span className="text-[11px] uppercase tracking-widest" style={{ color: "var(--ink-soft)" }}>
        {label}
      </span>
    </div>
  );

  return (
    <div className="flex items-start gap-5">
      {cell(d, "days")}
      <span className="text-3xl font-light mt-0.5" style={{ color: "var(--ink-soft)" }}>:</span>
      {cell(h, "hrs")}
      <span className="text-3xl font-light mt-0.5" style={{ color: "var(--ink-soft)" }}>:</span>
      {cell(m, "min")}
      <span className="text-3xl font-light mt-0.5" style={{ color: "var(--ink-soft)" }}>:</span>
      {cell(s, "sec")}
    </div>
  );
}
