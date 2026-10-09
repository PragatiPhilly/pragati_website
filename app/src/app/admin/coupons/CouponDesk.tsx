"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { couponDef, emptyTally, orderedKeys, type CouponDef, type CouponTally } from "@/lib/coupons/rules";
import type { DeskFamily, DeskReg } from "@/lib/coupons/store";
import { markCouponsGivenAction, undoCouponsGivenAction } from "./actions";

type Day = { key: string; label: string };
type Filter = "todo" | "given" | "owes" | "unpaid" | "all";

const TZ = "America/New_York";
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" });

function sumTallies(regs: DeskReg[]): CouponTally {
  const out = emptyTally();
  for (const r of regs) {
    for (const [k, n] of Object.entries(r.tally.counts)) out.counts[k] = (out.counts[k] ?? 0) + n;
    for (const [k, n] of Object.entries(r.tally.veg)) out.veg[k] = (out.veg[k] ?? 0) + n;
  }
  return out;
}

type View = {
  fam: DeskFamily;
  counted: DeskReg[];
  toGive: DeskReg[];
  given: DeskReg[];
  unpaid: DeskReg[];
  status: "todo" | "given" | "unpaid";
  owes: boolean;
  toGiveTally: CouponTally;
  givenTally: CouponTally;
  unpaidTally: CouponTally;
  haystack: string;
};

function viewOf(fam: DeskFamily): View {
  const counted = fam.regs.filter((r) => r.standing === "ready" || r.standing === "owes");
  const toGive = counted.filter((r) => !r.given);
  const given = counted.filter((r) => r.given);
  const unpaid = fam.regs.filter((r) => r.standing === "unpaid");
  const status = counted.length === 0 ? "unpaid" : toGive.length === 0 ? "given" : "todo";
  const haystack = [fam.name, fam.email, fam.phone, ...fam.regs.map((r) => r.conf), ...fam.regs.flatMap((r) => r.people.map((p) => p.name))]
    .join(" ")
    .toLowerCase();
  return {
    fam,
    counted,
    toGive,
    given,
    unpaid,
    status,
    owes: counted.some((r) => r.standing === "owes"),
    toGiveTally: sumTallies(toGive),
    givenTally: sumTallies(given),
    unpaidTally: sumTallies(unpaid),
    haystack,
  };
}

function Tile({ def }: { def: CouponDef }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center shrink-0 text-center font-bold leading-[1.05] rounded-md"
      style={{
        background: def.color,
        width: def.big ? 58 : 46,
        height: def.big ? 36 : 30,
        fontSize: def.who === "Kid" ? 17 : 9,
        color: "rgba(0,0,0,0.72)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)",
      }}
    >
      {def.who === "Kid" ? "☺" : def.print}
    </span>
  );
}

function CouponGrid({ tally, days, muted }: { tally: CouponTally; days: Day[]; muted?: boolean }) {
  const keys = orderedKeys(tally);
  if (keys.length === 0) return <p className="text-sm" style={{ color: "var(--ink-soft)" }}>No food coupons.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" style={muted ? { opacity: 0.5 } : undefined}>
      {keys.map((k) => {
        const d = couponDef(k);
        const dayLabel = days.find((x) => x.key === d.day)?.label ?? d.day;
        return (
          <div key={k} className="flex items-center gap-2.5">
            <Tile def={d} />
            <div className="leading-tight">
              <span className="font-[family-name:var(--font-display)] text-lg font-black">×{tally.counts[k]}</span>{" "}
              <span className="text-sm">
                {d.who} · {dayLabel} {d.meal.toLowerCase()}
              </span>
              {(tally.veg[k] ?? 0) > 0 && (
                <span className="block text-xs font-bold" style={{ color: "var(--leaf-deep)" }}>
                  {tally.veg[k]} veg
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const PILL: Record<View["status"], { text: string; bg: string; fg: string }> = {
  todo: { text: "To give", bg: "rgba(232,160,0,0.16)", fg: "#8a5a00" },
  given: { text: "Given ✓", bg: "rgba(46,125,50,0.14)", fg: "var(--leaf-deep)" },
  unpaid: { text: "Not paid — don't hand out", bg: "rgba(200,16,46,0.10)", fg: "var(--sindoor)" },
};

function FamilyCard({ v, days }: { v: View; days: Day[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  const pill = PILL[v.status];
  const confs = v.fam.regs.map((r) => r.conf);
  const lastGiven = v.given.map((r) => r.given!).sort((a, b) => b.at.localeCompare(a.at))[0];

  const mark = () =>
    start(async () => {
      setErr("");
      try {
        await markCouponsGivenAction(v.toGive.map((r) => r.id));
      } catch {
        setErr("Couldn't save — check the connection and tap again.");
      }
    });
  const undo = () => {
    if (!window.confirm(`Undo "coupons given" for ${v.fam.name}? Only do this if the coupons were NOT actually handed over.`)) return;
    start(async () => {
      setErr("");
      try {
        await undoCouponsGivenAction(v.given.map((r) => r.id));
      } catch {
        setErr("Couldn't save — check the connection and tap again.");
      }
    });
  };

  return (
    <article
      className="festive-card p-4 sm:p-5"
      style={v.status === "given" ? { background: "rgba(46,125,50,0.04)" } : v.status === "unpaid" ? { background: "rgba(200,16,46,0.03)" } : undefined}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-black leading-tight">{v.fam.name}</h2>
          <p className="text-xs mt-1 break-words" style={{ color: "var(--ink-soft)" }}>
            {confs.join(" · ")}
            {v.fam.phone && ` · ${v.fam.phone}`}
            {v.fam.email && ` · ${v.fam.email}`}
          </p>
        </div>
        <span className="text-xs font-bold uppercase tracking-wide rounded-full px-3 py-1.5 shrink-0" style={{ background: pill.bg, color: pill.fg }}>
          {pill.text}
        </span>
      </div>

      {(v.owes || v.fam.earlier.length > 0 || (v.unpaid.length > 0 && v.counted.length > 0)) && (
        <ul className="mt-3 grid gap-1 text-xs">
          {v.owes && (
            <li style={{ color: "#8a5a00" }}>⚠ Walk-in let in before fully paid — the walk-in desk is collecting the rest.</li>
          )}
          {v.fam.earlier.length > 0 && (
            <li style={{ color: "#8a5a00" }}>
              ⚠ Also booked earlier ({v.fam.earlier.join(", ")}) — those coupons were on an earlier desk. Give only the ones below.
            </li>
          )}
          {v.unpaid.length > 0 && v.counted.length > 0 && (
            <li style={{ color: "var(--sindoor)" }}>✕ {v.unpaid.map((r) => r.conf).join(", ")} not paid yet — not included below.</li>
          )}
        </ul>
      )}

      <div className="mt-4">
        {v.status === "unpaid" ? (
          <>
            <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--sindoor)" }}>
              Would get once paid
            </p>
            <CouponGrid tally={v.unpaidTally} days={days} muted />
          </>
        ) : (
          <>
            {v.toGive.length > 0 && (
              <>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--ink-soft)" }}>
                  Hand over
                </p>
                <CouponGrid tally={v.toGiveTally} days={days} />
              </>
            )}
            {v.given.length > 0 && (
              <div className={v.toGive.length > 0 ? "mt-4" : ""}>
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--leaf-deep)" }}>
                  Already given{lastGiven ? ` · ${fmtTime(lastGiven.at)}${lastGiven.by ? ` by ${lastGiven.by}` : ""}` : ""}
                </p>
                <CouponGrid tally={v.givenTally} days={days} muted />
              </div>
            )}
          </>
        )}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-semibold" style={{ color: "var(--ink-soft)" }}>
          Who &amp; which days ({v.fam.regs.reduce((n, r) => n + r.people.length, 0)})
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <tbody>
              {v.fam.regs.flatMap((r) =>
                r.people.map((p, i) => (
                  <tr key={`${r.id}-${i}`} className="border-t" style={{ borderColor: "var(--line)", opacity: r.standing === "unpaid" ? 0.55 : 1 }}>
                    <td className="py-1.5 pr-3 font-medium">{p.name}</td>
                    <td className="py-1.5 pr-3">{p.who}</td>
                    <td className="py-1.5 pr-3">{p.days.map((k) => days.find((d) => d.key === k)?.label ?? k).join(", ")}</td>
                    <td className="py-1.5 pr-3">{p.food}</td>
                    <td className="py-1.5 pr-3" style={{ color: "var(--ink-soft)" }}>
                      {p.pass} · {r.conf}
                      {r.source === "desk" ? " · walk-in" : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </details>

      {v.status !== "unpaid" && (
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          {v.toGive.length > 0 && (
            <button type="button" className="btn-primary !py-3 !px-6 text-sm" disabled={pending} onClick={mark}>
              {pending ? "Saving…" : "✓ Mark coupons given"}
            </button>
          )}
          {v.given.length > 0 && (
            <button type="button" className="text-xs underline" style={{ color: "var(--ink-soft)" }} disabled={pending} onClick={undo}>
              Undo &ldquo;given&rdquo;
            </button>
          )}
          {err && (
            <span className="text-xs font-medium" style={{ color: "var(--sindoor)" }}>
              {err}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

export default function CouponDesk({
  eventName,
  days,
  legend,
  families,
  sinceLocal,
  sinceLabel,
  presets,
  mealsLine,
  loadedAt,
}: {
  eventName: string;
  days: Day[];
  legend: CouponDef[];
  families: DeskFamily[];
  sinceLocal: string;
  sinceLabel: string;
  presets: { label: string; value: string }[];
  mealsLine: string;
  loadedAt: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("todo");
  const [refreshing, startRefresh] = useTransition();

  // New online bookings appear without anyone reloading: refresh every minute
  // while this tab is on screen.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") startRefresh(() => router.refresh());
    }, 60_000);
    return () => clearInterval(id);
  }, [router]);

  const views = useMemo(() => families.map(viewOf), [families]);
  const counts = {
    todo: views.filter((v) => v.status === "todo").length,
    given: views.filter((v) => v.status === "given").length,
    owes: views.filter((v) => v.owes).length,
    unpaid: views.filter((v) => v.status === "unpaid").length,
    all: views.length,
  };
  const needle = q.trim().toLowerCase();
  const shown = views
    .filter((v) => (needle ? v.haystack.includes(needle) : true))
    .filter((v) =>
      needle
        ? true // a search looks everywhere
        : filter === "all"
          ? true
          : filter === "owes"
            ? v.owes
            : v.status === filter
    )
    .sort((a, b) => {
      const rank = { todo: 0, given: 1, unpaid: 2 };
      return rank[a.status] - rank[b.status] || a.fam.name.localeCompare(b.fam.name);
    });

  // Stock: every paid / admitted family, then what is already out of the box.
  const needed = sumTallies(views.flatMap((v) => v.counted));
  const out = sumTallies(views.flatMap((v) => v.given));
  const stockKeys = legend.map((l) => l.key).filter((k) => (needed.counts[k] ?? 0) > 0);

  const chips: { key: Filter; label: string }[] = [
    { key: "todo", label: `To give (${counts.todo})` },
    { key: "given", label: `Given (${counts.given})` },
    { key: "owes", label: `Owes money (${counts.owes})` },
    { key: "unpaid", label: `Not paid (${counts.unpaid})` },
    { key: "all", label: `All (${counts.all})` },
  ];

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-black">Coupon desk</h1>
        <button
          type="button"
          className="btn-secondary !py-2 !px-4 text-xs"
          disabled={refreshing}
          onClick={() => startRefresh(() => router.refresh())}
        >
          {refreshing ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        {eventName} · everyone who registered or paid since <strong>{sinceLabel}</strong>. {mealsLine}. Concert-only kids get the kid dinner
        coupon; concert-only adults and no-food passes get none. Updates every minute · last {fmtTime(loadedAt)}.
      </p>

      <form method="get" className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">Show registrations since</span>
        {presets.map((p) => (
          <a
            key={p.value}
            href={`?since=${encodeURIComponent(p.value)}`}
            className="choice-chip !py-1.5 !px-3 text-xs"
            data-selected={sinceLocal === p.value}
          >
            {p.label}
          </a>
        ))}
        <label className="sr-only" htmlFor="since">
          Start time
        </label>
        <input id="since" name="since" type="datetime-local" defaultValue={sinceLocal} className="input !py-1.5 !px-2.5 text-xs !w-auto" />
        <button type="submit" className="btn-secondary !py-1.5 !px-3 text-xs">
          Show
        </button>
      </form>

      <details className="festive-card mt-5 p-4">
        <summary className="cursor-pointer font-semibold text-sm">Coupon legend &amp; stock — needed / given / left</summary>
        {stockKeys.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: "var(--ink-soft)" }}>
            No coupons needed for this period yet.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="text-sm min-w-[420px]">
              <thead>
                <tr className="text-xs uppercase tracking-wider" style={{ color: "var(--ink-soft)" }}>
                  <th className="text-left font-semibold py-1.5 pr-4">Coupon</th>
                  <th className="text-right font-semibold py-1.5 px-3">Needed</th>
                  <th className="text-right font-semibold py-1.5 px-3">Given</th>
                  <th className="text-right font-semibold py-1.5 pl-3">Left</th>
                </tr>
              </thead>
              <tbody>
                {stockKeys.map((k) => {
                  const d = couponDef(k);
                  const n = needed.counts[k] ?? 0;
                  const g = out.counts[k] ?? 0;
                  return (
                    <tr key={k} className="border-t" style={{ borderColor: "var(--line)" }}>
                      <td className="py-1.5 pr-4">
                        <span className="inline-flex items-center gap-2.5">
                          <Tile def={d} />
                          {d.who} · {days.find((x) => x.key === d.day)?.label ?? d.day} {d.meal.toLowerCase()}
                          {(needed.veg[k] ?? 0) > 0 && (
                            <span className="text-xs font-bold" style={{ color: "var(--leaf-deep)" }}>
                              ({needed.veg[k]} veg)
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="text-right px-3 font-bold tabular-nums">{n}</td>
                      <td className="text-right px-3 tabular-nums">{g}</td>
                      <td className="text-right pl-3 font-bold tabular-nums">{n - g}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <div className="mt-5 sticky top-0 z-10 py-2" style={{ background: "var(--bg)" }}>
        <label className="sr-only" htmlFor="coupon-search">
          Search
        </label>
        <input
          id="coupon-search"
          type="search"
          className="input w-full"
          placeholder="Search name, email, phone or PRG number"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="choice-chip !py-1.5 !px-3 text-xs"
              data-selected={!needle && filter === c.key}
              onClick={() => {
                setQ("");
                setFilter(c.key);
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid gap-4">
        {shown.map((v) => (
          <FamilyCard key={v.fam.key} v={v} days={days} />
        ))}
        {shown.length === 0 && (
          <p className="text-sm py-8 text-center" style={{ color: "var(--ink-soft)" }}>
            {needle
              ? "No family matches that search in this period."
              : views.length === 0
                ? "No registrations in this period yet. New ones appear here automatically."
                : "Nothing in this list."}
          </p>
        )}
      </div>
    </div>
  );
}
