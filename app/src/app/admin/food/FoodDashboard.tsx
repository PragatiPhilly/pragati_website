"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PLATE_LABEL, PLATES, plateColor, type Plate, type PlateColors } from "@/lib/food";
import type { WindowStats } from "@/lib/foodline/party";
import { setSessionStatusAction } from "../scans/actions";
import { addExtrasAction, removeExtraAction, undoGiveAction } from "../checkin/food-actions";
import { saveFoodSettingsAction } from "./actions";

const EXTRA_REASONS = ["Volunteer", "Performer / artist", "Purohit / puja", "Committee guest", "Paid at the counter", "Other"];

export default function FoodDashboard({
  stats,
  colors,
  isAdmin,
  settings,
}: {
  stats: WindowStats;
  colors: PlateColors;
  isAdmin: boolean;
  settings: { adultMealMinAge: number; requireGate: boolean };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const w = stats.window;
  const live = w.status === "open";
  const col = (p: Plate) => plateColor(p, colors);

  // off-list plates form
  const [xPlate, setXPlate] = useState<Plate>("adult_non_veg");
  const [xQty, setXQty] = useState("1");
  const [xReason, setXReason] = useState(EXTRA_REASONS[0]);
  const [xNote, setXNote] = useState("");

  // settings form
  const [age, setAge] = useState(String(settings.adultMealMinAge));
  const [gate, setGate] = useState(settings.requireGate);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (okMsg ?? null) : (r.error ?? "Something went wrong."));
      router.refresh();
    });

  const servedTotal = stats.given.total + stats.extras.total;
  const shown = PLATES.filter((p) => stats.booked[p] + stats.extras[p] > 0 || p !== "kid");

  return (
    <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
      {/* ── window header ─────────────────────────────────────── */}
      <div className="festive-card p-5 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-48">
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: live ? "var(--leaf-deep)" : "var(--ink-soft)" }}>
            {live ? "● Serving now" : "Closed"}
          </p>
          <p className="font-[family-name:var(--font-display)] text-2xl font-black">{w.label}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link href={`/admin/checkin?w=${w.id}`} className="btn-secondary !py-2 !px-4 text-sm">
            📷 Serve on this phone
          </Link>
          {isAdmin &&
            (live ? (
              <button className="btn-secondary !py-2 !px-4 text-sm" disabled={pending} onClick={() => start(async () => { await setSessionStatusAction(w.id, "closed"); router.refresh(); })}>
                ■ Close {w.label}
              </button>
            ) : (
              <button className="btn-primary !py-2 !px-4 text-sm" disabled={pending} onClick={() => start(async () => { await setSessionStatusAction(w.id, "open"); router.refresh(); })}>
                ▶ Open {w.label}
              </button>
            ))}
        </div>
      </div>

      {msg && (
        <p className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: "var(--accent-soft)" }} role="status">
          {msg}
        </p>
      )}

      {/* ── the big numbers ───────────────────────────────────── */}
      <div className="festive-card p-5 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="font-[family-name:var(--font-display)] text-4xl font-black" style={{ color: "var(--leaf-deep)" }}>
            {stats.given.total}
          </p>
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
            given · of {stats.booked.total} booked
          </p>
        </div>
        <div>
          <p className="font-[family-name:var(--font-display)] text-4xl font-black" style={{ color: "var(--sindoor)" }}>
            {stats.left.total}
          </p>
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
            still to come
          </p>
        </div>
        <div>
          <p className="font-[family-name:var(--font-display)] text-4xl font-black">{stats.extras.total}</p>
          <p className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
            off-list plates
          </p>
        </div>
        <p className="col-span-3 text-sm" style={{ color: "var(--ink-soft)" }}>
          <strong style={{ color: "var(--ink)" }}>{servedTotal}</strong> plates out of the kitchen so far ·{" "}
          {stats.families.full} {stats.families.full === 1 ? "family" : "families"} fully served · {stats.families.partial} partly · {stats.families.none} not seen yet
        </p>
      </div>

      {/* ── by plate type ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {shown.map((p) => {
          const booked = stats.booked[p];
          const given = stats.given[p];
          const pct = booked ? Math.round((given / booked) * 100) : 0;
          return (
            <div key={p} className="festive-card overflow-hidden flex">
              <div className="w-3 shrink-0" style={{ background: col(p) }} />
              <div className="p-4 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-black" style={{ color: col(p) }}>
                    {PLATE_LABEL[p].short}
                  </p>
                  <p className="font-[family-name:var(--font-display)] text-2xl font-black">
                    {given}
                    <span className="text-sm font-semibold" style={{ color: "var(--ink-soft)" }}>
                      {" "}
                      / {booked}
                    </span>
                  </p>
                </div>
                <div className="h-2 rounded-full mt-2" style={{ background: "var(--accent-soft)" }}>
                  <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: col(p) }} />
                </div>
                <p className="text-xs mt-1.5" style={{ color: "var(--ink-soft)" }}>
                  {stats.left[p]} left
                  {stats.extras[p] ? ` · +${stats.extras[p]} off-list` : ""}
                  {p === "kid" ? " · older bookings, veg/non-veg not chosen" : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── families still owed ───────────────────────────────── */}
      <div className="festive-card p-5">
        <p className="font-bold mb-1">Families still owed plates ({stats.owed.length})</p>
        <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
          Got some plates, not all — someone from the family is still to come. Tap to open them at the food line.
        </p>
        {stats.owed.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Nobody part-served.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {stats.owed.slice(0, 60).map((o) => (
              <Link
                key={o.registrationId}
                href={`/admin/checkin?w=${w.id}&q=${encodeURIComponent(o.conf)}`}
                className="flex justify-between gap-3 rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--bg-soft, rgba(0,0,0,0.03))" }}
              >
                <span>
                  <strong>{o.buyer}</strong> <span className="font-mono text-xs opacity-70">{o.conf}</span>
                </span>
                <span className="shrink-0">
                  <strong style={{ color: "var(--sindoor)" }}>{o.left} left</strong>
                  <span className="text-xs opacity-70"> · {o.given} given{o.lastGivenAt ? ` · ${o.lastGivenAt}` : ""}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── off-list plates ───────────────────────────────────── */}
      <div className="festive-card p-5">
        <p className="font-bold mb-1">Plates without a pass</p>
        <p className="text-xs mb-3" style={{ color: "var(--ink-soft)" }}>
          Volunteers, performers, the purohit, guests of the committee, a plate paid for at the counter — log them here so the kitchen
          total adds up without paper coupons.
        </p>
        {live ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              {PLATES.filter((p) => p !== "kid").map((p) => (
                <button
                  key={p}
                  className="rounded-lg px-3 py-2 text-sm font-bold"
                  style={xPlate === p ? { background: col(p), color: "#fff" } : { border: `2px solid ${col(p)}`, color: col(p) }}
                  onClick={() => setXPlate(p)}
                >
                  {PLATE_LABEL[p].long}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <input className="input !w-24" inputMode="numeric" value={xQty} onChange={(e) => setXQty(e.target.value.replace(/\D/g, ""))} aria-label="How many plates" />
              <select className="input !w-auto" value={xReason} onChange={(e) => setXReason(e.target.value)} aria-label="Who for">
                {EXTRA_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <input className="input flex-1 min-w-40" placeholder={xReason === "Other" ? "Who were they for? (needed)" : "Note (optional)"} value={xNote} onChange={(e) => setXNote(e.target.value)} />
              <button
                className="btn-primary !py-2 !px-4 text-sm"
                disabled={pending || !xQty}
                onClick={() =>
                  run(async () => {
                    const r = await addExtrasAction(w.id, xPlate, Number(xQty), xReason, xNote);
                    if (r.ok) {
                      setXQty("1");
                      setXNote("");
                    }
                    return r.ok ? { ok: true } : { ok: false, error: r.error };
                  }, `Logged ${xQty} × ${PLATE_LABEL[xPlate].long}.`)
                }
              >
                + Log plates
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Open {w.label} to log plates.
          </p>
        )}
        {stats.extrasList.length > 0 && (
          <div className="flex flex-col gap-1 mt-4 text-sm">
            {stats.extrasList.map((e) => (
              <div key={e.id} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: col(e.plate) }} />
                <span className="flex-1">
                  <strong>{e.qty} × {PLATE_LABEL[e.plate]?.long ?? e.plate}</strong> — {e.reason}
                  {e.note ? ` (${e.note})` : ""} <span className="text-xs opacity-60">· {e.at}{e.by ? ` · ${e.by}` : ""}</span>
                </span>
                {isAdmin && (
                  <button className="text-xs underline underline-offset-4 opacity-70" disabled={pending} onClick={() => run(() => removeExtraAction(e.id), "Removed.")}>
                    remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── latest ────────────────────────────────────────────── */}
      <div className="festive-card p-5">
        <p className="font-bold mb-3">Last plates given</p>
        {stats.recent.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
            Nothing yet.
          </p>
        ) : (
          <div className="flex flex-col gap-1 text-sm">
            {stats.recent.map((r) => (
              <div key={`${r.kind}-${r.id}`} className="flex items-center gap-2">
                <span className="text-xs w-16 shrink-0 opacity-70">{r.at}</span>
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: r.plate ? col(r.plate) : "#bbb" }} />
                <span className="flex-1 min-w-0 truncate">
                  {r.kind === "extra" ? `${r.qty} × off-list — ${r.who}` : r.who}
                  {r.conf ? <span className="font-mono text-xs opacity-60"> {r.conf}</span> : null}
                  {r.by ? <span className="text-xs opacity-60"> · by {r.by}</span> : null}
                </span>
                {isAdmin && r.kind === "pass" && r.ticketId && (
                  <button
                    className="text-xs underline underline-offset-4 opacity-70"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const x = await undoGiveAction(w.id, r.ticketId!);
                        return x.ok ? { ok: true } : { ok: false, error: x.error };
                      }, `Undone — ${r.who} is owed a plate again.`)
                    }
                  >
                    undo
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── settings ──────────────────────────────────────────── */}
      {isAdmin && (
        <div className="festive-card p-5">
          <p className="font-bold mb-3">Food settings</p>
          <div className="grid gap-4 text-sm">
            <label className="flex flex-wrap items-center gap-3">
              <span className="flex-1 min-w-56">
                <strong>Adult meal from age</strong>
                <br />
                <span style={{ color: "var(--ink-soft)" }}>
                  Children this age and older can pick an adult plate (same youth price). Younger children pick kid veg / kid non-veg.
                </span>
              </span>
              <input className="input !w-20" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} />
            </label>
            <label className="flex flex-wrap items-center gap-3">
              <span className="flex-1 min-w-56">
                <strong>Only serve people checked in at the gate</strong>
                <br />
                <span style={{ color: "var(--ink-soft)" }}>
                  Off: the food line just shows how many of the family are checked in. On: plates can only be given to people checked in
                  today.
                </span>
              </span>
              <input type="checkbox" className="w-6 h-6" checked={gate} onChange={(e) => setGate(e.target.checked)} />
            </label>
            <div>
              <button
                className="btn-primary !py-2 !px-5 text-sm"
                disabled={pending}
                onClick={() => run(() => saveFoodSettingsAction({ adultMealMinAge: Number(age), requireGate: gate }), "Settings saved.")}
              >
                Save settings
              </button>
              <Link href="/admin/scans" className="ml-4 text-xs underline underline-offset-4 opacity-70">
                Meal windows & plate colours →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
