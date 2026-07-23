/**
 * Event day helpers shared by the admin event form (day checkboxes) and the
 * save action (stored days), so day KEYS always match between them. Days are
 * derived from the calendar date of the start/end (no server-timezone shift).
 */
export type EventDay = { key: string; label: string; date: string };

const WD_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const WD_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Build the event day list from two date or datetime-local strings. */
export function buildEventDays(start: string, end: string): EventDay[] {
  const days: EventDay[] = [];
  const s = (start || "").slice(0, 10);
  const e = (end || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return days;
  const cur = new Date(`${s}T12:00:00`);
  const stop = new Date(`${e}T12:00:00`);
  if (isNaN(cur.getTime()) || isNaN(stop.getTime()) || cur > stop) return days;
  const seen = new Set<string>();
  while (cur <= stop && days.length < 10) {
    const wd = cur.getDay();
    let key = WD_SHORT[wd];
    while (seen.has(key)) key += "2";
    seen.add(key);
    const ymd = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    days.push({ key, label: `${WD_LONG[wd]}, ${MONTHS[cur.getMonth()]} ${cur.getDate()}`, date: ymd });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

/** True when two day-key lists contain exactly the same set of keys. */
export function sameDaySet(a: string[] | null | undefined, b: string[] | null | undefined): boolean {
  const sa = new Set(a ?? []);
  const sb = new Set(b ?? []);
  if (sa.size !== sb.size) return false;
  for (const k of sa) if (!sb.has(k)) return false;
  return true;
}

/** Split a total price evenly across n day-tickets (remainder on the first). */
export function splitEven(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const q = Math.floor(totalCents / n);
  const r = totalCents - q * n;
  return Array.from({ length: n }, (_, i) => q + (i < r ? 1 : 0));
}
