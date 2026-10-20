/**
 * After the event — "thank-you mode". Spec: spec/16-post-event-mode.md
 *
 * Once the active event is over, the homepage stops inviting people to a
 * festival that has already happened: the countdown becomes a thank-you card
 * with a few numbers, Register buttons step aside, and online registration
 * closes. Everything here is driven from Admin → Settings:
 *
 *   post_event_mode  auto (default) — on by itself once the active event's end
 *                                     time has passed; off again as soon as a
 *                                     new, not-yet-finished event is made active
 *                    on              — force it on (e.g. right after the last aarti)
 *                    off             — old behaviour, never switch
 *   recap_*          the thank-you card's words and numbers
 *
 * This file is pure (no DB, no React) so it can be unit-tested; the server
 * helpers that read config live in season.ts.
 */
export type PostEventMode = "auto" | "on" | "off";

export function parsePostEventMode(raw: unknown): PostEventMode {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "on" || v === "off" ? v : "auto";
}

/** True once the event's end time is in the past. */
export function eventHasEnded(
  event: { endsAt: Date | string } | null | undefined,
  now = new Date(),
): boolean {
  if (!event) return false;
  return new Date(event.endsAt).getTime() <= now.getTime();
}

/** Should the site be in thank-you mode for this (featured/active) event? */
export function isPostEvent(
  mode: PostEventMode,
  event: { endsAt: Date | string } | null | undefined,
  now = new Date(),
): boolean {
  if (!event) return false;
  if (mode === "on") return true;
  if (mode === "off") return false;
  return eventHasEnded(event, now);
}

export type RecapStat = {
  label: string;
  /** Raw text as typed in Settings, e.g. "650+". */
  text: string;
  /** Numeric part for the count-up animation; null = show `text` as-is. */
  n: number | null;
  prefix: string;
  suffix: string;
};

/**
 * "650+" → { n: 650, suffix: "+" } · "1,200" → { n: 1200 } · "$5k" → text only.
 * Anything that isn't plain digits (with optional thousands commas, one leading
 * symbol and a short trailing symbol) is shown verbatim — never mangled.
 */
export function parseStat(text: string, label: string): RecapStat {
  const t = text.trim();
  const m = /^([^\d\s]?)(\d{1,3}(?:,\d{3})+|\d+)(\+?)$/.exec(t);
  if (!m) return { label, text: t, n: null, prefix: "", suffix: "" };
  return { label, text: t, n: Number(m[2].replace(/,/g, "")), prefix: m[1], suffix: m[3] };
}

export type Recap = {
  kicker: string;
  title: string;
  titleBn: string;
  message: string;
  stats: RecapStat[];
  ctaLabel: string;
  ctaHref: string;
};

const PUJO_THEMES = new Set(["durga", "kali", "saraswati"]);

/** Build the thank-you card's content from config + the event it is about. */
export function buildRecap(
  cfg: Record<string, unknown>,
  event: { name: string; nameBengali?: string | null; theme?: string | null },
): Recap {
  const s = (k: string) => String(cfg[k] ?? "").trim();
  const stats: RecapStat[] = [];
  for (let i = 1; i <= 4; i++) {
    const value = s(`recap_stat_${i}_value`);
    const label = s(`recap_stat_${i}_label`);
    if (value) stats.push(parseStat(value, label));
  }
  const isPujo = PUJO_THEMES.has(event.theme ?? "");
  return {
    kicker: isPujo ? "Pujo complete · thank you" : "Thank you",
    title: s("recap_title") || `${event.name} — thank you!`,
    titleBn:
      s("recap_title_bn") || (event.nameBengali ? `${event.nameBengali} সুসম্পন্ন` : ""),
    message: s("recap_message"),
    stats,
    ctaLabel: s("recap_cta_label"),
    ctaHref: s("recap_cta_href"),
  };
}
