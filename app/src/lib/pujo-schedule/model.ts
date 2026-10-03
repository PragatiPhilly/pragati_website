/**
 * Pujo schedule (Pujo Nirghonto) — the pure model.
 *
 * CLIENT-SAFE: no imports, no database, no request. The homepage wall, the admin
 * editor, the calendar route and the tests all share this one file, so the
 * "what is happening now" rule can never differ between them.
 *
 * Spec: spec/15-pujo-schedule.md
 */

export const TZ = "America/New_York";

export type RiteKind = "puja" | "anjali" | "arati" | "sandhi" | "kumari" | "bisarjan" | "sindoor" | "bhog" | "other";

/** Order = the admin "Type" dropdown. */
export const RITE_KINDS: { value: RiteKind; label: string }[] = [
  { value: "puja", label: "Puja" },
  { value: "anjali", label: "Pushpanjali" },
  { value: "arati", label: "Arati" },
  { value: "sandhi", label: "Sandhi Puja" },
  { value: "kumari", label: "Kumari Puja" },
  { value: "bisarjan", label: "Bisarjan" },
  { value: "sindoor", label: "Sindoor Khela" },
  { value: "bhog", label: "Bhog" },
  { value: "other", label: "Other" },
];
const KIND_SET = new Set<string>(RITE_KINDS.map((k) => k.value));

export type Rite = { t: string; end?: string; name: string; bn?: string; kind: RiteKind; note?: string };
export type ScheduleDay = { date: string; en: string; bn: string; rites: Rite[] };

/**
 * A stored flyer. `display` / `download` are one of:
 *   "/pujo/…"            a file served from public/ (the bundled one, or a local-dev upload)
 *   "https://…"          a public Vercel Blob URL
 *   "blob:<pathname>"    a private-store blob, streamed by /api/pujo-schedule/flyer
 */
export type Flyer = {
  display: string;
  download: string;
  width: number;
  height: number;
  name: string;
  bytes: number;
  uploadedAt: string;
};

export type PujoSchedule = {
  v: 1;
  enabled: boolean;
  /** YYYY-MM-DD, event-local; the section is gone after this day. "" = never. */
  hideAfter: string;
  showFlyer: boolean;
  allowDownload: boolean;
  flyer: Flyer | null;
  days: ScheduleDay[];
};

export const BUNDLED_FLYER: Flyer = {
  display: "/pujo/pujo-nirghonto-2026.jpg",
  download: "/pujo/pujo-nirghonto-2026.jpg",
  width: 1024,
  height: 1536,
  name: "pujo-nirghonto-2026.jpg",
  bytes: 326970,
  uploadedAt: "2026-10-03",
};

/** The committee's 2026 flyer, as data. This is what the site shows until an admin edits it. */
export const DEFAULT_PUJO_SCHEDULE: PujoSchedule = {
  v: 1,
  enabled: true,
  hideAfter: "2026-10-12",
  showFlyer: true,
  allowDownload: true,
  flyer: BUNDLED_FLYER,
  days: [
    {
      date: "2026-10-09",
      en: "Maha Shashthi",
      bn: "মহাষষ্ঠী",
      rites: [
        { t: "18:00", name: "Maha Shashthi Puja", bn: "মহাষষ্ঠী পূজা", kind: "puja", note: "Bodhon: Ma Durga is awakened and welcomed. The Pujo begins." },
        { t: "19:00", name: "Arati", bn: "আরতি", kind: "arati", note: "Evening arati with lamps, conch and dhak." },
      ],
    },
    {
      date: "2026-10-10",
      en: "Maha Saptami & Maha Ashtami",
      bn: "মহাসপ্তমী ও মহাষ্টমী",
      rites: [
        { t: "10:30", name: "Maha Saptami Puja", bn: "মহাসপ্তমী পূজা", kind: "puja", note: "Saptami begins with the Nabapatrika, the Kola Bou." },
        { t: "12:00", name: "Maha Saptami Pushpanjali", bn: "মহাসপ্তমী পুষ্পাঞ্জলি", kind: "anjali", note: "Offer flowers to Ma with the priest’s mantra." },
        { t: "12:45", name: "Maha Ashtami Puja", bn: "মহাষ্টমী পূজা", kind: "puja", note: "Ashtami: Ma Durga as the slayer of Mahishasura." },
        { t: "14:00", end: "14:30", name: "Maha Ashtami Pushpanjali", bn: "মহাষ্টমী পুষ্পাঞ্জলি", kind: "anjali", note: "Ashtami anjali: offer flowers with the mantra." },
        { t: "14:30", name: "Sandhi Puja", bn: "সন্ধিপূজা", kind: "sandhi", note: "Where Ashtami meets Nabami: 108 lamps, 108 lotuses." },
      ],
    },
    {
      date: "2026-10-11",
      en: "Maha Nabami, Dashami & Lakshmi Puja",
      bn: "নবমী, দশমী ও লক্ষ্মীপূজা",
      rites: [
        { t: "10:00", name: "Maha Nabami Puja", bn: "মহানবমী পূজা", kind: "puja", note: "Nabami puja and the sacred fire, the hom." },
        { t: "10:40", name: "Maha Nabami Pushpanjali", bn: "মহানবমী পুষ্পাঞ্জলি", kind: "anjali", note: "The last anjali of this year’s Pujo." },
        { t: "11:10", name: "Kumari Puja", bn: "কুমারী পূজা", kind: "kumari", note: "A young girl is worshipped as the Goddess herself." },
        { t: "11:45", name: "Dashami Puja & Bisarjan", bn: "দশমী পূজা ও বিসর্জন", kind: "bisarjan", note: "The farewell puja and the immersion." },
        { t: "12:30", name: "Maha Lakshmi Puja", bn: "মহালক্ষ্মী পূজা", kind: "puja", note: "Ma Lakshmi, goddess of fortune, is worshipped." },
        { t: "15:00", name: "Sindoor Khela", bn: "সিঁদুর খেলা", kind: "sindoor", note: "Sindoor for Ma, and for one another, before she leaves." },
      ],
    },
  ],
};

// ── cleaning whatever is stored ─────────────────────────────────────────────

export const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}
export function isDate(v: string): boolean {
  if (!YMD.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function safeRef(v: unknown): string {
  const s = str(v, 600);
  if (s.includes("..")) return "";
  if (/^\/(?!\/)[\w\-./]+$/.test(s) || /^https:\/\/[^\s"'<>]+$/.test(s) || /^blob:[\w\-./]+$/.test(s)) return s;
  return "";
}

function sanitizeFlyer(raw: unknown): Flyer | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  const display = safeRef(f.display);
  const download = safeRef(f.download) || display;
  if (!display) return null;
  const n = (v: unknown, dflt: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : dflt);
  return {
    display,
    download,
    width: n(f.width, 1024),
    height: n(f.height, 1536),
    name: str(f.name, 120) || "pujo-flyer.jpg",
    bytes: n(f.bytes, 0),
    uploadedAt: str(f.uploadedAt, 40),
  };
}

export function sanitizeRite(raw: unknown): Rite | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const t = str(r.t, 5);
  const name = str(r.name, 80);
  if (!HHMM.test(t) || !name) return null;
  const end = str(r.end, 5);
  const kind = KIND_SET.has(String(r.kind)) ? (r.kind as RiteKind) : "puja";
  const out: Rite = { t, name, kind };
  if (HHMM.test(end) && toMin(end) > toMin(t)) out.end = end;
  const bn = str(r.bn, 80);
  if (bn) out.bn = bn;
  const note = str(r.note, 160);
  if (note) out.note = note;
  return out;
}

function sanitizeDay(raw: unknown): ScheduleDay | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const date = str(d.date, 10);
  if (!isDate(date)) return null;
  const rites = (Array.isArray(d.rites) ? d.rites : [])
    .map(sanitizeRite)
    .filter((x): x is Rite => !!x)
    .slice(0, 40)
    .sort((a, b) => toMin(a.t) - toMin(b.t));
  return { date, en: str(d.en, 60), bn: str(d.bn, 60), rites };
}

/** Whatever is in the database → a schedule that is safe to render. Never throws. */
export function sanitizeSchedule(raw: unknown): PujoSchedule {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const days = (Array.isArray(r.days) ? r.days : [])
    .map(sanitizeDay)
    .filter((d): d is ScheduleDay => !!d && d.rites.length > 0 && !seen.has(d.date) && !!seen.add(d.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 10);
  const hideAfter = str(r.hideAfter, 10);
  return {
    v: 1,
    enabled: r.enabled === true,
    hideAfter: isDate(hideAfter) ? hideAfter : "",
    showFlyer: r.showFlyer !== false,
    allowDownload: r.allowDownload !== false,
    flyer: sanitizeFlyer(r.flyer),
    days,
  };
}

// ── time ─────────────────────────────────────────────────────────────────────

/** A moment as Philadelphia wall-clock: date + minutes after midnight. */
export type Moment = { date: string; minutes: number };

export function etParts(at: Date): Moment {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at))
    p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

export function todayET(at = new Date()): string {
  return etParts(at).date;
}

function dayNum(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 864e5);
}

/** Is the section on the homepage at this moment? */
export function scheduleVisible(s: PujoSchedule, at = new Date()): boolean {
  if (!s.enabled || s.days.length === 0) return false;
  return !s.hideAfter || todayET(at) <= s.hideAfter;
}

// ── flattening + "what is happening now" ────────────────────────────────────

export type FlatRite = Rite & {
  id: string;
  date: string;
  day: number; // index into days
  k: number; // index within its day
  start: number; // absolute minutes (day number × 1440 + minutes)
  stop: number; // when it stops being "now"
  calEnd: string; // HH:MM end used for calendar entries
};

const DEFAULT_LEN: Partial<Record<RiteKind, number>> = { sandhi: 48, arati: 45 };

export function flatten(days: ScheduleDay[]): FlatRite[] {
  const out: FlatRite[] = [];
  const ids = new Set<string>();
  days.forEach((d, di) => {
    const base = dayNum(d.date) * 1440;
    d.rites.forEach((r, k) => {
      const s = toMin(r.t);
      const nx = d.rites[k + 1];
      // a ritual stays "now" until the next one that day begins; the day's last one runs its own length
      const stopMin = r.end ? toMin(r.end) : nx ? toMin(nx.t) : s + (DEFAULT_LEN[r.kind] ?? 60);
      const calMin = r.end ? toMin(r.end) : Math.min(nx ? Math.max(toMin(nx.t), s + 15) : s + 60, s + 90, 23 * 60 + 59);
      let id = `${d.date.replace(/-/g, "")}-${r.t.replace(":", "")}`;
      if (ids.has(id)) id += `-${k}`;
      ids.add(id);
      out.push({
        ...r,
        id,
        date: d.date,
        day: di,
        k,
        start: base + s,
        stop: base + Math.max(stopMin, s + 1),
        calEnd: `${String(Math.floor(calMin / 60)).padStart(2, "0")}:${String(calMin % 60).padStart(2, "0")}`,
      });
    });
  });
  return out;
}

export type Phase = "before" | "during" | "after";
export type Status = {
  phase: Phase;
  now: number; // index into the flat list, -1 = none
  next: number;
  nextIn: number; // minutes until `next` starts
  day: number; // the day to open on a phone
  daysTo: number; // before: whole days until day one
  past: boolean[]; // finished rituals
};

export function statusAt(rites: FlatRite[], days: ScheduleDay[], at: Moment): Status {
  const past = rites.map(() => false);
  if (rites.length === 0 || days.length === 0) return { phase: "after", now: -1, next: -1, nextIn: 0, day: 0, daysTo: 0, past };
  const t = dayNum(at.date) * 1440 + at.minutes;
  if (at.date < days[0].date) {
    return { phase: "before", now: -1, next: 0, nextIn: rites[0].start - t, day: 0, daysTo: dayNum(days[0].date) - dayNum(at.date), past };
  }
  let now = -1;
  let next = -1;
  rites.forEach((r, i) => {
    if (r.start <= t && t < r.stop) now = i;
    if (r.stop <= t) past[i] = true;
    if (next < 0 && r.start > t) next = i;
  });
  if (now < 0 && next < 0) return { phase: "after", now, next, nextIn: 0, day: days.length - 1, daysTo: 0, past };
  const today = days.findIndex((d) => d.date === at.date);
  const day = today >= 0 ? today : rites[next >= 0 ? next : now].day;
  return { phase: "during", now, next, nextIn: next >= 0 ? rites[next].start - t : 0, day, daysTo: 0, past };
}

// ── words ───────────────────────────────────────────────────────────────────

export function fmtTime(hhmm: string): string {
  const m = toMin(hhmm);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h % 12 || 12}:${String(mm).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

/** "2:00 PM", or "2:00 – 2:30 PM" when the ritual has an end time. */
export function timeLabel(r: { t: string; end?: string }): string {
  const a = fmtTime(r.t);
  if (!r.end) return a;
  const b = fmtTime(r.end);
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)} – ${b}` : `${a} – ${b}`;
}

export function inWords(mins: number): string {
  if (mins < 1) return "starting now";
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `in ${h} hr${m ? ` ${m} min` : ""}`;
}

export function dayParts(date: string): { dow: string; short: string; dd: string; mon: string } {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o }).format(dt);
  return { dow: f({ weekday: "long" }), short: f({ weekday: "short" }), dd: String(d), mon: f({ month: "short" }) };
}

/** When `next` happens, said from today's point of view: "2:00 PM · in 10 min" / "Tomorrow · 10:00 AM". */
export function nextWhen(st: Status, rites: FlatRite[], at: Moment): string {
  const r = rites[st.next];
  if (!r) return "";
  if (r.date === at.date) return `${timeLabel(r)} · ${inWords(st.nextIn)}`;
  const gap = dayNum(r.date) - dayNum(at.date);
  return `${gap === 1 ? "Tomorrow" : dayParts(r.date).dow} · ${timeLabel(r)}`;
}

// ── icons (24 × 24 stroke paths) ────────────────────────────────────────────

function ring108(): string {
  let d = "M12 15.4C10.6 15.4 10 14 10.8 12.8L12 10.4L13.2 12.8C14 14 13.4 15.4 12 15.4Z";
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const x = 12 + 8.4 * Math.cos(a);
    const y = 12 + 8.4 * Math.sin(a);
    d += ` M${(x - 0.9).toFixed(2)} ${y.toFixed(2)}a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0 -1.8 0`;
  }
  return d;
}

export const ICON_PATHS = {
  kalash:
    "M6 12.5C6 16.6 8.7 19.5 12 19.5C15.3 19.5 18 16.6 18 12.5C18 10.6 16.8 9.2 15 8.8H9C7.2 9.2 6 10.6 6 12.5Z M9 8.8V7H15V8.8 M12 7V3.8 M12 6C10.5 4 8.5 3.2 6.5 3.6 M12 6C13.5 4 15.5 3.2 17.5 3.6 M9.5 19.5L8.5 21.5H15.5L14.5 19.5 M9.5 13.5H14.5",
  bel: "M12 22V12.5 M12 12.5C10.6 9 10.6 5.6 12 2.5C13.4 5.6 13.4 9 12 12.5Z M12 13C9.2 13.1 6.2 11.4 4.2 8C7.8 7.9 10.6 9.7 12 13Z M12 13C14.8 13.1 17.8 11.4 19.8 8C16.2 7.9 13.4 9.7 12 13Z",
  lamp: "M12 22V14 M8.5 22H15.5 M4.5 10.5H19.5 M4.5 10.5C4.5 12.7 8 14 12 14C16 14 19.5 12.7 19.5 10.5 M6 8.5C5.2 8.5 4.8 7.6 5.3 6.8L6 5.5L6.7 6.8C7.2 7.6 6.8 8.5 6 8.5Z M9 8.5C8.2 8.5 7.8 7.6 8.3 6.8L9 5.5L9.7 6.8C10.2 7.6 9.8 8.5 9 8.5Z M12 8.5C11.2 8.5 10.8 7.6 11.3 6.8L12 4.3L12.7 6.8C13.2 7.6 12.8 8.5 12 8.5Z M15 8.5C14.2 8.5 13.8 7.6 14.3 6.8L15 5.5L15.7 6.8C16.2 7.6 15.8 8.5 15 8.5Z M18 8.5C17.2 8.5 16.8 7.6 17.3 6.8L18 5.5L18.7 6.8C19.2 7.6 18.8 8.5 18 8.5Z",
  kola: "M12 22V9 M12 13.5C9 11.5 6 11.4 3.5 12.8C5 9.4 8.5 8.4 12 10.4 M12 11.4C15 9.4 18 9.3 20.5 10.7C19 7.3 15.5 6.3 12 8.3 M12 9C11.2 6.2 11.6 3.8 13.2 2 M9 22C9 19 10.3 17 12 16C13.7 17 15 19 15 22",
  lotus:
    "M12 20C7.5 20 4.5 17.5 3 14C6 14 9 15.2 12 18C15 15.2 18 14 21 14C19.5 17.5 16.5 20 12 20Z M12 18C9.8 15.5 9.3 12 12 7C14.7 12 14.2 15.5 12 18Z M9.8 16.6C7.6 14.8 6.8 12.2 7.4 9.4C9 10.2 10.2 11.4 10.8 12.8 M14.2 16.6C16.4 14.8 17.2 12.2 16.6 9.4C15 10.2 13.8 11.4 13.2 12.8",
  trishul:
    "M12 22V4 M12 2.3L10.9 5H13.1Z M6.5 4.5C6.5 8.2 8.6 10.4 12 10.4C15.4 10.4 17.5 8.2 17.5 4.5 M6.5 4.5L5.4 6.6 M6.5 4.5L7.9 6.1 M17.5 4.5L18.6 6.6 M17.5 4.5L16.1 6.1 M9.6 14.4H14.4",
  lamps: ring108(),
  hom: "M12 19.5C9 19.5 7.2 17.4 7.2 15C7.2 12.1 9.8 10.8 9.8 7.6C11.6 8.9 12.4 10.3 12.4 12.1C13.3 11.2 13.8 9.9 13.6 8.5C16 10.3 16.8 12.6 16.8 15C16.8 17.4 15 19.5 12 19.5Z M3.5 22H20.5 M5.5 22V19.5H18.5V22",
  mukut: "M4 18H20 M4 18L3 8L8 11.5L12 4L16 11.5L21 8L20 18 M5.5 21H18.5 M10.5 15A1.5 1.5 0 1 0 13.5 15A1.5 1.5 0 1 0 10.5 15",
  waves:
    "M2.5 16C4.5 16 4.5 14.5 7 14.5S9.5 16 12 16S14.5 14.5 17 14.5S19.5 16 21.5 16 M2.5 20C4.5 20 4.5 18.5 7 18.5S9.5 20 12 20S14.5 18.5 17 18.5S19.5 20 21.5 20 M8 12L9.2 5.5L12 8.5L14.8 5.5L16 12 M7 12H17",
  owl: "M6.5 9.5C6.5 6.5 9 4.5 12 4.5C15 4.5 17.5 6.5 17.5 9.5V15C17.5 18.3 15 20.5 12 20.5C9 20.5 6.5 18.3 6.5 15Z M6.5 7L5.5 3.5L8.8 5.2 M17.5 7L18.5 3.5L15.2 5.2 M8 10.2A1.8 1.8 0 1 0 11.6 10.2A1.8 1.8 0 1 0 8 10.2 M12.4 10.2A1.8 1.8 0 1 0 16 10.2A1.8 1.8 0 1 0 12.4 10.2 M12 12.6L11.2 14H12.8Z M9.5 16.4C10.2 17.2 11 17.6 12 17.6C13 17.6 13.8 17.2 14.5 16.4",
  sindoor:
    "M6 13H18V18C18 19.7 16.7 21 15 21H9C7.3 21 6 19.7 6 18Z M5 11H19V13H5Z M10 11V9H14V11 M7.4 6.5A.7 .7 0 1 0 8.8 6.5A.7 .7 0 1 0 7.4 6.5 M11.3 4.3A.7 .7 0 1 0 12.7 4.3A.7 .7 0 1 0 11.3 4.3 M15.2 6.2A.7 .7 0 1 0 16.6 6.2A.7 .7 0 1 0 15.2 6.2",
  bhog: "M3 12H21 M4 12C4 16.4 7.6 20 12 20S20 16.4 20 12 M9 8.5C9 7 10 7 10 5.5 M14 8.5C14 7 15 7 15 5.5 M8 20.5H16",
} as const;
export type IconKey = keyof typeof ICON_PATHS;

/** Type picks the icon; a Puja named after its day gets that day's emblem. */
export function iconFor(r: { kind: RiteKind; name: string }): IconKey {
  switch (r.kind) {
    case "anjali":
      return "lotus";
    case "arati":
      return "lamp";
    case "sandhi":
      return "lamps";
    case "kumari":
      return "mukut";
    case "bisarjan":
      return "waves";
    case "sindoor":
      return "sindoor";
    case "bhog":
      return "bhog";
  }
  const n = r.name.toLowerCase();
  if (/shashthi|shasthi|sasthi|bodhon/.test(n)) return "bel";
  if (/saptami/.test(n)) return "kola";
  if (/ashtami/.test(n)) return "trishul";
  if (/nabami|navami/.test(n)) return "hom";
  if (/lakshmi|laxmi/.test(n)) return "owl";
  return "kalash";
}

// ── calendar links ──────────────────────────────────────────────────────────

export function calendarTitle(r: { name: string; date: string }): string {
  return `${r.name} · Pragati Durga Puja ${r.date.slice(0, 4)}`;
}

/** Google Calendar "add event" link, wall-clock times in Philadelphia. */
export function googleCalendarUrl(r: FlatRite, opts: { location?: string | null; details?: string } = {}): string {
  const d = r.date.replace(/-/g, "");
  const hm = (x: string) => `${x.replace(":", "")}00`;
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: calendarTitle(r),
    dates: `${d}T${hm(r.t)}/${d}T${hm(r.end ?? r.calEnd)}`,
    ctz: TZ,
  });
  if (opts.details) q.set("details", opts.details);
  if (opts.location) q.set("location", opts.location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

// ── the flyer, as the public page needs it ──────────────────────────────────

export type PublicFlyer = { src: string; width: number; height: number; download: string | null; fileName: string };

export function publicFlyer(s: PujoSchedule): PublicFlyer | null {
  const f = s.flyer;
  if (!f || (!s.showFlyer && !s.allowDownload)) return null;
  const stamp = encodeURIComponent(f.uploadedAt || "1");
  const year = s.days[0]?.date.slice(0, 4) ?? "";
  const ext = /\.png$/i.test(f.download) ? "png" : "jpg";
  const fileName = `Pujo-Nirghonto-${year || "flyer"}.${ext}`;
  const src = f.display.startsWith("blob:") ? `/api/pujo-schedule/flyer?f=display&v=${stamp}` : f.display;
  let download: string | null = null;
  if (s.allowDownload) {
    if (f.download.startsWith("blob:")) download = `/api/pujo-schedule/flyer?f=download&v=${stamp}`;
    else if (f.download.startsWith("https://")) download = `${f.download}${f.download.includes("?") ? "&" : "?"}download=1`;
    else download = f.download;
  }
  return { src: s.showFlyer ? src : "", width: f.width, height: f.height, download, fileName };
}

// ── "Paste from the flyer" ──────────────────────────────────────────────────

const KNOWN_BN: Record<string, string> = {
  "maha shashthi puja": "মহাষষ্ঠী পূজা",
  "shashthi puja": "ষষ্ঠী পূজা",
  bodhon: "বোধন",
  arati: "আরতি",
  "sandhya arati": "সন্ধ্যা আরতি",
  "maha saptami puja": "মহাসপ্তমী পূজা",
  "maha saptami pushpanjali": "মহাসপ্তমী পুষ্পাঞ্জলি",
  "maha ashtami puja": "মহাষ্টমী পূজা",
  "maha ashtami pushpanjali": "মহাষ্টমী পুষ্পাঞ্জলি",
  "sandhi puja": "সন্ধিপূজা",
  "maha nabami puja": "মহানবমী পূজা",
  "maha nabami pushpanjali": "মহানবমী পুষ্পাঞ্জলি",
  "kumari puja": "কুমারী পূজা",
  "dashami puja & bisarjan": "দশমী পূজা ও বিসর্জন",
  "dashami puja": "দশমী পূজা",
  bisarjan: "বিসর্জন",
  "maha lakshmi puja": "মহালক্ষ্মী পূজা",
  "lakshmi puja": "লক্ষ্মীপূজা",
  "sindoor khela": "সিঁদুর খেলা",
  bhog: "ভোগ",
};

export function guessKind(name: string): RiteKind {
  const n = name.toLowerCase();
  if (/anjali/.test(n)) return "anjali";
  if (/sandhi/.test(n)) return "sandhi";
  if (/kumari/.test(n)) return "kumari";
  if (/bisarjan|visarjan|immersion/.test(n)) return "bisarjan";
  if (/sind(o|u)o?r/.test(n)) return "sindoor";
  if (/arati|aarti|arti\b/.test(n)) return "arati";
  if (/bhog|prasad/.test(n)) return "bhog";
  return "puja";
}

function to24(h: number, m: number, ap: string | undefined): string | null {
  if (h > 23 || m > 59) return null;
  const a = (ap ?? "").toLowerCase().replace(/\./g, "");
  let hh = h;
  if (a === "pm" && h < 12) hh = h + 12;
  else if (a === "am" && h === 12) hh = 0;
  else if (!a && h >= 1 && h <= 7) hh = h + 12; // "6:00 – Arati": a puja at 6 is an evening one
  return `${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * One ritual per line, time first:
 *   "10:30 AM – Maha Saptami Puja"   "2:00 PM–2:30 PM – Maha Ashtami Pushpanjali"   "6 pm Arati"
 * Lines that don't start with a time are skipped and reported.
 */
export function parsePastedLines(text: string): { rites: Rite[]; skipped: string[] } {
  const rites: Rite[] = [];
  const skipped: string[] = [];
  const re =
    /^\s*[•\-*]?\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:(?:-|–|—|to)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?)?\s*(?:-|–|—|:|\|)?\s*(.+?)\s*$/i;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = re.exec(line);
    // a bare number ("10th October") is not a time: need minutes or am/pm
    if (!m || !m[7] || /^\d/.test(m[7]) || (!m[2] && !m[3])) {
      skipped.push(line.trim());
      continue;
    }
    const ap1 = m[3] ?? m[6];
    const t = to24(Number(m[1]), Number(m[2] ?? 0), ap1);
    const end = m[4] ? to24(Number(m[4]), Number(m[5] ?? 0), m[6] ?? m[3]) : null;
    const name = m[7].replace(/^[-–—:|\s]+/, "").trim();
    if (!t || !name) {
      skipped.push(line.trim());
      continue;
    }
    const r: Rite = { t, name: name.slice(0, 80), kind: guessKind(name) };
    if (end && toMin(end) > toMin(t)) r.end = end;
    const bn = KNOWN_BN[name.toLowerCase()];
    if (bn) r.bn = bn;
    rites.push(r);
  }
  rites.sort((a, b) => toMin(a.t) - toMin(b.t));
  return { rites, skipped };
}
