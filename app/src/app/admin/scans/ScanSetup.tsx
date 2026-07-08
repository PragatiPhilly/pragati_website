"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  toggleMealWindowAction,
  setSessionStatusAction,
  saveFoodColorsAction,
  type MealKind,
  type ScanSessionInfo,
} from "./actions";

type State = {
  event: { id: string; name: string; days: { key: string; label: string; date: string }[] };
  sessions: ScanSessionInfo[];
  colors: { veg: string; non_veg: string; kid: string };
};

const MEALS: { kind: MealKind; label: string; icon: string }[] = [
  { kind: "breakfast", label: "Breakfast", icon: "🌅" },
  { kind: "lunch", label: "Lunch", icon: "☀️" },
  { kind: "dinner", label: "Dinner", icon: "🌙" },
];

const FOOD_LABEL: Record<string, string> = { veg: "Veg", non_veg: "Non-veg", kid: "Kid", none: "No food" };

export default function ScanSetup({
  state,
  entryStats,
}: {
  state: State;
  entryStats: { checked: number; total: number };
}) {
  const [pending, startTransition] = useTransition();
  const [colors, setColors] = useState(state.colors);
  const [colorsSaved, setColorsSaved] = useState(false);

  // events without a days list still get one "all" column
  const days = state.event.days.length > 0 ? state.event.days : [{ key: "all", label: "Event", date: "" }];

  const find = (kind: string, dayKey: string) =>
    state.sessions.find((s) => s.kind === kind && s.dayKey === dayKey);

  const openSessions = state.sessions.filter((s) => s.status === "open");

  return (
    <div className="grid gap-6">
      {/* ── entry check-in (always on) ─────────────────────────── */}
      <div className="festive-card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-bold">🎟 Entry check-in</p>
            <p className="text-xs mt-1" style={{ color: "var(--ink-soft)" }}>
              Always on. One scan per pass for the whole event — a second scan of the same QR is flagged
              at the desk.
            </p>
          </div>
          <div className="text-right">
            <p className="font-[family-name:var(--font-display)] text-3xl font-black" style={{ color: "var(--sindoor)" }}>
              {entryStats.checked}
              <span className="text-base font-semibold" style={{ color: "var(--ink-soft)" }}> / {entryStats.total}</span>
            </p>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>checked in</p>
          </div>
        </div>
      </div>

      {/* ── meal windows grid ──────────────────────────────────── */}
      <div className="festive-card p-5">
        <p className="font-bold mb-1">🍛 Food scans</p>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          Enable only the meals you&apos;re serving. On event day, <strong>Open</strong> a window when the line
          starts and <strong>Close</strong> it when serving ends — a pass scans once per window.
        </p>
        <div className="grid gap-4">
          {days.map((day) => (
            <div key={day.key}>
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--terracotta)" }}>
                {day.label}
              </p>
              <div className="grid sm:grid-cols-3 gap-2">
                {MEALS.map((meal) => {
                  const sess = find(meal.kind, day.key);
                  return (
                    <div
                      key={meal.kind}
                      className="rounded-xl border p-3"
                      style={{
                        borderColor: sess?.status === "open" ? "var(--leaf-deep)" : "var(--line)",
                        background: sess?.status === "open" ? "rgba(92,138,58,0.08)" : "transparent",
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          {meal.icon} {meal.label}
                        </span>
                        {sess && (
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
                            style={{
                              background: sess.status === "open" ? "var(--leaf-deep)" : "var(--accent-soft)",
                              color: sess.status === "open" ? "var(--cream)" : "var(--ink-soft)",
                            }}
                          >
                            {sess.status === "open" ? "LIVE" : "closed"}
                          </span>
                        )}
                      </div>

                      {!sess ? (
                        <button
                          className="mt-2 text-xs underline underline-offset-4 opacity-70 hover:opacity-100"
                          disabled={pending}
                          onClick={() => startTransition(() => toggleMealWindowAction(meal.kind, day.key, true))}
                        >
                          + Use this scan
                        </button>
                      ) : (
                        <>
                          <p className="text-xs mt-1.5" style={{ color: "var(--ink-soft)" }}>
                            {sess.total} served
                            {sess.total > 0 && (
                              <span>
                                {" — "}
                                {Object.entries(sess.byFood)
                                  .map(([k, n]) => `${FOOD_LABEL[k] ?? k} ${n}`)
                                  .join(" · ")}
                              </span>
                            )}
                          </p>
                          <div className="flex gap-2 mt-2">
                            {sess.status === "open" ? (
                              <button
                                className="btn-secondary !py-1 !px-3 text-xs"
                                disabled={pending}
                                onClick={() => startTransition(() => setSessionStatusAction(sess.id, "closed"))}
                              >
                                ■ Close
                              </button>
                            ) : (
                              <button
                                className="btn-primary !py-1 !px-3 text-xs"
                                disabled={pending}
                                onClick={() => startTransition(() => setSessionStatusAction(sess.id, "open"))}
                              >
                                ▶ Open
                              </button>
                            )}
                            {sess.total === 0 && (
                              <button
                                className="text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
                                disabled={pending}
                                onClick={() => startTransition(() => toggleMealWindowAction(meal.kind, day.key, false))}
                              >
                                remove
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── food color codes ───────────────────────────────────── */}
      <div className="festive-card p-5">
        <p className="font-bold mb-1">🎨 Food color codes</p>
        <p className="text-xs mb-4" style={{ color: "var(--ink-soft)" }}>
          The scan desk flashes these colors full-width on a successful food scan, so servers can tell
          veg / non-veg / kid&apos;s plates apart at a glance.
        </p>
        <div className="flex gap-6 flex-wrap items-end">
          {(["veg", "non_veg", "kid"] as const).map((k) => (
            <label key={k} className="grid gap-1.5 text-sm font-medium">
              {FOOD_LABEL[k]}
              <span className="flex items-center gap-2">
                <input
                  type="color"
                  value={colors[k]}
                  onChange={(e) => {
                    setColors({ ...colors, [k]: e.target.value });
                    setColorsSaved(false);
                  }}
                  className="h-10 w-16 rounded-lg cursor-pointer border"
                  style={{ borderColor: "var(--line)" }}
                />
                <span className="font-mono text-xs" style={{ color: "var(--ink-soft)" }}>{colors[k]}</span>
              </span>
            </label>
          ))}
          <button
            className="btn-primary !py-2 !px-5 text-sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await saveFoodColorsAction(colors);
                setColorsSaved(true);
              })
            }
          >
            {colorsSaved ? "✓ Saved" : "Save colors"}
          </button>
        </div>
      </div>

      {/* ── go scan ────────────────────────────────────────────── */}
      <div className="festive-card p-5 flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {openSessions.length > 0 ? (
            <>
              <strong style={{ color: "var(--leaf-deep)" }}>
                {openSessions.map((s) => s.label).join(", ")}
              </strong>{" "}
              {openSessions.length === 1 ? "is" : "are"} live — the scan desk can serve now.
            </>
          ) : (
            "No food window is open. The scan desk only does entry check-in until you open one."
          )}
        </p>
        <Link href="/admin/checkin" className="btn-secondary !py-2 !px-5 text-sm">
          Go to scan desk →
        </Link>
      </div>

      <p className="text-xs text-center" style={{ color: "var(--ink-soft)" }}>
        Event-day fail-safe:{" "}
        <a href="/api/admin/export/gate-sheet" className="underline underline-offset-4 font-semibold">
          download the offline gate sheet
        </a>{" "}
        each morning — a single file with every paid attendee that keeps the gate moving even if the
        app or internet goes down.
      </p>
    </div>
  );
}
