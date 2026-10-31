/** Event date lines for the public pages — a one-night event reads as one date with its times. */
const TZ = "America/New_York";
const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });

/** Same calendar day, or an evening that runs past midnight (under 18 hours). */
export function isOneDay(start: Date | string, end: Date | string): boolean {
  const s = new Date(start);
  const e = new Date(end);
  return ymd(s) === ymd(e) || +e - +s < 18 * 3600 * 1000;
}

/** "Saturday, November 14, 2026 · 5:00 PM – 11:30 PM" or "October 16 – October 18, 2026". */
export function eventDateLine(start: Date | string, end: Date | string): string {
  const s = new Date(start);
  const e = new Date(end);
  const t = (d: Date) => d.toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  if (isOneDay(s, e))
    return `${s.toLocaleDateString("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric" })} · ${t(s)} – ${t(e)}`;
  return `${s.toLocaleDateString("en-US", { timeZone: TZ, month: "long", day: "numeric" })} – ${e.toLocaleDateString("en-US", { timeZone: TZ, month: "long", day: "numeric", year: "numeric" })}`;
}
