"use client";

/**
 * Everything you can move, in one rail.
 *
 * Three layers, in the order a committee actually thinks:
 *   1. MODIFIERS — "what if 15% more people come / everything inflates 8%".
 *      Global multipliers, non-destructive, reversible in one click.
 *   2. DAYS — attendance, price and food cost per head, each with the day's
 *      contribution-margin strip underneath. That strip is the most important
 *      thing on this screen: at 2024 prices a Sunday with-food ticket lost
 *      $1.80 and a kid lost $19.50, and no version of the spreadsheet showed it.
 *   3. HEADS — one slider per roll-up head, which distributes proportionally
 *      across that head's lines. Sliders are for exploring, the number field
 *      beside each one is for hitting $19,000 exactly.
 */
import { motion } from "framer-motion";
import { marginsFor, setHeadTotal, type EngineResult } from "@/lib/projections/engine";
import {
  COST_HEADS,
  REVENUE_HEADS,
  SEGMENTS,
  SEGMENT_LABEL,
  type ProjectionModel,
  type Segment,
} from "@/lib/projections/types";
import type { HeadActuals } from "@/lib/projections/actuals";
import { Slider, money0, moneySigned, num } from "./primitives";

const pctFmt = (v: number) => `${Math.round(v)}%`;
const dollars = (cents: number) => `$${(cents / 100).toFixed(0)}`;
const parseDollars = (t: string) => {
  const n = Number(t.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const parsePlain = (t: string) => {
  const n = Number(t.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export default function DriverPanel({
  model,
  result,
  actuals,
  onChange,
  readOnly,
}: {
  model: ProjectionModel;
  result: EngineResult;
  actuals: HeadActuals | null;
  onChange: (m: ProjectionModel) => void;
  readOnly: boolean;
}) {
  const margins = marginsFor(model);
  const modified =
    model.modifiers.attendancePct !== 100 ||
    model.modifiers.pricePct !== 100 ||
    model.modifiers.costPct !== 100 ||
    model.modifiers.sponsorshipPct !== 100;

  const setMod = (k: keyof ProjectionModel["modifiers"], v: number) =>
    onChange({ ...model, modifiers: { ...model.modifiers, [k]: v } });

  const setDay = (key: string, patch: Partial<ProjectionModel["days"][number]>) =>
    onChange({ ...model, days: model.days.map((d) => (d.key === key ? { ...d, ...patch } : d)) });

  // Live attendance for the ghost overlay: what is actually booked, per day.
  const bookedFor = (dayKey: string) => {
    if (!actuals) return null;
    const exact = actuals.attendance[dayKey];
    const all = actuals.attendance["all"];
    if (!exact && !all) return null;
    return {
      withFood: (exact?.withFood ?? 0) + (all?.withFood ?? 0),
      withoutFood: (exact?.withoutFood ?? 0) + (all?.withoutFood ?? 0),
      kids: (exact?.kids ?? 0) + (all?.kids ?? 0),
    };
  };

  return (
    <>
      {/* ── 1. modifiers ─────────────────────────────────────── */}
      <div className="proj-card">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
          <h2 className="proj-card-title">What-if modifiers</h2>
          {modified ? (
            <span
              className="proj-conf"
              data-c="expected"
              title="These multipliers are layered on top of your entered numbers"
            >
              modified
            </span>
          ) : null}
        </div>
        <p className="proj-card-note">
          Layered on top of everything below and reversible in one click. Bake them in when an exploration becomes the
          plan.
        </p>

        <Slider label="Attendance" value={model.modifiers.attendancePct} min={50} max={170} step={1} format={pctFmt} parse={parsePlain} onChange={(v) => setMod("attendancePct", v)} disabled={readOnly} />
        <Slider label="Ticket prices" value={model.modifiers.pricePct} min={50} max={180} step={1} format={pctFmt} parse={parsePlain} onChange={(v) => setMod("pricePct", v)} disabled={readOnly} />
        <Slider label="Cost inflation" value={model.modifiers.costPct} min={60} max={180} step={1} format={pctFmt} parse={parsePlain} onChange={(v) => setMod("costPct", v)} accent="var(--c-loss)" disabled={readOnly} />
        <Slider label="Sponsorship" value={model.modifiers.sponsorshipPct} min={0} max={220} step={5} format={pctFmt} parse={parsePlain} onChange={(v) => setMod("sponsorshipPct", v)} accent="var(--c-gain)" disabled={readOnly} />

        {modified && !readOnly ? (
          <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
            <button
              type="button"
              className="proj-btn"
              onClick={() => onChange({ ...model, modifiers: { attendancePct: 100, pricePct: 100, costPct: 100, sponsorshipPct: 100 } })}
            >
              Reset
            </button>
          </div>
        ) : null}
      </div>

      {/* ── 2. days ──────────────────────────────────────────── */}
      <div className="proj-card">
        <h2 className="proj-card-title">Days & attendance</h2>
        <p className="proj-card-note">
          The engine of the whole model: attendance drives ticket revenue and food cost at the same time. Turn a day off
          to model dropping it entirely.
        </p>

        {model.days.map((day) => {
          const dayMargins = margins.filter((m) => m.dayKey === day.key);
          const booked = bookedFor(day.key);
          const maxMargin = Math.max(1, ...margins.map((m) => Math.abs(m.marginCents)));

          return (
            <div className="proj-day" key={day.key} data-off={!day.enabled}>
              <div className="proj-day-head">
                <h3 className="proj-day-name">{day.label}</h3>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--ink-soft)", fontVariantNumeric: "tabular-nums" }}>
                    {num((result.days.find((d) => d.key === day.key)?.totalHeads ?? 0))} guests
                  </span>
                  <button
                    type="button"
                    className="proj-toggle"
                    aria-pressed={day.enabled}
                    aria-label={`${day.enabled ? "Drop" : "Add back"} ${day.label}`}
                    disabled={readOnly}
                    onClick={() => setDay(day.key, { enabled: !day.enabled })}
                  />
                </span>
              </div>

              {day.driverMode === "manual" ? (
                <p className="proj-tile-foot" style={{ marginTop: 0 }}>
                  Flat lines rather than drivers — as 2024 treated it. Edit its revenue and food lines in the tables.
                </p>
              ) : (
                <>
                  {SEGMENTS.map((seg: Segment) => {
                    const planned = day.attendance[seg] || 0;
                    const live = booked?.[seg];
                    return (
                      <Slider
                        key={seg}
                        label={SEGMENT_LABEL[seg]}
                        hint={live !== undefined && live > 0 ? `${live} booked` : undefined}
                        value={planned}
                        min={0}
                        max={Math.max(100, Math.ceil((planned || 50) * 2.2))}
                        step={1}
                        format={(v) => num(v)}
                        parse={parsePlain}
                        onChange={(v) => setDay(day.key, { attendance: { ...day.attendance, [seg]: v } })}
                        disabled={readOnly || !day.enabled}
                      />
                    );
                  })}

                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "0.4rem", marginTop: "0.35rem" }}>
                    <Slider
                      label="Price · with food"
                      value={day.price.withFood}
                      min={0}
                      max={25000}
                      step={100}
                      format={dollars}
                      parse={parseDollars}
                      onChange={(v) => setDay(day.key, { price: { ...day.price, withFood: v } })}
                      disabled={readOnly || !day.enabled}
                      accent="var(--c-gain)"
                    />
                    <Slider
                      label="Price · no food"
                      value={day.price.withoutFood}
                      min={0}
                      max={25000}
                      step={100}
                      format={dollars}
                      parse={parseDollars}
                      onChange={(v) => setDay(day.key, { price: { ...day.price, withoutFood: v } })}
                      disabled={readOnly || !day.enabled}
                      accent="var(--c-gain)"
                    />
                    <Slider
                      label="Price · kids"
                      value={day.price.kids}
                      min={0}
                      max={15000}
                      step={100}
                      format={dollars}
                      parse={parseDollars}
                      onChange={(v) => setDay(day.key, { price: { ...day.price, kids: v } })}
                      disabled={readOnly || !day.enabled}
                      accent="var(--c-gain)"
                    />
                    <Slider
                      label="Food · adult"
                      hint="per head"
                      value={day.foodCost.breakfast + day.foodCost.lunch + day.foodCost.dinner}
                      min={0}
                      max={12000}
                      step={50}
                      format={dollars}
                      parse={parseDollars}
                      onChange={(v) =>
                        setDay(day.key, { foodCost: { ...day.foodCost, breakfast: 0, lunch: 0, dinner: v } })
                      }
                      disabled={readOnly || !day.enabled}
                      accent="var(--c-loss)"
                    />
                    <Slider
                      label="Food · kid"
                      hint="per head"
                      value={day.foodCost.kid}
                      min={0}
                      max={8000}
                      step={50}
                      format={dollars}
                      parse={parseDollars}
                      onChange={(v) => setDay(day.key, { foodCost: { ...day.foodCost, kid: v } })}
                      disabled={readOnly || !day.enabled}
                      accent="var(--c-loss)"
                    />
                  </div>

                  {/* the margin strip */}
                  <div className="proj-margin" role="table" aria-label={`${day.label} contribution margin per guest`}>
                    {dayMargins.map((m) => {
                      const frac = Math.abs(m.marginCents) / maxMargin;
                      const positive = m.marginCents >= 0;
                      return (
                        <div className="proj-margin-row" key={m.segment} role="row">
                          <span style={{ color: "var(--ink-soft)" }} role="cell">
                            {SEGMENT_LABEL[m.segment]}
                          </span>
                          <span className="proj-margin-track" role="cell">
                            <span className="proj-margin-zero" style={{ left: "50%" }} />
                            <motion.span
                              style={{
                                position: "absolute",
                                top: 0,
                                bottom: 0,
                                background: positive ? "var(--c-gain)" : "var(--c-loss)",
                                borderRadius: 3,
                                left: positive ? "50%" : undefined,
                                right: positive ? undefined : "50%",
                              }}
                              animate={{ width: `${Math.min(50, frac * 50)}%` }}
                              transition={{ type: "spring", bounce: 0, duration: 0.45 }}
                            />
                          </span>
                          <span
                            className="proj-margin-num"
                            style={{ color: positive ? "var(--c-gain)" : "var(--c-loss)" }}
                            role="cell"
                          >
                            {moneySigned(m.marginCents)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {dayMargins.some((m) => m.marginCents < 0) ? (
                    <p className="proj-tile-foot" style={{ color: "var(--c-crit)", fontWeight: 600 }}>
                      ⚠ Every extra guest in a red row costs you money.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          );
        })}

        <div style={{ marginTop: "0.8rem", paddingTop: "0.7rem", borderTop: "1px solid var(--line)" }}>
          <Slider
            label="Food buffer"
            hint="wastage & over-catering"
            value={model.buffers.foodPct}
            min={0}
            max={60}
            step={1}
            format={pctFmt}
            parse={parsePlain}
            onChange={(v) => onChange({ ...model, buffers: { ...model.buffers, foodPct: v } })}
            accent="var(--c-loss)"
            disabled={readOnly}
          />
          <Slider
            label="No-food uplift"
            hint="the sheet's ×1.1"
            value={model.buffers.nonFoodUpliftPct}
            min={0}
            max={40}
            step={1}
            format={pctFmt}
            parse={parsePlain}
            onChange={(v) => onChange({ ...model, buffers: { ...model.buffers, nonFoodUpliftPct: v } })}
            accent="var(--c-gain)"
            disabled={readOnly}
          />
        </div>
      </div>

      {/* ── 3. head sliders ──────────────────────────────────── */}
      <div className="proj-card">
        <h2 className="proj-card-title">Cost heads</h2>
        <p className="proj-card-note">
          Dragging a head spreads the change across its lines proportionally. Pin one to hold it — a pinned head is left
          out of the suggestions and held fixed in the risk model.
        </p>
        {COST_HEADS.map((h) => {
          const value = result.costByHead[h.key as keyof typeof result.costByHead] ?? 0;
          const computed = h.key === "food";
          return (
            <Slider
              key={h.key}
              label={h.label}
              hint={computed ? "driven by attendance" : h.hint}
              value={value}
              min={h.min}
              max={Math.max(h.max, value)}
              step={h.step}
              format={money0}
              parse={parseDollars}
              onChange={(v) => onChange(setHeadTotal(model, h.key, v))}
              disabled={readOnly || computed}
              accent="var(--c-loss)"
              locked={model.costLines.filter((l) => l.head === h.key && !l.computed).every((l) => l.locked) && model.costLines.some((l) => l.head === h.key && !l.computed)}
              onLockToggle={
                computed || readOnly
                  ? undefined
                  : () => {
                      const inHead = model.costLines.filter((l) => l.head === h.key && !l.computed);
                      const allLocked = inHead.length > 0 && inHead.every((l) => l.locked);
                      onChange({
                        ...model,
                        costLines: model.costLines.map((l) =>
                          l.head === h.key && !l.computed ? { ...l, locked: !allLocked } : l
                        ),
                      });
                    }
              }
            />
          );
        })}
      </div>

      <div className="proj-card">
        <h2 className="proj-card-title">Revenue heads</h2>
        <p className="proj-card-note">
          Sponsorship carries no cost, so a dollar there is a dollar on the bottom line — which is why it is the fastest
          gap to close.
        </p>
        {REVENUE_HEADS.map((h) => {
          const value = result.revenueByHead[h.key as keyof typeof result.revenueByHead] ?? 0;
          const computed = h.key === "footfall";
          const tables =
            h.key === "stalls"
              ? model.revenueLines.reduce((s, l) => s + (l.head === "stalls" ? l.tables ?? 0 : 0), 0)
              : 0;
          return (
            <Slider
              key={h.key}
              label={h.label}
              hint={computed ? "driven by attendance" : tables > 0 ? `${tables} tables booked` : h.hint}
              value={value}
              min={h.min}
              max={Math.max(h.max, value)}
              step={h.step}
              format={money0}
              parse={parseDollars}
              onChange={(v) => onChange(setHeadTotal(model, h.key, v))}
              disabled={readOnly || computed}
              accent="var(--c-gain)"
              locked={model.revenueLines.filter((l) => l.head === h.key && !l.computed).every((l) => l.locked) && model.revenueLines.some((l) => l.head === h.key && !l.computed)}
              onLockToggle={
                computed || readOnly
                  ? undefined
                  : () => {
                      const inHead = model.revenueLines.filter((l) => l.head === h.key && !l.computed);
                      const allLocked = inHead.length > 0 && inHead.every((l) => l.locked);
                      onChange({
                        ...model,
                        revenueLines: model.revenueLines.map((l) =>
                          l.head === h.key && !l.computed ? { ...l, locked: !allLocked } : l
                        ),
                      });
                    }
              }
            />
          );
        })}

        <div style={{ marginTop: "0.7rem", paddingTop: "0.6rem", borderTop: "1px solid var(--line)" }}>
          <Slider
            label="Cash carried in"
            hint="last year's leftover in hand"
            value={model.carryInCents}
            min={0}
            max={Math.max(2_500_000, model.carryInCents)}
            step={10_000}
            format={money0}
            parse={parseDollars}
            onChange={(v) => onChange({ ...model, carryInCents: v })}
            disabled={readOnly}
          />
          <Slider
            label="Target surplus"
            hint="what the gap closer aims at"
            value={model.targetProfitCents}
            min={0}
            max={3_000_000}
            step={50_000}
            format={money0}
            parse={parseDollars}
            onChange={(v) => onChange({ ...model, targetProfitCents: v })}
            disabled={readOnly}
          />
        </div>
      </div>
    </>
  );
}
