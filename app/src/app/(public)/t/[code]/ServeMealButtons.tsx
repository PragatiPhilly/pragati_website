"use client";

/**
 * Serving-line buttons on the live ticket page — the fallback path for
 * phones without an in-page scanner (iOS camera app opens this page).
 * One button per OPEN food window; result flashes the food color code.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { serveTicketAction, type ServeResult } from "@/app/admin/scans/actions";

type OpenSession = { id: string; label: string; servedAt: string | null };

const FOOD_LABEL: Record<string, string> = {
  veg: "🥬 VEG",
  non_veg: "🐟 NON-VEG",
  kid: "🍚 KID'S MEAL",
  none: "no food",
};

export default function ServeMealButtons({
  ticketId,
  sessions,
  colors,
}: {
  ticketId: string;
  sessions: OpenSession[];
  colors: { veg: string; non_veg: string; kid: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ServeResult | null>(null);

  const foodColor = (food: string) =>
    food === "veg" ? colors.veg : food === "non_veg" ? colors.non_veg : food === "kid" ? colors.kid : "#6b7280";

  return (
    <div className="mt-6 grid gap-3">
      {result && result.kind === "served" && (
        <div className="rounded-2xl px-5 py-5 text-center text-white" style={{ background: foodColor(result.food) }}>
          <p className="text-2xl font-black">{FOOD_LABEL[result.food] ?? result.food}</p>
          <p className="text-sm mt-1 opacity-90">
            ✓ {result.attendee} · {result.sessionLabel} · {result.count} served
          </p>
        </div>
      )}
      {result && result.kind === "duplicate" && (
        <div className="rounded-2xl px-5 py-5 text-center text-white" style={{ background: "#8f1d1d" }}>
          <p className="text-xl font-black">⛔ ALREADY SERVED</p>
          <p className="text-sm mt-1 opacity-90">
            {result.attendee} went through {result.sessionLabel} at {result.scannedAt}.
          </p>
        </div>
      )}
      {result && result.kind === "invalid" && (
        <div className="rounded-2xl px-4 py-3 text-center text-white" style={{ background: "#6b7280" }}>
          <p className="text-sm font-bold">{result.reason}</p>
        </div>
      )}

      {sessions.map((s) =>
        s.servedAt ? (
          <p key={s.id} className="text-sm rounded-xl px-4 py-3 font-semibold text-center" style={{ background: "var(--accent-soft)", color: "#8f1d1d" }}>
            ⛔ {s.label}: already served at {s.servedAt}
          </p>
        ) : (
          <button
            key={s.id}
            className="btn-secondary w-full !py-3.5 justify-center"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await serveTicketAction(s.id, ticketId);
              setResult(r);
              setBusy(false);
              setTimeout(() => router.refresh(), 1200);
            }}
          >
            🍛 Serve {s.label}
          </button>
        )
      )}
    </div>
  );
}
