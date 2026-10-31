/**
 * The homepage box under the hero (spec/20) — chosen per event in Admin →
 * Events → Edit → "Homepage box":
 *
 *   countdown  days / hours to the event (big festivals with anticipation,
 *              e.g. Durga Pujo)
 *   numbers    a few big numbers that show off a past celebration (e.g. Kali
 *              Pujo showing "Durga Pujo 2026 — 1000+ attendees · 3 days …")
 *
 * Stored in system_config as `home_box:<event id>` (JSON) — no schema change.
 * Missing / unreadable = countdown, the old behaviour. After the event ends the
 * thank-you card (spec/16) takes over whatever this says.
 *
 * Pure: no DB, no React — the form, the save action, the homepage and the
 * tests share it.
 */
import { parseStat, type Recap } from "@/lib/season-model";

export type HomeBoxMode = "countdown" | "numbers";

export type HomeBoxStat = { value: string; label: string };

export type HomeBox = {
  mode: HomeBoxMode;
  /** small tab on top, e.g. "Last celebration" */
  kicker: string;
  /** e.g. "Durga Pujo 2026 — by the numbers" */
  title: string;
  /** Bengali line above the title (optional) */
  titleBn: string;
  /** up to 4; a blank value is dropped */
  stats: HomeBoxStat[];
  /** small line under the numbers, e.g. "Oct 9–11 · Greater Philadelphia Expo Center" */
  foot: string;
};

export const HOME_BOX_STATS = 4;
export const homeBoxKey = (eventId: string) => `home_box:${eventId}`;

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

export function emptyHomeBox(): HomeBox {
  return { mode: "countdown", kicker: "", title: "", titleBn: "", stats: [], foot: "" };
}

/** Read whatever is stored (or typed) into a safe HomeBox. Never throws. */
export function parseHomeBox(raw: unknown): HomeBox {
  let v: unknown = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return emptyHomeBox();
    }
  }
  if (!v || typeof v !== "object") return emptyHomeBox();
  const o = v as Record<string, unknown>;
  const stats = (Array.isArray(o.stats) ? o.stats : [])
    .slice(0, HOME_BOX_STATS)
    .map((s) => ({ value: str((s as HomeBoxStat)?.value, 20), label: str((s as HomeBoxStat)?.label, 40) }));
  return {
    mode: o.mode === "numbers" ? "numbers" : "countdown",
    kicker: str(o.kicker, 60),
    title: str(o.title, 120),
    titleBn: str(o.titleBn, 120),
    stats,
    foot: str(o.foot, 160),
  };
}

/** What gets stored: trimmed, blank numbers dropped. */
export function cleanHomeBox(b: HomeBox): HomeBox {
  const p = parseHomeBox(b);
  return { ...p, stats: p.stats.filter((s) => s.value) };
}

/**
 * The numbers card's content, in the same shape as the thank-you card so the
 * homepage reuses one component. Null = show the countdown instead (mode is
 * countdown, or "numbers" was picked but no number typed yet).
 */
export function homeBoxCard(b: HomeBox): Recap | null {
  const p = parseHomeBox(b); // trims — a number that is only spaces counts as blank
  if (p.mode !== "numbers") return null;
  const stats = p.stats.filter((s) => s.value).map((s) => parseStat(s.value, s.label));
  if (stats.length === 0) return null;
  return {
    kicker: p.kicker || "Last celebration",
    title: p.title,
    titleBn: p.titleBn,
    message: "",
    stats,
    ctaLabel: "",
    ctaHref: "",
  };
}

/**
 * Starting values when an admin switches an event to "numbers": the thank-you
 * card's numbers (Admin → Settings, which hold the last festival's) and the
 * most recent past event's name / dates / venue.
 */
export function suggestedHomeBox(
  cfg: Record<string, unknown>,
  past: { name: string; nameBengali?: string | null; dates: string; venueName?: string | null } | null,
): HomeBox {
  const s = (k: string) => str(cfg[k]);
  const stats: HomeBoxStat[] = [];
  for (let i = 1; i <= HOME_BOX_STATS; i++) {
    const value = s(`recap_stat_${i}_value`);
    if (value) stats.push({ value, label: s(`recap_stat_${i}_label`) });
  }
  return {
    mode: "numbers",
    kicker: "Last celebration",
    title: past ? `${past.name} — by the numbers` : "",
    titleBn: past?.nameBengali ?? "",
    stats,
    foot: past ? [past.dates, past.venueName].filter(Boolean).join(" · ") : "",
  };
}

/** "Oct 9–11" / "Sat, Nov 14" — Eastern dates for a past event's line. */
export function eventDatesLabel(e: { startsAt: Date; endsAt: Date }): string {
  const tz = "America/New_York";
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
  const oneDay = day(e.startsAt) === day(e.endsAt) || +e.endsAt - +e.startsAt < 18 * 3600 * 1000;
  if (oneDay) return e.startsAt.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
  const sameMonth =
    e.startsAt.toLocaleDateString("en-US", { timeZone: tz, month: "short" }) ===
    e.endsAt.toLocaleDateString("en-US", { timeZone: tz, month: "short" });
  return `${e.startsAt.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" })}–${e.endsAt.toLocaleDateString("en-US", sameMonth ? { timeZone: tz, day: "numeric" } : { timeZone: tz, month: "short", day: "numeric" })}`;
}
