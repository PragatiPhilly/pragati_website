"use client";

/**
 * The Projections screen.
 *
 * PERFORMANCE SHAPE, and why it is like this:
 *  · the deterministic engine runs synchronously in a useMemo on every keystroke
 *    and every slider tick — it is arithmetic over ~60 rows, so the tiles and
 *    the waterfall move with your finger.
 *  · the Monte Carlo and the Sobol decomposition are thousands of engine
 *    evaluations. They run on a 260ms trailing debounce and keep showing the
 *    PREVIOUS answer while they recompute, because a panel that blanks itself
 *    every time you nudge a slider is worse than one that is briefly stale.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { bakeModifiers, calculate, type EngineResult } from "@/lib/projections/engine";
import {
  defaultDrivers,
  fitPace,
  forecastPace,
  gapAnalysis,
  monteCarlo,
  riskFlags,
  sobol,
  type McResult,
  type SobolIndex,
} from "@/lib/projections/forecast";
import { PACE_2024 } from "@/lib/projections/seed-2024";
import { csvFilename, toCsv } from "@/lib/projections/export";
import { COST_HEADS, REVENUE_HEADS, type ProjectionModel } from "@/lib/projections/types";
import type { HeadActuals } from "@/lib/projections/actuals";
import DriverPanel from "@/components/admin/projections/DriverPanel";
import LineTables from "@/components/admin/projections/LineTables";
import Waterfall, { type WaterfallStep } from "@/components/admin/projections/Waterfall";
import BreakEvenArc from "@/components/admin/projections/BreakEvenArc";
import FanChart from "@/components/admin/projections/FanChart";
import PaceChart from "@/components/admin/projections/PaceChart";
import { SobolChart, Tornado, type TornadoRow } from "@/components/admin/projections/Sensitivity";
import { AnimatedMoney, money0, moneySigned, num, pct } from "@/components/admin/projections/primitives";
import {
  captureBaselineAction,
  createScenarioAction,
  deleteScenarioAction,
  saveScenarioAction,
  takeSnapshotAction,
  unlockScenarioAction,
} from "./actions";

export type ScenarioLite = {
  id: string;
  year: number;
  name: string;
  description: string | null;
  isBaseline: boolean;
  locked: boolean;
  model: ProjectionModel;
  updatedAt: string;
};

export type SnapLite = { id: string; takenAt: string; daysOut: number | null; heads: number; revenueCents: number };

export default function ProjectionsClient({
  scenarios,
  snapshots,
  actuals,
}: {
  scenarios: ScenarioLite[];
  snapshots: Record<string, SnapLite[]>;
  actuals: HeadActuals;
}) {
  const [selectedId, setSelectedId] = useState(scenarios[0]?.id ?? "");
  const selected = scenarios.find((s) => s.id === selectedId) ?? scenarios[0];
  const [model, setModel] = useState<ProjectionModel | null>(selected?.model ?? null);
  const [dirty, setDirty] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  /* Comparison is a MODE, not a double-click. A dblclick on a chip also fires a
     click, so it selected the scenario and added it to the comparison at once —
     you ended up comparing a scenario with itself. */
  const [compareMode, setCompareMode] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [pending, start] = useTransition();

  // Switching scenarios loads that scenario's own model.
  useEffect(() => {
    const s = scenarios.find((x) => x.id === selectedId);
    if (s) {
      setModel(s.model);
      setDirty(false);
    }
  }, [selectedId, scenarios]);

  const readOnly = !!selected?.locked;
  const update = (next: ProjectionModel) => {
    setModel(next);
    setDirty(true);
  };

  const result = useMemo<EngineResult | null>(() => (model ? calculate(model) : null), [model]);
  const drivers = useMemo(() => (model ? defaultDrivers(model) : []), [model]);

  // ── heavy statistics, debounced, never blanked ────────────────
  const [heavy, setHeavy] = useState<{ mc: McResult; sobol: SobolIndex[] } | null>(null);
  const [computing, setComputing] = useState(false);
  const runId = useRef(0);
  useEffect(() => {
    if (!model || drivers.length === 0) return;
    const mine = ++runId.current;
    setComputing(true);
    const t = setTimeout(() => {
      const mc = monteCarlo(model, drivers, { samples: 1500 });
      const sb = sobol(model, drivers, { samples: 192 });
      if (runId.current === mine) {
        setHeavy({ mc, sobol: sb });
        setComputing(false);
      }
    }, 260);
    return () => clearTimeout(t);
  }, [model, drivers]);

  const gap = useMemo(() => (model && result ? gapAnalysis(model, result) : null), [model, result]);
  const flags = useMemo(() => (model && result ? riskFlags(model, result) : []), [model, result]);

  // ── tornado: ±20% on each driver, measured not estimated ──────
  const tornado = useMemo<TornadoRow[]>(() => {
    if (!model || !result) return [];
    return drivers
      .map((dr) => {
        const down = calculate(dr.apply(model, 0.8)).profitCents - result.profitCents;
        const up = calculate(dr.apply(model, 1.2)).profitCents - result.profitCents;
        return { key: dr.key, label: dr.label, downCents: down, upCents: up };
      })
      .filter((r) => Math.abs(r.downCents) + Math.abs(r.upCents) > 100)
      .sort((a, b) => Math.abs(b.downCents) + Math.abs(b.upCents) - (Math.abs(a.downCents) + Math.abs(a.upCents)))
      .slice(0, 8);
  }, [model, result, drivers]);

  // ── waterfall ─────────────────────────────────────────────────
  const waterfall = useMemo<WaterfallStep[]>(() => {
    if (!model || !result) return [];
    const steps: WaterfallStep[] = [];
    for (const h of REVENUE_HEADS) {
      const v = result.revenueByHead[h.key as keyof typeof result.revenueByHead] ?? 0;
      if (v !== 0) steps.push({ key: `r-${h.key}`, label: h.label, deltaCents: v, detail: h.hint });
    }
    for (const h of COST_HEADS) {
      const v = result.costByHead[h.key as keyof typeof result.costByHead] ?? 0;
      if (v !== 0) steps.push({ key: `c-${h.key}`, label: h.label, deltaCents: -v, detail: h.hint });
    }
    steps.push({ key: "profit", label: "Bottom line", deltaCents: result.profitCents, total: true });
    return steps;
  }, [model, result]);

  // ── pace ──────────────────────────────────────────────────────
  const paceFit = useMemo(() => fitPace(PACE_2024), []);
  const snapPoints = useMemo(() => {
    const own = (snapshots[selectedId] ?? [])
      .filter((s) => s.daysOut !== null && s.heads > 0)
      .map((s) => ({ daysOut: s.daysOut as number, heads: s.heads }));
    // The 2024 BASELINE has no snapshots of its own, but it does have the real
    // curve the committee typed by hand — and its own plan of 1,096 to compare
    // it against, which is the finding worth showing. Any other scenario would
    // be measuring 2024's bookings against a plan they never belonged to, so it
    // gets the honest empty state instead.
    if (own.length === 0 && selected?.year === 2024 && selected?.isBaseline) return PACE_2024;
    return own;
  }, [snapshots, selectedId, selected?.year]);
  const usingBaselinePace = snapPoints === PACE_2024;
  const pace = useMemo(
    () => forecastPace(paceFit, snapPoints, Math.max(1, result?.totalHeads ?? 1)),
    [paceFit, snapPoints, result?.totalHeads]
  );

  if (!model || !result || !selected) {
    return (
      <div className="proj">
        <h1 className="proj-title">Projections</h1>
        <p className="proj-empty">No scenarios yet. Reload the page to plant the 2024 workbook.</p>
      </div>
    );
  }

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) setDirty(false);
      setTimeout(() => setMsg(null), 5000);
    });

  /** Hand the treasurer a spreadsheet. Built in the browser — the numbers are
   *  already here, so there is nothing to ask a server for. */
  const downloadCsv = () => {
    const blob = new Blob([toCsv(model, result, selected.name)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename(model, selected.name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Give the download a tick to start before the blob is reclaimed.
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const cashColour = result.profitCents >= 0 ? "var(--c-gain)" : "var(--c-loss)";
  const unconfirmedShare = result.totalRevenueCents > 0 ? result.unconfirmedRevenueCents / result.totalRevenueCents : 0;

  return (
    <div className="proj">
      {/* ── header ───────────────────────────────────────────── */}
      <div className="proj-head">
        <div>
          <h1 className="proj-title">Projections</h1>
          <p className="proj-sub">
            The yearly budget model, driven by the same two formulas the 2024 workbook rested on — and by everything it
            never showed you. Super admins only; nothing here can change a single payment.
          </p>
        </div>
        <div className="proj-chips">
          {!readOnly ? (
            <button
              type="button"
              className="proj-btn proj-btn--primary"
              disabled={!dirty || pending}
              onClick={() => run(() => saveScenarioAction(selected.id, model))}
            >
              {pending ? "Saving…" : dirty ? "Save changes" : "Saved"}
            </button>
          ) : (
            <button type="button" className="proj-btn" disabled={pending} onClick={() => run(() => unlockScenarioAction(selected.id))}>
              🔓 Unlock to edit
            </button>
          )}
          <button type="button" className="proj-btn" onClick={() => setShowNew((v) => !v)}>
            + New scenario
          </button>
          <button type="button" className="proj-btn" disabled={pending} onClick={() => run(() => takeSnapshotAction(selected.id))}>
            📌 Snapshot now
          </button>
          <button type="button" className="proj-btn proj-no-print" onClick={downloadCsv}>
            ⤓ CSV
          </button>
          <button type="button" className="proj-btn proj-no-print" onClick={() => window.print()}>
            🖨 Print
          </button>
          <button
            type="button"
            className="proj-chip"
            aria-pressed={compareMode}
            onClick={() => {
              setCompareMode((v) => !v);
              if (compareMode) setCompare([]);
            }}
          >
            ⇄ Compare{compare.length ? ` (${compare.length})` : ""}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {msg ? (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            style={{
              margin: "0 0 0.9rem",
              fontSize: "0.8rem",
              fontWeight: 600,
              color: msg.ok ? "var(--c-ok)" : "var(--c-crit)",
            }}
            role="status"
          >
            {msg.ok ? "✓" : "✕"} {msg.text}
          </motion.p>
        ) : null}
      </AnimatePresence>

      {/* scenario chips */}
      <div className="proj-chips" style={{ marginBottom: "0.9rem" }}>
        {scenarios.map((s) => {
          const inCompare = compare.includes(s.id);
          const isCurrent = s.id === selectedId;
          return (
            <button
              key={s.id}
              type="button"
              className="proj-chip"
              aria-pressed={compareMode ? inCompare || isCurrent : isCurrent}
              data-baseline={s.locked}
              title={s.description ?? undefined}
              disabled={compareMode && isCurrent}
              onClick={() =>
                compareMode
                  ? setCompare((c) => (c.includes(s.id) ? c.filter((x) => x !== s.id) : [...c, s.id].slice(-3)))
                  : setSelectedId(s.id)
              }
            >
              {compareMode ? (inCompare || isCurrent ? "✓ " : "＋ ") : ""}
              {s.year} · {stripYear(s.name)}
            </button>
          );
        })}
        <span style={{ fontSize: "0.7rem", color: "var(--ink-soft)", paddingLeft: "0.35rem" }}>
          {compareMode
            ? "Pick up to three more to put beside this one."
            : "Pick a scenario to open it."}
        </span>
      </div>

      {showNew ? (
        <NewScenarioPanel
          scenarios={scenarios}
          current={{ id: selected.id, model }}
          busy={pending}
          onClose={() => setShowNew(false)}
          onCreate={(input) =>
            run(async () => {
              const r = await createScenarioAction(input);
              if (r.ok && r.id) {
                setShowNew(false);
                setSelectedId(r.id);
              }
              return r;
            })
          }
        />
      ) : null}

      {/* ── hero + tiles ─────────────────────────────────────── */}
      <div className="proj-hero">
        <div className="proj-card proj-tile">
          <p className="proj-tile-label">Profit / loss</p>
          <p className="proj-tile-value proj-hero-value" style={{ color: cashColour }}>
            <AnimatedMoney cents={result.profitCents} format={moneySigned} />
          </p>
          <p className="proj-tile-foot">
            Cash after the {money0(model.carryInCents)} carried in:{" "}
            <b style={{ color: result.cashAfterCarryInCents >= 0 ? "var(--c-gain)" : "var(--c-loss)" }}>
              {moneySigned(result.cashAfterCarryInCents)}
            </b>
          </p>
        </div>

        <div className="proj-card proj-tile">
          <p className="proj-tile-label">Revenue</p>
          <p className="proj-tile-value proj-pos">
            <AnimatedMoney cents={result.totalRevenueCents} />
          </p>
          <p className="proj-tile-foot">
            {unconfirmedShare > 0.001 ? (
              <>
                <b style={{ color: unconfirmedShare > 0.15 ? "var(--c-warn)" : undefined }}>{pct(unconfirmedShare)}</b>{" "}
                not confirmed
              </>
            ) : (
              "All lines confirmed"
            )}
            {actuals.registrationCents > 0 ? (
              <>
                <br />
                {money0(actuals.registrationCents)} banked so far
              </>
            ) : null}
          </p>
        </div>

        <div className="proj-card proj-tile">
          <p className="proj-tile-label">Expenses</p>
          <p className="proj-tile-value proj-neg">
            <AnimatedMoney cents={result.totalExpenseCents} />
          </p>
          <p className="proj-tile-foot">
            {money0(result.fixedCostCents)} fixed · {money0(result.variableCostCents)} food
          </p>
        </div>

        <div className="proj-card proj-tile">
          <p className="proj-tile-label">Guests</p>
          <p className="proj-tile-value">{num(result.totalHeads)}</p>
          <p className="proj-tile-foot">
            {moneySigned(result.contributionPerHeadCents)} average contribution per guest
            {actuals.totalHeads > 0 ? (
              <>
                <br />
                {num(actuals.totalHeads)} booked{actuals.daysOut !== null ? `, ${actuals.daysOut} days out` : ""}
              </>
            ) : null}
          </p>
        </div>
      </div>

      {compareMode ? <CompareView ids={[selectedId, ...compare]} scenarios={scenarios} /> : null}

      {/* ── body ─────────────────────────────────────────────── */}
      <div className="proj-body">
        <div className="proj-rail">
          {readOnly ? (
            <div className="proj-card" style={{ borderColor: "var(--c-warn)" }}>
              <h2 className="proj-card-title">🔒 Locked baseline</h2>
              <p className="proj-card-note" style={{ margin: 0 }}>
                This is the record of a finished year. Duplicate it to start a new plan, or unlock it if it genuinely
                needs correcting.
              </p>
            </div>
          ) : null}
          <DriverPanel model={model} result={result} actuals={actuals} onChange={update} readOnly={readOnly} />
        </div>

        <div className="proj-main">
          <div className="proj-card">
            <h2 className="proj-card-title">Where the money goes</h2>
            <p className="proj-card-note">
              Every head that lifts the line, every head that pulls it down, and where it lands. Hover a bar for its
              detail.
            </p>
            <Waterfall steps={waterfall} />
          </div>

          <div className="proj-row2">
            <div className="proj-card">
              <h2 className="proj-card-title">Break-even</h2>
              <p className="proj-card-note">How many guests it takes to pay for the year, at today&rsquo;s mix.</p>
              <BreakEvenArc
                currentHeads={result.breakEven.currentHeads}
                breakEvenHeads={result.breakEven.reachable ? result.breakEven.heads : 0}
                reachable={result.breakEven.reachable}
              />
            </div>

            <div className="proj-card">
              <h2 className="proj-card-title">
                How likely is this plan? {computing ? <span style={{ opacity: 0.5 }}>· updating</span> : null}
              </h2>
              <p className="proj-card-note">
                1,500 simulated years, drawing each driver from a three-point band. Latin-Hypercube sampled, seeded — the
                same plan always gives the same picture.
              </p>
              <FanChart mc={heavy?.mc ?? null} />
            </div>
          </div>

          {gap && Math.abs(gap.gapCents) >= 100 ? (
            <div className="proj-card" style={{ borderColor: gap.gapCents > 0 ? "var(--c-crit)" : "var(--c-ok)" }}>
              <h2 className="proj-card-title">
                {gap.gapCents > 0 ? "The gap — and what closes it" : "Headroom — and what it buys"}
              </h2>
              <p className="proj-card-note">
                {gap.gapCents > 0 ? (
                  <>
                    You are <b style={{ color: "var(--c-crit)" }}>{money0(gap.gapCents)}</b> short of your target. Any{" "}
                    <b>one</b> of these closes it.
                  </>
                ) : (
                  <>
                    You are <b style={{ color: "var(--c-ok)" }}>{money0(-gap.gapCents)}</b> ahead of target. That buys
                    any one of these.
                  </>
                )}
              </p>
              <div className="proj-gap">
                {gap.options.map((o) => (
                  <motion.div
                    key={o.key}
                    className="proj-gap-card"
                    data-feasible={o.feasible}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 200, damping: 24 }}
                  >
                    <p className="proj-gap-label">{o.label}</p>
                    <p className="proj-gap-detail">{o.detail}</p>
                    {o.blocker ? (
                      <p className="proj-gap-detail" style={{ color: "var(--c-warn)", marginTop: "0.25rem" }}>
                        ⚠ {o.blocker}
                      </p>
                    ) : null}
                  </motion.div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="proj-row2">
            <div className="proj-card">
              <h2 className="proj-card-title">Biggest levers</h2>
              <p className="proj-card-note">Each driver pushed ±20%, and what it does to the bottom line.</p>
              <Tornado rows={tornado} />
            </div>
            <div className="proj-card">
              <h2 className="proj-card-title">Biggest risks</h2>
              <p className="proj-card-note">
                A different question: of the uncertainty in the outcome, how much does each driver actually cause?
                Sobol variance decomposition over the same bands.
              </p>
              <SobolChart indices={heavy?.sobol ?? []} />
            </div>
          </div>

          <div className="proj-card">
            <h2 className="proj-card-title">Registrations, and where they are heading</h2>
            <p className="proj-card-note">
              {usingBaselinePace
                ? "Showing the real 2024 booking curve — the three footfall counts the committee typed by hand, on 20, 14 and 6 days out."
                : "Take a snapshot each week and this forecast corrects itself toward this year's own trend."}
            </p>
            {result.totalHeads >= 10 ? (
              <PaceChart forecast={pace} snapshots={snapPoints} />
            ) : (
              <p className="proj-empty">
                This scenario plans no attendance, so there is nothing to pace against. Set some attendance in the
                drivers first.
              </p>
            )}
          </div>

          <div className="proj-card">
            <h2 className="proj-card-title">Risk flags</h2>
            <p className="proj-card-note">The things that quietly went wrong in 2024, checked continuously.</p>
            <div className="proj-flags">
              {flags.map((f) => (
                <motion.div
                  key={f.key}
                  className="proj-flag"
                  data-level={f.level}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: "spring", stiffness: 220, damping: 26 }}
                >
                  <span className="proj-flag-icon" aria-hidden>
                    {f.level === "critical" ? "⛔" : f.level === "warn" ? "⚠️" : "✅"}
                  </span>
                  <span>
                    <p className="proj-flag-title">{f.title}</p>
                    <p className="proj-flag-detail">{f.detail}</p>
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          <LineTables model={model} result={result} onChange={update} readOnly={readOnly} />

          <div className="proj-card">
            <h2 className="proj-card-title">End of the year</h2>
            <p className="proj-card-note">
              When the event is done and the actuals are in, capture this scenario as the year&rsquo;s baseline. Actuals
              replace projections, the row locks, and next year&rsquo;s committee starts from what happened instead of
              from a copied spreadsheet.
            </p>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="proj-btn proj-btn--primary"
                disabled={pending || dirty}
                title={dirty ? "Save your changes first" : undefined}
                onClick={() => run(() => captureBaselineAction(selected.id, `${model.year} baseline`))}
              >
                Capture as the {model.year} baseline
              </button>
              {!selected.locked ? (
                <button
                  type="button"
                  className="proj-btn proj-btn--danger"
                  disabled={pending}
                  onClick={() => run(() => deleteScenarioAction(selected.id))}
                >
                  Delete this scenario
                </button>
              ) : null}
              {model.modifiers.attendancePct !== 100 ||
              model.modifiers.pricePct !== 100 ||
              model.modifiers.costPct !== 100 ||
              model.modifiers.sponsorshipPct !== 100 ? (
                <button type="button" className="proj-btn" disabled={readOnly} onClick={() => update(bakeModifiers(model))}>
                  Bake the modifiers into the lines
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── new scenario ─────────────────────────────────────────────────

function NewScenarioPanel({
  scenarios,
  current,
  busy,
  onClose,
  onCreate,
}: {
  scenarios: ScenarioLite[];
  current: { id: string; model: ProjectionModel };
  busy: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; year: number; model: ProjectionModel; seededFrom?: string }) => void;
}) {
  const thisYear = new Date().getFullYear();
  const [name, setName] = useState(`${thisYear} plan`);
  const [year, setYear] = useState(thisYear);
  const [source, setSource] = useState(current.id);
  const [escalation, setEscalation] = useState(0);

  const build = (): ProjectionModel => {
    const base = scenarios.find((s) => s.id === source)?.model ?? current.model;
    const f = 1 + escalation / 100;
    // Hall quotes and artist fees do not stay still between years — and neither
    // does catering, which is the biggest cost in the model, so the escalation
    // has to reach the per-head food cost as well or it understates the year.
    // Attendance and ticket prices are yours to decide, so they copy untouched.
    return {
      ...base,
      year,
      days: base.days.map((day) => ({
        ...day,
        foodCost: {
          breakfast: Math.round(day.foodCost.breakfast * f),
          lunch: Math.round(day.foodCost.lunch * f),
          dinner: Math.round(day.foodCost.dinner * f),
          kid: Math.round(day.foodCost.kid * f),
        },
      })),
      costLines: base.costLines.map((l) => (l.computed ? l : { ...l, amountCents: Math.round(l.amountCents * f), actualCents: null })),
      revenueLines: base.revenueLines.map((l) => ({ ...l, actualCents: null })),
    };
  };

  return (
    <motion.div
      className="proj-card"
      style={{ marginBottom: "1rem", borderColor: "var(--accent)" }}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
    >
      <h2 className="proj-card-title">New scenario</h2>
      <p className="proj-card-note">
        Seed it from a finished year and apply an escalation, or duplicate one of this year&rsquo;s plans and change one
        thing.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.6rem", alignItems: "end" }}>
        <label style={{ fontSize: "0.75rem", display: "grid", gap: "0.2rem" }}>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ font: "inherit", padding: "0.35rem 0.5rem", border: "1px solid var(--line)", borderRadius: 6, background: "var(--bg-soft)", color: "var(--ink)" }}
          />
        </label>
        <label style={{ fontSize: "0.75rem", display: "grid", gap: "0.2rem" }}>
          Year
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || thisYear)}
            style={{ font: "inherit", padding: "0.35rem 0.5rem", border: "1px solid var(--line)", borderRadius: 6, background: "var(--bg-soft)", color: "var(--ink)" }}
          />
        </label>
        <label style={{ fontSize: "0.75rem", display: "grid", gap: "0.2rem" }}>
          Seed from
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            style={{ font: "inherit", padding: "0.35rem 0.5rem", border: "1px solid var(--line)", borderRadius: 6, background: "var(--bg-soft)", color: "var(--ink)" }}
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.year} · {s.name}
                {s.isBaseline ? " (baseline)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: "0.75rem", display: "grid", gap: "0.2rem" }}>
          Cost escalation %
          <input
            type="number"
            value={escalation}
            onChange={(e) => setEscalation(Number(e.target.value) || 0)}
            style={{ font: "inherit", padding: "0.35rem 0.5rem", border: "1px solid var(--line)", borderRadius: 6, background: "var(--bg-soft)", color: "var(--ink)" }}
          />
        </label>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.8rem" }}>
        <button
          type="button"
          className="proj-btn proj-btn--primary"
          disabled={busy || !name.trim()}
          onClick={() => onCreate({ name: name.trim(), year, model: build(), seededFrom: source })}
        >
          Create
        </button>
        <button type="button" className="proj-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </motion.div>
  );
}

// ── compare ──────────────────────────────────────────────────────

/** Scenario names already carry their year ("2024 · S3 …"); the chips and the
 *  comparison table print the year themselves, so strip the duplicate. */
function stripYear(name: string): string {
  return name.replace(/^\d{4}\s*[·.\-]?\s*/, "");
}

function CompareView({ ids, scenarios }: { ids: string[]; scenarios: ScenarioLite[] }) {
  const picked = [...new Set(ids)]
    .map((id) => scenarios.find((s) => s.id === id))
    .filter(Boolean) as ScenarioLite[];
  const rows = picked.map((s) => ({ s, r: calculate(s.model) }));
  if (rows.length === 0) return null;
  const span = Math.max(...rows.flatMap((x) => [x.r.totalRevenueCents, x.r.totalExpenseCents, Math.abs(x.r.profitCents)]), 1);

  return (
    <div className="proj-card" style={{ marginBottom: "1rem" }}>
      <h2 className="proj-card-title">Side by side</h2>
      <p className="proj-card-note">
        The scenario you are working on, plus any you tick above — four at a time. The bars are revenue over expenses
        on one shared scale, so a taller red bar than green is a loss you can see without reading a number.
      </p>
      <div className="proj-scroll">
        <table className="proj-table">
          <thead>
            <tr>
              <th>Scenario</th>
              <th className="num">Revenue</th>
              <th className="num">Expenses</th>
              <th className="num">Profit / loss</th>
              <th className="num">Guests</th>
              <th style={{ width: "34%" }}>Shape</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, r }) => (
              <tr key={s.id}>
                <td>
                  {s.year} · {stripYear(s.name)}
                </td>
                <td className="num proj-pos">{money0(r.totalRevenueCents)}</td>
                <td className="num proj-neg">{money0(r.totalExpenseCents)}</td>
                <td className="num" style={{ fontWeight: 800, color: r.profitCents >= 0 ? "var(--c-gain)" : "var(--c-loss)" }}>
                  {moneySigned(r.profitCents)}
                </td>
                <td className="num">{num(r.totalHeads)}</td>
                <td>
                  <span style={{ display: "grid", gap: 2 }}>
                    <Bar w={(r.totalRevenueCents / span) * 100} colour="var(--c-gain)" />
                    <Bar w={(r.totalExpenseCents / span) * 100} colour="var(--c-loss)" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Bar({ w, colour }: { w: number; colour: string }) {
  return (
    <span style={{ display: "block", height: 8, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
      <motion.span
        style={{ display: "block", height: "100%", background: colour, borderRadius: 3 }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.max(1, Math.min(100, w))}%` }}
        transition={{ type: "spring", bounce: 0, duration: 0.5 }}
      />
    </span>
  );
}
