"use client";

/**
 * Shared pieces for the Projections screen: number formatting, the animated
 * figure, the slider, and a tooltip hook.
 *
 * ANIMATION RULE: a spring writes to the DOM node directly rather than through
 * React state. A count-up that re-renders on every frame drags the whole
 * dashboard's charts with it, and the point of the animation is that dragging a
 * slider feels instant.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useMotionValueEvent, useReducedMotion, useSpring } from "framer-motion";

// ── formatting ───────────────────────────────────────────────────

/** Exact, for tables and tooltips: $97,456.90 */
export function money(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  return `${sign}$${Math.abs(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Rounded, for stat tiles and labels: −$97,457 */
export function money0(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  return `${sign}$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;
}

/** Compact, for axes where space is the constraint: $97.5k */
export function moneyK(cents: number): string {
  const v = cents / 100;
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(a >= 10_000 ? 0 : 1)}k`;
  return `${sign}$${Math.round(a)}`;
}

/** Signed, for anything that carries polarity — the secondary encoding that
 *  makes the gain/loss colour pair legible without colour. */
export function moneySigned(cents: number): string {
  if (cents === 0) return "$0";
  return `${cents > 0 ? "+" : "−"}$${Math.round(Math.abs(cents) / 100).toLocaleString("en-US")}`;
}

export const num = (n: number): string => Math.round(n).toLocaleString("en-US");
export const pct = (f: number, dp = 0): string => `${(f * 100).toFixed(dp)}%`;

// ── animated figure ──────────────────────────────────────────────

export function AnimatedMoney({
  cents,
  format = money0,
  className,
  style,
}: {
  cents: number;
  format?: (c: number) => string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const spring = useSpring(cents, { stiffness: 140, damping: 22, mass: 0.6 });

  useEffect(() => {
    if (reduced) {
      if (ref.current) ref.current.textContent = format(cents);
      spring.jump(cents);
    } else {
      spring.set(cents);
    }
  }, [cents, reduced, spring, format]);

  useMotionValueEvent(spring, "change", (v) => {
    if (ref.current) ref.current.textContent = format(v);
  });

  return (
    <span ref={ref} className={className} style={style}>
      {format(cents)}
    </span>
  );
}

/** Same idea for plain counts (heads, days). */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const spring = useSpring(value, { stiffness: 150, damping: 24, mass: 0.6 });
  useEffect(() => {
    if (reduced) {
      if (ref.current) ref.current.textContent = num(value);
      spring.jump(value);
    } else spring.set(value);
  }, [value, reduced, spring]);
  useMotionValueEvent(spring, "change", (v) => {
    if (ref.current) ref.current.textContent = num(v);
  });
  return (
    <span ref={ref} className={className}>
      {num(value)}
    </span>
  );
}

// ── slider ───────────────────────────────────────────────────────

export function Slider({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = money0,
  parse,
  locked,
  onLockToggle,
  disabled,
  accent,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  /** Turn what the person typed back into the underlying unit. */
  parse?: (text: string) => number | null;
  locked?: boolean;
  onLockToggle?: () => void;
  disabled?: boolean;
  accent?: string;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = Math.max(min, Math.min(max, value));
  const fillPct = max > min ? ((shown - min) / (max - min)) * 100 : 0;
  const colour = accent ?? "var(--accent)";

  const commit = useCallback(
    (text: string) => {
      const parsed = parse ? parse(text) : Number(text.replace(/[^0-9.-]/g, ""));
      if (parsed !== null && Number.isFinite(parsed)) onChange(parsed);
      setDraft(null);
    },
    [onChange, parse]
  );

  return (
    <div className="proj-slider">
      <div className="proj-slider-top">
        <label htmlFor={id} className="proj-slider-name">
          {label}
          {hint ? <span className="proj-slider-hint"> · {hint}</span> : null}
        </label>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "0.15rem" }}>
          <input
            className="proj-slider-val"
            value={draft ?? format(value)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setDraft(null);
            }}
            disabled={disabled || locked}
            aria-label={`${label} exact value`}
          />
          {onLockToggle ? (
            <button
              type="button"
              className="proj-lock"
              aria-pressed={!!locked}
              aria-label={locked ? `Unpin ${label}` : `Pin ${label} — excluded from suggestions and risk`}
              title={locked ? "Pinned: excluded from the gap closer and held fixed in the risk model" : "Pin this value"}
              onClick={onLockToggle}
            >
              {locked ? "🔒" : "🔓"}
            </button>
          ) : null}
        </span>
      </div>
      <input
        id={id}
        className="proj-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled || locked}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            "--track": `linear-gradient(to right, ${colour} 0%, ${colour} ${fillPct}%, var(--line) ${fillPct}%, var(--line) 100%)`,
            accentColor: colour,
          } as React.CSSProperties
        }
      />
    </div>
  );
}

// ── tooltip ──────────────────────────────────────────────────────

export type TipState = { x: number; y: number; html: React.ReactNode } | null;

export function useTip() {
  const [tip, setTip] = useState<TipState>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const show = useCallback((e: React.MouseEvent, html: React.ReactNode) => {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, html });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  return { tip, wrap, show, hide };
}

export function Tip({ tip }: { tip: TipState }) {
  if (!tip) return null;
  return (
    <div className="proj-tip" style={{ left: tip.x, top: tip.y }} role="presentation">
      {tip.html}
    </div>
  );
}

/** A legend is always present for two or more series. */
export function Legend({ items }: { items: { colour: string; label: string; line?: boolean }[] }) {
  if (items.length < 2) return null;
  return (
    <div className="proj-legend">
      {items.map((i) => (
        <span key={i.label} className="proj-legend-item">
          <span
            className={i.line ? "proj-swatch proj-swatch--line" : "proj-swatch"}
            style={{ background: i.colour }}
            aria-hidden
          />
          {i.label}
        </span>
      ))}
    </div>
  );
}
