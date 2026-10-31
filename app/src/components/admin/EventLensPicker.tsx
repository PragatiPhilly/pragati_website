"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLensAction } from "@/app/admin/lens-actions";
import type { LensOption } from "@/lib/seasons";

const STATE_LABEL: Record<LensOption["state"], string> = { current: "current", past: "past", upcoming: "upcoming", draft: "draft" };

export default function EventLensPicker({
  current,
  options,
  note,
}: {
  current: { id: string; name: string; isCurrent: boolean };
  options: LensOption[];
  note?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (id: string) =>
    start(async () => {
      const opt = options.find((o) => o.id === id);
      await setLensAction(opt?.state === "current" ? null : id);
      router.refresh();
    });
  const currentOpt = options.find((o) => o.state === "current");

  return (
    <div
      className="rounded-2xl px-4 py-3 mb-5 flex flex-wrap items-center gap-x-3 gap-y-2"
      style={
        current.isCurrent
          ? { background: "var(--accent-soft)" }
          : { background: "#FFF1CC", border: "2px solid #E0A100", color: "#4A2E00" }
      }
    >
      <span className="text-sm font-bold">{current.isCurrent ? "Showing" : "📦 Archive view —"}</span>
      <select
        className="input !w-auto !py-1.5 !px-3 text-sm font-bold"
        value={current.id}
        disabled={pending}
        onChange={(e) => pick(e.target.value)}
        aria-label="Which event to show"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} · {STATE_LABEL[o.state]}
          </option>
        ))}
      </select>
      {!current.isCurrent && currentOpt && (
        <button className="btn-primary !py-1.5 !px-4 text-sm" disabled={pending} onClick={() => pick(currentOpt.id)}>
          ← Back to {currentOpt.name}
        </button>
      )}
      <span className="text-xs" style={{ opacity: 0.8 }}>
        {pending
          ? "Loading…"
          : current.isCurrent
            ? note ?? "Pick a past event to load its numbers."
            : "You're looking at a past event's data. Nothing here is changed by looking."}
      </span>
    </div>
  );
}
