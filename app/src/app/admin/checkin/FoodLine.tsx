"use client";

/**
 * The food line, by party (spec/18).
 *
 * Built for a phone held at waist height with a queue in front of it:
 *   · the whole sheet is one answer — green "3 PLATES TO GIVE", red "ALL GIVEN",
 *     grey "NOT PAID" — readable at arm's length
 *   · one row per plate type, in its own colour, with − / + to give fewer
 *     (two of the three are in the line → give 2, the third is still owed)
 *   · one big button gives them; a full-screen flash says exactly what to hand over
 *   · names, single gives, undo and plate changes are one tap further down
 */
import { useCallback, useEffect, useImperativeHandle, useState, useTransition, forwardRef } from "react";
import { PLATE_LABEL, PLATES, plateColor, type Plate, type PlateColors } from "@/lib/food";
import type { FoodParty, FoodLookup } from "@/lib/foodline/party";
import {
  changePlateAction,
  foodLookupAction,
  foodPartyAction,
  giveFoodAction,
  giveOneAction,
  undoGiveAction,
} from "./food-actions";

type Choose = Extract<FoodLookup, { kind: "choose" }>;

export type FoodLineHandle = { lookup: (q: string) => void };

function beep(ok: boolean) {
  try {
    if (navigator.vibrate) navigator.vibrate(ok ? 60 : [90, 70, 90]);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = ok ? "sine" : "square";
    o.frequency.setValueAtTime(ok ? 660 : 180, ctx.currentTime);
    if (ok) o.frequency.setValueAtTime(880, ctx.currentTime + 0.09);
    g.gain.setValueAtTime(0.14, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    o.start();
    o.stop(ctx.currentTime + 0.32);
    o.onended = () => ctx.close().catch(() => {});
  } catch {
    /* sound is a bonus */
  }
}

const FoodLine = forwardRef<FoodLineHandle, { sessionId: string; sessionLabel: string; colors: Partial<PlateColors>; isAdmin: boolean }>(function FoodLine(
  { sessionId, sessionLabel, colors, isAdmin },
  ref
) {
  const [party, setParty] = useState<FoodParty | null>(null);
  const [choose, setChoose] = useState<Choose | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [counts, setCounts] = useState<Partial<Record<Plate, number>>>({});
  const [flash, setFlash] = useState<{ given: Partial<Record<Plate, number>>; total: number; short: number } | null>(null);
  const [showPeople, setShowPeople] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const col = (p: Plate | null) => plateColor(p, colors);

  const show = useCallback((p: FoodParty | null) => {
    setParty(p);
    setChoose(null);
    setProblem(null);
    if (p) {
      const c: Partial<Record<Plate, number>> = {};
      for (const pl of PLATES) if (p.booking.left[pl] > 0) c[pl] = p.booking.left[pl];
      setCounts(c);
      beep(!p.booking.blocked && p.booking.left.total > 0);
    }
  }, []);

  const lookup = useCallback(
    (q: string) =>
      start(async () => {
        setFlash(null);
        setToast(null);
        const r = await foodLookupAction(sessionId, q);
        if (!r.ok) return setProblem(r.error);
        if (r.data.kind === "party") {
          setShowPeople(false);
          show(r.data.party);
        } else if (r.data.kind === "choose") {
          setParty(null);
          setChoose(r.data);
        } else {
          setParty(null);
          setChoose(null);
          setProblem(r.data.reason);
          beep(false);
        }
      }),
    [sessionId, show]
  );

  useImperativeHandle(ref, () => ({ lookup }), [lookup]);

  const open = (registrationId: string) =>
    start(async () => {
      const r = await foodPartyAction(sessionId, registrationId);
      if (!r.ok) return setProblem(r.error);
      setShowPeople(false);
      show(r.data);
    });

  const give = () =>
    start(async () => {
      if (!party) return;
      const r = await giveFoodAction(sessionId, party.booking.registrationId, counts);
      if (!r.ok) {
        setToast(r.error);
        beep(false);
        return;
      }
      setFlash({ given: r.data.given, total: r.data.givenTotal, short: r.data.short });
      beep(r.data.givenTotal > 0);
      show(r.data.party);
    });

  const act = (fn: () => Promise<{ ok: true; data: FoodParty | null } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setToast(r.error);
        return;
      }
      setToast(null);
      if (r.data) {
        const keep = showPeople;
        show(r.data);
        setShowPeople(keep);
      }
    });

  // the flash clears itself — the next family is waiting
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), flash.short > 0 ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [flash]);

  const close = () => {
    setParty(null);
    setChoose(null);
    setProblem(null);
    setToast(null);
  };

  const b = party?.booking;
  const toGive = PLATES.reduce((n, p) => n + (counts[p] ?? 0), 0);
  const platesShown = b ? PLATES.filter((p) => b.booked[p] > 0) : [];
  const head = !b
    ? null
    : b.blocked
      ? { bg: "#414750", big: b.standing === "unpaid" ? "NOT PAID" : "STOP", sub: b.blocked }
      : b.booked.total === 0
        ? { bg: "#414750", big: "NO MEAL", sub: `Nobody on this booking has a plate in ${sessionLabel}.` }
        : b.left.total === 0
          ? { bg: "#8F1D1D", big: `ALL ${b.booked.total} PLATE${b.booked.total === 1 ? "" : "S"} GIVEN`, sub: b.lastGivenAt ? `Last one at ${b.lastGivenAt}` : "" }
          : {
              bg: "#1E6B2A",
              big: `${b.left.total} PLATE${b.left.total === 1 ? "" : "S"} TO GIVE`,
              sub: b.given.total > 0 ? `${b.given.total} already given${b.lastGivenAt ? ` (last at ${b.lastGivenAt})` : ""}` : `of ${b.booked.total} on this booking`,
            };

  return (
    <>
      {/* ── nothing found / problem ─────────────────────────────── */}
      {problem && !party && (
        <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center px-6 text-center text-white" style={{ background: "#414750" }} onClick={close} role="alert">
          <p style={{ fontSize: "clamp(56px,16vw,110px)", lineHeight: 1 }}>✕</p>
          <p className="font-black mt-3" style={{ fontSize: "clamp(22px,6vw,40px)", lineHeight: 1.15 }}>
            {problem}
          </p>
          <p className="absolute bottom-8 text-xs uppercase tracking-[0.2em] opacity-70">Tap to scan again</p>
        </div>
      )}

      {/* ── several bookings matched a name ─────────────────────── */}
      {choose && (
        <div className="fixed inset-0 z-[95] overflow-y-auto px-4 py-6" style={{ background: "var(--bg, #fff)" }}>
          <div className="max-w-lg mx-auto">
            <p className="text-2xl font-black mb-1">Which family?</p>
            <p className="text-sm mb-4" style={{ color: "var(--ink-soft)" }}>
              {choose.options.length} bookings match. Tap one.
            </p>
            <div className="grid gap-3">
              {choose.options.map((o) => (
                <button key={o.registrationId} className="festive-card p-4 text-left" onClick={() => open(o.registrationId)} disabled={pending}>
                  <p className="text-lg font-black">{o.buyer}</p>
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
                    {o.conf} · {o.people.join(", ")}
                  </p>
                  <p className="text-sm font-bold mt-1" style={{ color: o.plates > 0 ? "#1E6B2A" : "#8F1D1D" }}>
                    {o.plates > 0 ? `${o.plates} plate${o.plates === 1 ? "" : "s"} left` : "No plates left"}
                  </p>
                </button>
              ))}
            </div>
            <button className="btn-secondary w-full justify-center mt-5" onClick={close}>
              ← Back to scanning
            </button>
          </div>
        </div>
      )}

      {/* ── the party sheet ─────────────────────────────────────── */}
      {party && b && head && (
        <div className="fixed inset-0 z-[90] overflow-y-auto" style={{ background: "#f7f4ef", color: "#1d1d1f" }} data-force-light>
          <div className="px-5 pt-6 pb-5 text-white text-center" style={{ background: head.bg }}>
            <p className="text-xs uppercase tracking-[0.18em] opacity-85">
              {party.window.label} · {b.conf}
            </p>
            <p className="font-black mt-1" style={{ fontSize: "clamp(30px,9vw,54px)", lineHeight: 1.05 }}>
              {head.big}
            </p>
            <p className="mt-1.5 font-semibold" style={{ fontSize: "clamp(15px,4vw,20px)" }}>
              {b.buyer}
            </p>
            {head.sub && <p className="mt-1 opacity-90 text-sm">{head.sub}</p>}
          </div>

          <div className="max-w-lg mx-auto px-4 py-4 flex flex-col gap-3">
            {/* things a human acts on */}
            {b.owesCents ? (
              <div className="rounded-2xl px-4 py-3 font-black text-center" style={{ background: "#FFD54A", color: "#4A2E00" }}>
                BALANCE OWED ${(b.owesCents / 100).toFixed(2)} — serve, then send them to the desk
              </div>
            ) : null}
            {b.gateKnown && !b.blocked && b.booked.total > 0 && b.gateIn < b.people.filter((p) => p.plate).length && (
              <div className="rounded-2xl px-4 py-2.5 text-sm font-bold text-center" style={{ background: party.requireGate ? "#FFD54A" : "rgba(0,0,0,0.06)", color: party.requireGate ? "#4A2E00" : "#333" }}>
                {b.gateIn} of {b.people.filter((p) => p.plate).length} checked in at the gate today
                {party.requireGate ? " — only checked-in people can be served" : ""}
              </div>
            )}

            {/* one row per plate type */}
            {!b.blocked &&
              platesShown.map((pl) => {
                const left = b.left[pl];
                const n = counts[pl] ?? 0;
                const set = (v: number) => setCounts((c) => ({ ...c, [pl]: Math.max(0, Math.min(left, v)) }));
                return (
                  <div key={pl} className="rounded-2xl overflow-hidden flex items-stretch" style={{ background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.12)", opacity: left === 0 ? 0.55 : 1 }}>
                    <div className="w-4 shrink-0" style={{ background: col(pl) }} />
                    <div className="flex-1 px-3 py-3 min-w-0">
                      <p className="font-black leading-tight whitespace-nowrap" style={{ color: col(pl), fontSize: "clamp(17px,4.9vw,26px)" }}>
                        {PLATE_LABEL[pl].short}
                      </p>
                      <p className="text-sm font-semibold" style={{ color: "#555" }}>
                        {left === 0 ? `✓ all ${b.booked[pl]} given` : `${left} left · of ${b.booked[pl]}`}
                      </p>
                    </div>
                    {left > 0 && (
                      <div className="flex items-center gap-1 pr-2">
                        <button aria-label={`One fewer ${PLATE_LABEL[pl].long}`} className="w-12 h-12 rounded-xl text-2xl font-black" style={{ background: "#eee" }} onClick={() => set(n - 1)} disabled={n <= 0}>
                          −
                        </button>
                        <span className="w-10 text-center font-black" style={{ fontSize: 30 }}>
                          {n}
                        </span>
                        <button aria-label={`One more ${PLATE_LABEL[pl].long}`} className="w-12 h-12 rounded-xl text-2xl font-black" style={{ background: "#eee" }} onClick={() => set(n + 1)} disabled={n >= left}>
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

            {!b.blocked && b.left.total > 0 && (
              <button
                className="w-full rounded-2xl py-5 font-black text-white disabled:opacity-40"
                style={{ background: "#1E6B2A", fontSize: "clamp(22px,6.5vw,32px)" }}
                onClick={give}
                disabled={pending || toGive === 0}
              >
                {pending ? "…" : toGive === 0 ? "Pick plates above" : `GIVE ${toGive} PLATE${toGive === 1 ? "" : "S"}`}
              </button>
            )}
            {!b.blocked && b.left.total > 0 && toGive < b.left.total && toGive > 0 && (
              <p className="text-center text-sm font-semibold" style={{ color: "#8a5a00" }}>
                {b.left.total - toGive} will stay owed — they can scan again later.
              </p>
            )}

            {toast && (
              <div className="rounded-2xl px-4 py-3 font-bold text-center text-white" style={{ background: "#8F1D1D" }} role="alert">
                {toast}
              </div>
            )}

            {/* family's other bookings */}
            {party.linked.length > 0 && (
              <div className="rounded-2xl p-3" style={{ background: "#fff" }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#666" }}>
                  Also booked by this family
                </p>
                <div className="flex flex-col gap-2">
                  {party.linked.map((l) => (
                    <button key={l.registrationId} className="rounded-xl px-3 py-2.5 text-left flex justify-between gap-3" style={{ background: "#f1ece4" }} onClick={() => open(l.registrationId)} disabled={pending}>
                      <span>
                        <strong>{l.conf}</strong> · {l.buyer} <span className="text-xs opacity-70">({l.why})</span>
                      </span>
                      <span className="font-black shrink-0" style={{ color: l.blocked ? "#8F1D1D" : l.leftTotal > 0 ? "#1E6B2A" : "#666" }}>
                        {l.blocked ? "not paid" : l.leftTotal > 0 ? `${l.leftTotal} left →` : "all given"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* people */}
            <button className="rounded-2xl px-4 py-3 text-left font-bold flex justify-between" style={{ background: "#fff" }} onClick={() => setShowPeople((v) => !v)}>
              <span>
                People on this booking ({b.people.length})
                {b.otherDayPasses > 0 ? (
                  <span className="block font-normal text-xs opacity-70">
                    + {b.otherDayPasses} pass{b.otherDayPasses === 1 ? "" : "es"} for other days (not counted here)
                  </span>
                ) : null}
              </span>
              <span>{showPeople ? "▴" : "▾"}</span>
            </button>
            {showPeople && (
              <div className="flex flex-col gap-2">
                {b.people.map((p) => (
                  <div key={p.ticketId} className="rounded-2xl p-3" style={{ background: "#fff" }}>
                    <div className="flex items-center gap-3">
                      <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: p.plate ? col(p.plate) : "#bbb" }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">
                          {p.name} {p.under5 ? "👶" : p.child ? "🧒" : ""}
                        </p>
                        <p className="text-xs" style={{ color: "#666" }}>
                          {p.plate ? PLATE_LABEL[p.plate].long : p.why}
                          {p.gateIn === false ? " · not checked in at gate" : p.gateIn ? " · in at gate" : ""}
                        </p>
                      </div>
                      {p.plate &&
                        (p.givenAt ? (
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold" style={{ color: "#8F1D1D" }}>
                              given {p.givenAt}
                            </p>
                            <button className="text-xs underline underline-offset-4" disabled={pending} onClick={() => act(() => undoGiveAction(sessionId, p.ticketId))}>
                              undo
                            </button>
                          </div>
                        ) : (
                          !b.blocked && (
                            <button className="rounded-xl px-4 py-2.5 font-black text-white shrink-0" style={{ background: col(p.plate) }} disabled={pending} onClick={() => act(() => giveOneAction(sessionId, p.ticketId))}>
                              Give
                            </button>
                          )
                        ))}
                    </div>
                    {p.plate && !p.givenAt && p.canChangeTo.length > 1 && !b.blocked && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pl-6">
                        <span className="text-xs self-center" style={{ color: "#666" }}>
                          Change to:
                        </span>
                        {p.canChangeTo
                          .filter((c) => c !== p.plate)
                          .map((c) => (
                            <button key={c} className="rounded-lg px-2.5 py-1 text-xs font-bold" style={{ border: `2px solid ${col(c)}`, color: col(c) }} disabled={pending} onClick={() => act(() => changePlateAction(sessionId, p.ticketId, c))}>
                              {PLATE_LABEL[c].long}
                            </button>
                          ))}
                      </div>
                    )}
                    {p.givenBy && <p className="text-[11px] mt-1 pl-6" style={{ color: "#888" }}>by {p.givenBy}</p>}
                  </div>
                ))}
                {!isAdmin && <p className="text-xs text-center" style={{ color: "#777" }}>You can undo your own plates for 15 minutes; after that, ask an admin.</p>}
              </div>
            )}

            <button className="w-full rounded-2xl py-4 font-black text-lg" style={{ background: "#2a2a2a", color: "#fff" }} onClick={close}>
              Done — scan the next family
            </button>
          </div>
        </div>
      )}

      {/* ── what to hand over ───────────────────────────────────── */}
      {flash && (
        <div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 text-center text-white cursor-pointer"
          style={{ background: flash.total === 0 ? "#8F1D1D" : Object.keys(flash.given).length === 1 ? col(Object.keys(flash.given)[0] as Plate) : "#1E6B2A" }}
          onClick={() => setFlash(null)}
          role="status"
          aria-live="assertive"
        >
          <p style={{ fontSize: "clamp(48px,14vw,96px)", lineHeight: 1 }}>{flash.total === 0 ? "⛔" : "✓"}</p>
          <p className="uppercase tracking-[0.2em] text-sm mt-2 opacity-90">{flash.total === 0 ? "Nothing given" : "Hand over"}</p>
          <div className="mt-3 grid gap-2 w-full max-w-md">
            {PLATES.filter((p) => (flash.given[p] ?? 0) > 0).map((p) => (
              <div key={p} className="rounded-2xl px-4 py-3 font-black flex items-center justify-between gap-3 whitespace-nowrap" style={{ background: "rgba(255,255,255,0.18)", fontSize: "clamp(20px,6.2vw,40px)" }}>
                <span className="inline-block w-6 h-6 rounded-full shrink-0" style={{ background: col(p), boxShadow: "0 0 0 3px #fff" }} />
                <span className="flex-1 text-left">{PLATE_LABEL[p].short}</span>
                <span>× {flash.given[p]}</span>
              </div>
            ))}
          </div>
          {flash.short > 0 && (
            <div className="mt-5 rounded-2xl px-5 py-3 font-black" style={{ background: "#FFD54A", color: "#4A2E00" }}>
              {flash.short} plate{flash.short === 1 ? " was" : "s were"} given by someone else a moment ago — check the count
            </div>
          )}
          <p className="absolute bottom-8 text-xs uppercase tracking-[0.2em] opacity-70">Tap to continue</p>
        </div>
      )}
    </>
  );
});

export default FoodLine;
