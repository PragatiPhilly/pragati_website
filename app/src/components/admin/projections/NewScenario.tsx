"use client";

/**
 * Starting a year — two honest routes.
 *
 *  · Copy a previous year, optionally escalated. What you do in January, before
 *    a single ticket has sold.
 *  · Build from live site data. The site already knows the ticket money, the
 *    head count per day, and what people actually paid after member pricing and
 *    promo codes. Nobody should retype any of that.
 *
 * The live route never pretends to know more than it does. It shows three
 * tiers, kept visibly apart, before anything is created:
 *   PULLED    — fact, from this event's own rows.
 *   CARRIED   — last year's number as a starting point. Editable, and flagged.
 *   YOU       — the cost heads that were never transacted on this website:
 *               the hall, the artists, the caterer, the pujo.
 *
 * NOTE: this file imports only TYPES from lib/projections/from-live — that
 * module reaches the database, and a value import here would drag `fs`, `net`
 * and `tls` into the browser bundle (see lib/auth/sections.ts).
 */
import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { COST_HEADS, type ProjectionModel } from "@/lib/projections/types";
import type { LivePull, BuildResult } from "@/lib/projections/from-live";
import { buildFromLiveAction, previewLiveAction } from "@/app/admin/projections/actions";
import { money0, num, stripYear } from "./primitives";

type ScenarioLite = { id: string; year: number; name: string; isBaseline: boolean; model: ProjectionModel };

type Preview = {
  live: LivePull;
  build: BuildResult;
  faceValueGapCents: number;
};

const field: React.CSSProperties = {
  font: "inherit",
  padding: "0.35rem 0.5rem",
  border: "1px solid var(--line)",
  borderRadius: 6,
  background: "var(--bg-soft)",
  color: "var(--ink)",
  width: "100%",
};

export default function NewScenario({
  scenarios,
  currentId,
  onClose,
  onDone,
}: {
  scenarios: ScenarioLite[];
  currentId: string;
  onClose: () => void;
  onDone: (r: { ok: boolean; message: string; id?: string }) => void;
}) {
  const thisYear = new Date().getFullYear();
  const [mode, setMode] = useState<"copy" | "live">("live");
  const [name, setName] = useState(`${thisYear} plan`);
  const [year, setYear] = useState(thisYear);
  const [source, setSource] = useState(
    // Default to the most recent BASELINE — a finished year is the right thing
    // to carry costs from, not somebody's half-edited what-if.
    scenarios.find((s) => s.isBaseline)?.id ?? currentId
  );
  const [escalation, setEscalation] = useState(0);
  const [includeDonations, setIncludeDonations] = useState(true);
  const [includeMembership, setIncludeMembership] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, start] = useTransition();

  const opts = { year, carryFromId: source, escalationPct: escalation, includeDonations, includeMembership };

  const check = () =>
    start(async () => {
      const r = await previewLiveAction(opts);
      if (r.ok && r.preview) setPreview(r.preview as Preview);
      else onDone({ ok: false, message: r.message });
    });

  const createLive = () =>
    start(async () => {
      const r = await buildFromLiveAction({ name: name.trim(), ...opts });
      onDone(r);
    });

  const createCopy = () =>
    start(async () => {
      const base = scenarios.find((s) => s.id === source)?.model;
      if (!base) return onDone({ ok: false, message: "Pick a scenario to copy." });
      const f = 1 + escalation / 100;
      const model: ProjectionModel = {
        ...base,
        year,
        days: base.days.map((d) => ({
          ...d,
          foodCost: {
            breakfast: Math.round(d.foodCost.breakfast * f),
            lunch: Math.round(d.foodCost.lunch * f),
            dinner: Math.round(d.foodCost.dinner * f),
            kid: Math.round(d.foodCost.kid * f),
          },
        })),
        costLines: base.costLines.map((l) =>
          l.computed ? l : { ...l, amountCents: Math.round(l.amountCents * f), actualCents: null }
        ),
        revenueLines: base.revenueLines.map((l) => ({ ...l, actualCents: null })),
      };
      const { createScenarioAction } = await import("@/app/admin/projections/actions");
      onDone(await createScenarioAction({ name: name.trim(), year, model, seededFrom: source }));
    });

  return (
    <motion.div
      className="proj-card"
      style={{ marginBottom: "1rem", borderColor: "var(--accent)" }}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <h2 className="proj-card-title">New scenario</h2>
      <p className="proj-card-note">
        The site already knows what it sold. Everything it was never asked to handle — the hall, the artists, the
        caterer — is yours to fill in, and it is marked as such.
      </p>

      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.9rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="proj-chip"
          aria-pressed={mode === "live"}
          onClick={() => setMode("live")}
        >
          ⚡ Build from live site data
        </button>
        <button type="button" className="proj-chip" aria-pressed={mode === "copy"} onClick={() => setMode("copy")}>
          ⧉ Copy a previous year
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "0.6rem",
          alignItems: "end",
        }}
      >
        <label style={{ fontSize: "0.75rem", display: "grid", gap: "0.2rem" }}>
          Name
          <input style={field} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label style={{ fontSize: "0.75rem", display: "grid", gap: "0.2rem" }}>
          Year
          <input
            style={field}
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || thisYear)}
          />
        </label>
        <label style={{ fontSize: "0.75rem", display: "grid", gap: "0.2rem" }}>
          {mode === "live" ? "Carry costs from" : "Copy from"}
          <select
            style={field}
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPreview(null);
            }}
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.year} · {stripYear(s.name)}
                {s.isBaseline ? " (baseline)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: "0.75rem", display: "grid", gap: "0.2rem" }}>
          Cost escalation %
          <input
            style={field}
            type="number"
            value={escalation}
            onChange={(e) => {
              setEscalation(Number(e.target.value) || 0);
              setPreview(null);
            }}
          />
        </label>
      </div>

      {mode === "live" ? (
        <>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", margin: "0.8rem 0 0.2rem", fontSize: "0.76rem" }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", minHeight: 24 }}>
              <input
                type="checkbox"
                checked={includeDonations}
                onChange={(e) => {
                  setIncludeDonations(e.target.checked);
                  setPreview(null);
                }}
              />
              Include website donations as sponsorship
            </label>
            <label style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", minHeight: 24 }}>
              <input
                type="checkbox"
                checked={includeMembership}
                onChange={(e) => {
                  setIncludeMembership(e.target.checked);
                  setPreview(null);
                }}
              />
              Include membership dues
              <span style={{ color: "var(--ink-soft)" }}>(not event income)</span>
            </label>
          </div>

          {!preview ? (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.8rem", flexWrap: "wrap" }}>
              <button type="button" className="proj-btn proj-btn--primary" disabled={pending} onClick={check}>
                {pending ? "Reading the site…" : "Show me what the site has"}
              </button>
              <button type="button" className="proj-btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <LiveReview preview={preview} />
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.9rem", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="proj-btn proj-btn--primary"
                  disabled={pending || !name.trim()}
                  onClick={createLive}
                >
                  {pending ? "Creating…" : "Create this scenario"}
                </button>
                <button type="button" className="proj-btn" disabled={pending} onClick={check}>
                  Re-read the site
                </button>
                <button type="button" className="proj-btn" onClick={onClose}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.9rem" }}>
          <button
            type="button"
            className="proj-btn proj-btn--primary"
            disabled={pending || !name.trim()}
            onClick={createCopy}
          >
            {pending ? "Creating…" : "Create"}
          </button>
          <button type="button" className="proj-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ── the review ───────────────────────────────────────────────────

function Tier({ kind }: { kind: "live" | "mixed" | "carried" | "you" }) {
  const map = {
    live: { label: "pulled", c: "confirmed" },
    // A head where SOME lines came from the ledger and some did not. Calling the
    // whole head "pulled" would overstate what the site actually knows.
    mixed: { label: "part pulled", c: "confirmed" },
    carried: { label: "last year", c: "expected" },
    you: { label: "needs you", c: "stretch" },
  } as const;
  return (
    <span className="proj-conf" data-c={map[kind].c}>
      {map[kind].label}
    </span>
  );
}

function LiveReview({ preview }: { preview: Preview }) {
  const { live, build, faceValueGapCents } = preview;
  const nothing = live.totalHeads === 0 && live.ticketRevenueCents === 0;

  return (
    <div style={{ marginTop: "0.9rem", display: "grid", gap: "0.8rem" }}>
      {nothing ? (
        <p className="proj-flag" data-level="warn" style={{ margin: 0 }}>
          <span className="proj-flag-icon" aria-hidden>
            ⚠️
          </span>
          <span>
            <span className="proj-flag-title">Nothing has sold yet</span>
            <span className="proj-flag-detail">
              {live.eventName
                ? `“${live.eventName}” has no settled registrations, so there is nothing to pull. Every number below comes from last year — which is a perfectly good place to start a plan.`
                : "There is no active event, so the site has nothing to hand over yet. Set one in Settings, or start from last year and come back."}
            </span>
          </span>
        </p>
      ) : null}

      <div className="proj-row2">
        {/* ── pulled ─────────────────────────────────────────── */}
        <div>
          <p className="proj-card-title" style={{ color: "var(--c-ok)" }}>
            ✓ Pulled from the site
          </p>
          <div className="proj-scroll">
            <table className="proj-table">
              <tbody>
                <tr>
                  <td>Ticket revenue settled</td>
                  <td className="num">
                    <b>{money0(live.ticketRevenueCents)}</b>
                  </td>
                </tr>
                {live.ticketOutstandingCents > 0 ? (
                  <tr>
                    <td style={{ color: "var(--ink-soft)" }}>…still to come</td>
                    <td className="num">{money0(live.ticketOutstandingCents)}</td>
                  </tr>
                ) : null}
                <tr>
                  <td>Guests booked</td>
                  <td className="num">
                    <b>{num(live.totalHeads)}</b>
                  </td>
                </tr>
                <tr>
                  <td>Card / processing fees</td>
                  <td className="num">{money0(live.feeCents)}</td>
                </tr>
                <tr>
                  <td>
                    Website donations
                    <span style={{ color: "var(--ink-soft)" }}> · {live.donationLines.length} gift(s)</span>
                  </td>
                  <td className="num">{money0(live.donationCents)}</td>
                </tr>
                <tr>
                  <td style={{ color: "var(--ink-soft)" }}>Membership dues</td>
                  <td className="num" style={{ color: "var(--ink-soft)" }}>
                    {money0(live.membershipCents)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {live.days.length > 0 ? (
            <div className="proj-scroll" style={{ marginTop: "0.6rem" }}>
              <table className="proj-table">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th className="num">With food</th>
                    <th className="num">No food</th>
                    <th className="num">Kids</th>
                    <th className="num">Avg paid</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {live.days.map((d) => {
                    const a = live.attendance[d.key] ?? { withFood: 0, withoutFood: 0, kids: 0 };
                    const p = live.realisedPrice[d.key] ?? { withFood: 0, withoutFood: 0, kids: 0 };
                    const prov = build.dayProvenance[d.key];
                    return (
                      <tr key={d.key}>
                        <td>{d.label}</td>
                        <td className="num">{num(a.withFood)}</td>
                        <td className="num">{num(a.withoutFood)}</td>
                        <td className="num">{num(a.kids)}</td>
                        <td className="num">{p.withFood > 0 ? money0(p.withFood) : "—"}</td>
                        <td>
                          <Tier kind={prov?.attendance === "live" ? "live" : "carried"} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {Math.abs(faceValueGapCents) > 100 ? (
            <p className="proj-tile-foot">
              The ledger and the tickets differ by <b>{money0(Math.abs(faceValueGapCents))}</b> — normal when the desk
              gave a discount or a comp. The ledger figure is the one used.
            </p>
          ) : null}
        </div>

        {/* ── needs you ──────────────────────────────────────── */}
        <div>
          <p className="proj-card-title" style={{ color: "var(--c-warn)" }}>
            ✎ You supply these
          </p>
          <p className="proj-card-note">
            Nothing here was ever transacted on this website, so it is carried from{" "}
            <b>the year you chose</b> as a starting point. Edit each one once the real quote is in.
          </p>
          <div className="proj-scroll">
            <table className="proj-table">
              <tbody>
                {COST_HEADS.filter((h) => h.key !== "food").map((h) => {
                  const lines = build.model.costLines.filter((l) => l.head === h.key && !l.computed);
                  const total = lines.reduce((s, l) => s + l.amountCents, 0);
                  const fromLedger = lines.filter((l) => build.lineProvenance[l.id] === "live").length;
                  const kind = fromLedger === 0 ? "carried" : fromLedger === lines.length ? "live" : "mixed";
                  return (
                    <tr key={h.key}>
                      <td>
                        {h.label}
                        {kind === "mixed" ? (
                          <span style={{ color: "var(--ink-soft)", fontSize: "0.68rem" }}>
                            {" "}
                            · card fees from the ledger, the rest from last year
                          </span>
                        ) : null}
                      </td>
                      <td className="num">{money0(total)}</td>
                      <td>
                        <Tier kind={kind} />
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td>Food cost per head</td>
                  <td className="num">
                    {build.model.days
                      .filter((d) => d.enabled)
                      .map((d) => money0(d.foodCost.breakfast + d.foodCost.lunch + d.foodCost.dinner))
                      .join(" · ")}
                  </td>
                  <td>
                    <Tier kind="carried" />
                  </td>
                </tr>
                <tr>
                  <td>Stalls</td>
                  <td className="num">
                    {money0(
                      build.model.revenueLines
                        .filter((l) => l.head === "stalls")
                        .reduce((s, l) => s + l.amountCents, 0)
                    )}
                  </td>
                  <td>
                    <Tier kind="carried" />
                  </td>
                </tr>
                <tr>
                  <td>Named sponsors</td>
                  <td className="num">$0</td>
                  <td>
                    <Tier kind="you" />
                  </td>
                </tr>
                <tr>
                  <td>Cash carried in</td>
                  <td className="num">$0</td>
                  <td>
                    <Tier kind="you" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="proj-tile-foot">
            Last year&rsquo;s sponsor names are kept as an empty checklist to work down —{" "}
            <b>their amounts are zeroed</b>, because carrying a sponsor&rsquo;s money forward as though it were promised
            is exactly what made the 2024 sheet report a profit it did not have.
          </p>
        </div>
      </div>

      {live.donationLines.length > 0 ? (
        <details>
          <summary style={{ cursor: "pointer", fontSize: "0.78rem", fontWeight: 600, minHeight: 24 }}>
            The {live.donationLines.length} gifts behind that donations total — split them into named sponsors after
            creating
          </summary>
          <div className="proj-scroll" style={{ marginTop: "0.4rem" }}>
            <table className="proj-table">
              <tbody>
                {live.donationLines.map((g) => (
                  <tr key={g.id}>
                    <td>{g.label}</td>
                    <td className="num">{money0(g.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  );
}
