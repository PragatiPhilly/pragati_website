/**
 * iCalendar (.ics) for "Remind me" — what Apple Calendar, Outlook and most
 * Android calendar apps import. Pure: no imports beyond the model.
 *
 * - Times are written in UTC (…Z) so no VTIMEZONE block is needed and every
 *   app agrees on the instant; the ET → UTC step follows daylight saving.
 * - Each event carries a VALARM 30 minutes before — that is the reminder.
 * - UIDs are stable per ritual, so adding the same ritual twice updates the
 *   calendar entry instead of duplicating it.
 */
import { TZ, calendarTitle, type FlatRite } from "./model";

/** Minutes to add to Philadelphia wall-clock to get UTC, at a given instant. */
function offsetMinutes(at: Date): number {
  const p: Record<string, number> = {};
  for (const x of new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at))
    if (x.type !== "literal") p[x.type] = Number(x.value);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
  return Math.round((at.getTime() - asUtc) / 60000);
}

/** "2026-10-10" + "14:00" in Philadelphia → the real instant. */
export function etToUtc(date: string, hhmm: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wall + offsetMinutes(new Date(wall)) * 60000;
  guess = wall + offsetMinutes(new Date(guess)) * 60000; // second pass settles DST edges
  return new Date(guess);
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 line folding at 75 octets, never splitting a multi-byte character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + b > limit) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export type IcsOptions = {
  location?: string | null;
  pageUrl?: string;
  alarmMinutes?: number;
  now?: Date;
};

export function buildIcs(rites: FlatRite[], opts: IcsOptions = {}): string {
  const alarm = opts.alarmMinutes ?? 30;
  const now = stamp(opts.now ?? new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pragati Philadelphia//Pujo Nirghonto//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const r of rites) {
    const desc = [r.bn, r.note, opts.pageUrl ? `All timings: ${opts.pageUrl}` : ""].filter(Boolean).join("\n\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.id}-${r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}@pragatiphilly.org`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(etToUtc(r.date, r.t))}`,
      `DTEND:${stamp(etToUtc(r.date, r.end ?? r.calEnd))}`,
      `SUMMARY:${esc(calendarTitle(r))}`,
    );
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    if (opts.location) lines.push(`LOCATION:${esc(opts.location)}`);
    if (opts.pageUrl) lines.push(`URL:${opts.pageUrl}`);
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(`${r.name} in ${alarm} minutes`)}`,
      `TRIGGER:-PT${alarm}M`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
