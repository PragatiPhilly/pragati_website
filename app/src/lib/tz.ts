/**
 * Pragati runs in Pennsylvania: every date and clock time the site shows or
 * takes in is EASTERN TIME (America/New_York — EST in winter, EDT in summer).
 *
 * The servers run in UTC, so never use a Date's own getHours()/getDate()/
 * toLocale…() without a time zone, and never parse "2026-11-14T19:00" with
 * new Date() on the server — that reads it as UTC (7 PM UTC = 2 PM Eastern,
 * the bug that turned Kali Pujo into a two-day event). Use these instead.
 * Pure and dependency-free (client-safe).
 */
export const TZ = "America/New_York";

function parts(d: Date): Record<string, number> {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  return Object.fromEntries(p.filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
}

/** Minutes Eastern time is ahead of UTC at this instant (−300 EST, −240 EDT). */
function offsetMinutes(d: Date): number {
  const p = parts(d);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour === 24 ? 0 : p.hour, p.minute, p.second);
  return Math.round((asUtc - (d.getTime() - d.getMilliseconds())) / 60000);
}

/**
 * "2026-11-14T19:00" (a wall-clock time in Pennsylvania, as typed in a
 * datetime-local box) → the real instant. Handles EST/EDT.
 */
export function easternWallToDate(wall: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec((wall || "").trim());
  if (!m) return new Date(NaN);
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  let t = guess - offsetMinutes(new Date(guess)) * 60000;
  // second pass settles the hour around a DST change
  t = guess - offsetMinutes(new Date(t)) * 60000;
  return new Date(t);
}

/** An instant → "2026-11-14T19:00" in Eastern time, for a datetime-local box. */
export function dateToEasternWall(d: Date | string): string {
  const p = parts(new Date(d));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour === 24 ? 0 : p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DD" of an instant in Eastern time (default: now). */
export function easternYmd(d: Date | string = new Date()): string {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
}

/** The last second of an Eastern calendar day ("2026-11-14" → 11:59:59 PM ET). */
export function endOfEasternDay(ymd: string): Date {
  return new Date(easternWallToDate(`${ymd}T23:59:59`).getTime());
}

/** Day of the month in Eastern time. */
export const easternDay = (d: Date | string) => Number(new Date(d).toLocaleDateString("en-US", { timeZone: TZ, day: "numeric" }));
/** Calendar year in Eastern time. */
export const easternYear = (d: Date | string = new Date()) => Number(new Date(d).toLocaleDateString("en-US", { timeZone: TZ, year: "numeric" }));
