"use client";

/**
 * The lines themselves — the record the sliders are a grip on.
 *
 * Four columns per row: what you planned, how sure you are, what actually
 * happened, and the difference. The confidence column is the fix for the 2024
 * workbook's worst bug: three "expected" sponsors sat below the roll-up's
 * formula range, so the headline said $105,730 and the roll-up said $90,730.
 * Here confidence is a property of the line, every line is counted exactly
 * once, and "unconfirmed" is a number on the risk panel rather than a surprise.
 */
import { Fragment, useState } from "react";
import { effectiveLineCents, type EngineResult } from "@/lib/projections/engine";
import {
  COST_HEADS,
  REVENUE_HEADS,
  newId,
  type Confidence,
  type Head,
  type Line,
  type ProjectionModel,
} from "@/lib/projections/types";
import { money, money0, moneySigned } from "./primitives";

const CONFIDENCES: Confidence[] = ["confirmed", "expected", "stretch"];

export default function LineTables({
  model,
  result,
  onChange,
  readOnly,
}: {
  model: ProjectionModel;
  result: EngineResult;
  onChange: (m: ProjectionModel) => void;
  readOnly: boolean;
}) {
  // Deliberately stacked, not side by side: six columns (line · projected ·
  // confidence · actual · variance · delete) do not fit in half a column, and a
  // table you have to scroll sideways to read the variance of is a table nobody
  // reads the variance of.
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "1rem" }}>
      <Side
        title="Costs"
        side="costLines"
        heads={COST_HEADS}
        model={model}
        result={result}
        onChange={onChange}
        readOnly={readOnly}
        accent="var(--c-loss)"
      />
      <Side
        title="Revenue"
        side="revenueLines"
        heads={REVENUE_HEADS}
        model={model}
        result={result}
        onChange={onChange}
        readOnly={readOnly}
        accent="var(--c-gain)"
      />
    </div>
  );
}

function Side({
  title,
  side,
  heads,
  model,
  result,
  onChange,
  readOnly,
  accent,
}: {
  title: string;
  side: "costLines" | "revenueLines";
  heads: { key: Head; label: string; hint: string }[];
  model: ProjectionModel;
  result: EngineResult;
  onChange: (m: ProjectionModel) => void;
  readOnly: boolean;
  accent: string;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const kind = side === "costLines" ? "cost" : "revenue";
  const lines = model[side];

  const patch = (id: string, p: Partial<Line>) =>
    onChange({ ...model, [side]: lines.map((l) => (l.id === id ? { ...l, ...p } : l)) } as ProjectionModel);

  const remove = (id: string) =>
    onChange({ ...model, [side]: lines.filter((l) => l.id !== id) } as ProjectionModel);

  const add = (head: Head) =>
    onChange({
      ...model,
      [side]: [...lines, { id: newId(), head, label: "New line", amountCents: 0, confidence: "expected" as Confidence }],
    } as ProjectionModel);

  const headTotal = (head: Head) =>
    kind === "cost"
      ? result.costByHead[head as keyof typeof result.costByHead] ?? 0
      : result.revenueByHead[head as keyof typeof result.revenueByHead] ?? 0;

  return (
    <div className="proj-card">
      <h2 className="proj-card-title">{title}</h2>
      <p className="proj-card-note">
        Click a head to open its lines. Two lines are computed from the drivers and cannot be typed over.
      </p>

      <div className="proj-scroll">
        <table className="proj-table">
          <thead>
            <tr>
              <th style={{ width: "42%" }}>Line</th>
              <th className="num">Projected</th>
              <th>Confidence</th>
              <th className="num">Actual</th>
              <th className="num">Variance</th>
              {readOnly ? null : <th />}
            </tr>
          </thead>
          <tbody>
            {heads.map((h) => {
              const inHead = lines.filter((l) => l.head === h.key);
              const isOpen = open[h.key];
              const actualSum = inHead.reduce((s, l) => s + (l.actualCents ?? 0), 0);
              const total = headTotal(h.key);
              return (
                <Fragment key={h.key}>
                  <tr data-head-row="true">
                    <td>
                      <button
                        type="button"
                        onClick={() => setOpen((o) => ({ ...o, [h.key]: !o[h.key] }))}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          font: "inherit",
                          color: "inherit",
                          padding: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          lineHeight: 1.4,
                          // 24px minimum tappable height (WCAG 2.2 AA, 2.5.8)
                          minHeight: 24,
                        }}
                        aria-expanded={!!isOpen}
                      >
                        <span aria-hidden style={{ color: accent }}>{isOpen ? "▾" : "▸"}</span>
                        {h.label}
                        <span style={{ fontWeight: 400, color: "var(--ink-soft)", fontSize: "0.7rem" }}>
                          ({inHead.length})
                        </span>
                      </button>
                    </td>
                    <td className="num">{money0(total)}</td>
                    <td />
                    <td className="num">{actualSum ? money0(actualSum) : "—"}</td>
                    <td className="num" style={{ color: actualSum ? (actualSum - total >= 0 ? "var(--c-gain)" : "var(--c-loss)") : undefined }}>
                      {actualSum ? moneySigned(kind === "cost" ? total - actualSum : actualSum - total) : "—"}
                    </td>
                    {readOnly ? null : <td />}
                  </tr>

                  {isOpen
                    ? inHead.map((l) => {
                        const projected = effectiveLineCents(l, model, kind);
                        const actual = l.actualCents ?? null;
                        // For a cost, coming in UNDER is good; for revenue, over.
                        const variance = actual === null ? null : kind === "cost" ? projected - actual : actual - projected;
                        return (
                          <tr key={l.id}>
                            <td style={{ paddingLeft: "1.4rem" }}>
                              {readOnly || l.computed ? (
                                <span title={l.note ?? undefined}>
                                  {l.label}
                                  {l.computed ? (
                                    <span className="proj-conf" data-c="confirmed" style={{ marginLeft: "0.35rem" }}>
                                      driven
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <input
                                  type="text"
                                  value={l.label}
                                  onChange={(e) => patch(l.id, { label: e.target.value })}
                                  aria-label="Line name"
                                />
                              )}
                              {l.note ? (
                                <div style={{ fontSize: "0.66rem", color: "var(--ink-soft)", lineHeight: 1.4, paddingLeft: "0.3rem" }}>
                                  {l.note}
                                </div>
                              ) : null}
                            </td>
                            <td className="num">
                              {readOnly || l.computed ? (
                                money0(projected)
                              ) : (
                                <input
                                  type="text"
                                  className="num"
                                  style={{ textAlign: "right" }}
                                  value={money0(l.amountCents)}
                                  onChange={(e) => {
                                    const n = Number(e.target.value.replace(/[^0-9.-]/g, ""));
                                    if (Number.isFinite(n)) patch(l.id, { amountCents: Math.round(n * 100) });
                                  }}
                                  aria-label={`${l.label} projected amount`}
                                />
                              )}
                            </td>
                            <td>
                              {readOnly || l.computed ? (
                                <span className="proj-conf" data-c={l.confidence}>
                                  {l.confidence}
                                </span>
                              ) : (
                                <select
                                  value={l.confidence}
                                  onChange={(e) => patch(l.id, { confidence: e.target.value as Confidence })}
                                  aria-label={`${l.label} confidence`}
                                >
                                  {CONFIDENCES.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="num">
                              {readOnly ? (
                                actual === null ? "—" : money0(actual)
                              ) : (
                                <input
                                  type="text"
                                  className="num"
                                  style={{ textAlign: "right" }}
                                  value={actual === null ? "" : money0(actual)}
                                  placeholder="—"
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(/[^0-9.-]/g, "");
                                    patch(l.id, { actualCents: raw === "" ? null : Math.round(Number(raw) * 100) });
                                  }}
                                  aria-label={`${l.label} actual amount`}
                                />
                              )}
                            </td>
                            <td
                              className="num"
                              style={{ color: variance === null ? undefined : variance >= 0 ? "var(--c-gain)" : "var(--c-loss)" }}
                              title={variance === null ? undefined : money(Math.abs(variance))}
                            >
                              {variance === null ? "—" : moneySigned(variance)}
                            </td>
                            {readOnly ? null : (
                              <td>
                                {l.computed ? null : (
                                  <button
                                    type="button"
                                    className="proj-lock"
                                    aria-label={`Delete ${l.label}`}
                                    title="Delete this line"
                                    onClick={() => remove(l.id)}
                                  >
                                    ✕
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })
                    : null}

                  {isOpen && !readOnly ? (
                    <tr>
                      <td colSpan={6} style={{ paddingLeft: "1.4rem" }}>
                        <button type="button" className="proj-btn" onClick={() => add(h.key)}>
                          + Add a line to {h.label}
                        </button>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
