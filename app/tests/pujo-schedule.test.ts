import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  DEFAULT_PUJO_SCHEDULE,
  BUNDLED_FLYER,
  flatten,
  statusAt,
  nextWhen,
  timeLabel,
  googleCalendarUrl,
  parsePastedLines,
  sanitizeSchedule,
  scheduleVisible,
  publicFlyer,
  iconFor,
  etParts,
} from "../src/lib/pujo-schedule/model";
import { buildIcs, etToUtc } from "../src/lib/pujo-schedule/ics";
import { systemConfigDefaults } from "../src/config/defaults";

const S = DEFAULT_PUJO_SCHEDULE;
const rites = flatten(S.days);
const at = (date: string, hhmm: string) => ({ date, minutes: Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) });
const name = (i: number) => (i >= 0 ? rites[i].name : null);

describe("the 2026 schedule (from the committee's flyer)", () => {
  it("has the 13 rituals over Fri 9 – Sun 11 October, in order", () => {
    expect(S.days.map((d) => d.date)).toEqual(["2026-10-09", "2026-10-10", "2026-10-11"]);
    expect(rites.map((r) => `${r.date} ${r.t} ${r.name}`)).toEqual([
      "2026-10-09 18:00 Maha Shashthi Puja",
      "2026-10-09 19:00 Arati",
      "2026-10-10 10:30 Maha Saptami Puja",
      "2026-10-10 12:00 Maha Saptami Pushpanjali",
      "2026-10-10 12:45 Maha Ashtami Puja",
      "2026-10-10 14:00 Maha Ashtami Pushpanjali",
      "2026-10-10 14:30 Sandhi Puja",
      "2026-10-11 10:00 Maha Nabami Puja",
      "2026-10-11 10:40 Maha Nabami Pushpanjali",
      "2026-10-11 11:10 Kumari Puja",
      "2026-10-11 11:45 Dashami Puja & Bisarjan",
      "2026-10-11 12:30 Maha Lakshmi Puja",
      "2026-10-11 15:00 Sindoor Khela",
    ]);
    expect(rites.filter((r) => r.kind === "anjali")).toHaveLength(3);
  });

  it("is what the site shows until an admin edits it", () => {
    expect(systemConfigDefaults.pujo_schedule).toBe(DEFAULT_PUJO_SCHEDULE);
    expect(sanitizeSchedule(DEFAULT_PUJO_SCHEDULE)).toEqual(DEFAULT_PUJO_SCHEDULE);
  });

  it("ships the bundled flyer file (T13)", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../public", BUNDLED_FLYER.display.slice(1)))).toBe(true);
  });

  it("gives each ritual a stable, unique id", () => {
    expect(new Set(rites.map((r) => r.id)).size).toBe(rites.length);
    expect(rites[5].id).toBe("20261010-1400");
  });
});

describe("what is happening now", () => {
  it("T1 · a week before: 'Pujo begins in 6 days'", () => {
    const st = statusAt(rites, S.days, at("2026-10-03", "13:25"));
    expect(st.phase).toBe("before");
    expect(st.daysTo).toBe(6);
    expect(st.day).toBe(0);
  });

  it("T2 · Sat 1:50 PM: Ashtami Puja now, Ashtami Pushpanjali next in 10 min", () => {
    const m = at("2026-10-10", "13:50");
    const st = statusAt(rites, S.days, m);
    expect(st.phase).toBe("during");
    expect(name(st.now)).toBe("Maha Ashtami Puja");
    expect(name(st.next)).toBe("Maha Ashtami Pushpanjali");
    expect(st.nextIn).toBe(10);
    expect(nextWhen(st, rites, m)).toBe("2:00 – 2:30 PM · in 10 min");
    expect(st.day).toBe(1);
    expect(st.past.slice(0, 4)).toEqual([true, true, true, true]);
  });

  it("T3 · Sat 2:10 PM: inside the Ashtami Pushpanjali window", () => {
    expect(name(statusAt(rites, S.days, at("2026-10-10", "14:10")).now)).toBe("Maha Ashtami Pushpanjali");
  });

  it("T4 · Sat 2:34 PM: Sandhi Puja; next is tomorrow morning", () => {
    const m = at("2026-10-10", "14:34");
    const st = statusAt(rites, S.days, m);
    expect(name(st.now)).toBe("Sandhi Puja");
    expect(name(st.next)).toBe("Maha Nabami Puja");
    expect(nextWhen(st, rites, m)).toBe("Tomorrow · 10:00 AM");
  });

  it("T5 · Sun 4:30 PM: the Pujo is over", () => {
    expect(statusAt(rites, S.days, at("2026-10-11", "16:30")).phase).toBe("after");
    expect(statusAt(rites, S.days, at("2026-10-12", "10:00")).phase).toBe("after");
  });

  it("T6 · Sat 9:00 AM: nothing now, Saptami Puja up next in 1 hr 30 min", () => {
    const m = at("2026-10-10", "09:00");
    const st = statusAt(rites, S.days, m);
    expect(st.phase).toBe("during");
    expect(st.now).toBe(-1);
    expect(name(st.next)).toBe("Maha Saptami Puja");
    expect(nextWhen(st, rites, m)).toBe("10:30 AM · in 1 hr 30 min");
  });

  it("Fri 7:30 PM: Arati is still on (its own 45 minutes)", () => {
    expect(name(statusAt(rites, S.days, at("2026-10-09", "19:30")).now)).toBe("Arati");
    expect(statusAt(rites, S.days, at("2026-10-09", "19:50")).now).toBe(-1);
  });

  it("reads the Philadelphia wall clock, whatever the server's zone", () => {
    expect(etParts(new Date("2026-10-10T17:50:00Z"))).toEqual({ date: "2026-10-10", minutes: 13 * 60 + 50 });
    expect(etParts(new Date("2026-10-11T03:30:00Z"))).toEqual({ date: "2026-10-10", minutes: 23 * 60 + 30 });
  });
});

describe("words and icons", () => {
  it("formats times like the flyer", () => {
    expect(timeLabel({ t: "14:00", end: "14:30" })).toBe("2:00 – 2:30 PM");
    expect(timeLabel({ t: "11:45", end: "12:15" })).toBe("11:45 AM – 12:15 PM");
    expect(timeLabel({ t: "00:30" })).toBe("12:30 AM");
  });
  it("gives a Puja named after its day that day's emblem", () => {
    expect(iconFor({ kind: "puja", name: "Maha Shashthi Puja" })).toBe("bel");
    expect(iconFor({ kind: "puja", name: "Maha Ashtami Puja" })).toBe("trishul");
    expect(iconFor({ kind: "puja", name: "Maha Lakshmi Puja" })).toBe("owl");
    expect(iconFor({ kind: "anjali", name: "Maha Ashtami Pushpanjali" })).toBe("lotus");
    expect(iconFor({ kind: "puja", name: "Ghot Sthapana" })).toBe("kalash");
  });
});

describe("calendar reminders", () => {
  it("T7 · one ritual as .ics: UTC times, 30-minute alarm, CRLF, escaped text", () => {
    const r = rites[5]; // Ashtami Pushpanjali, 2:00–2:30 PM EDT
    const ics = buildIcs([r], { location: "Venue Hall, 1 Main St; Malvern", pageUrl: "https://pragatiphilly.org/#schedule", now: new Date("2026-10-03T12:00:00Z") });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261010T180000Z\r\n");
    expect(ics).toContain("DTEND:20261010T183000Z\r\n");
    expect(ics).toContain("TRIGGER:-PT30M\r\n");
    expect(ics).toContain("UID:20261010-1400-maha-ashtami-pushpanjali@pragatiphilly.org");
    expect(ics).toContain("LOCATION:Venue Hall\\, 1 Main St\\; Malvern");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.split("\n").every((l, i, a) => i === a.length - 1 || l.endsWith("\r"))).toBe(true);
  });

  it("T7b · the three Pushpanjalis in one file", () => {
    const ics = buildIcs(rites.filter((r) => r.kind === "anjali"));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(3);
  });

  it("T8 · follows daylight saving (EST in November)", () => {
    expect(etToUtc("2026-10-10", "14:00").toISOString()).toBe("2026-10-10T18:00:00.000Z");
    expect(etToUtc("2026-11-14", "14:00").toISOString()).toBe("2026-11-14T19:00:00.000Z");
  });

  it("an end time is always given: next ritual, capped, or its own", () => {
    expect(rites[3].calEnd).toBe("12:45"); // Saptami anjali → until Ashtami Puja
    expect(rites[12].calEnd).toBe("16:00"); // Sindoor Khela, last of the day → 1 hr
  });

  it("T9 · Google Calendar link in Philadelphia wall-clock time", () => {
    const u = new URL(googleCalendarUrl(rites[5], { location: "Hall", details: "x" }));
    expect(u.hostname).toBe("calendar.google.com");
    expect(u.searchParams.get("action")).toBe("TEMPLATE");
    expect(u.searchParams.get("dates")).toBe("20261010T140000/20261010T143000");
    expect(u.searchParams.get("ctz")).toBe("America/New_York");
    expect(u.searchParams.get("text")).toBe("Maha Ashtami Pushpanjali · Pragati Durga Puja 2026");
  });
});

describe("paste from the flyer", () => {
  it("T10 · reads the flyer's lines, ranges and am/pm", () => {
    const { rites: out, skipped } = parsePastedLines(
      [
        "Saturday, 10th October 2026",
        "10:30 AM – Maha Saptami Puja",
        "12:00 PM – Maha Saptami Pushpanjali",
        "2:00 PM–2:30 PM – Maha Ashtami Pushpanjali",
        "6 pm Arati",
        "2:30 PM - Sandhi Puja",
      ].join("\n"),
    );
    expect(skipped).toEqual(["Saturday, 10th October 2026"]);
    expect(out.map((r) => [r.t, r.end ?? "", r.name, r.kind])).toEqual([
      ["10:30", "", "Maha Saptami Puja", "puja"],
      ["12:00", "", "Maha Saptami Pushpanjali", "anjali"],
      ["14:00", "14:30", "Maha Ashtami Pushpanjali", "anjali"],
      ["14:30", "", "Sandhi Puja", "sandhi"],
      ["18:00", "", "Arati", "arati"],
    ]);
    expect(out[0].bn).toBe("মহাসপ্তমী পূজা");
  });
});

describe("whatever is stored is made safe", () => {
  it("T11 · drops bad rows, bad days, unsafe flyer paths", () => {
    const s = sanitizeSchedule({
      enabled: true,
      hideAfter: "2026-13-40",
      flyer: { display: "javascript:alert(1)", download: "/x.jpg" },
      days: [
        { date: "2026-10-10", en: "Sat", bn: "", rites: [{ t: "25:00", name: "x" }, { t: "10:00", name: "" }, { t: "09:00", name: "  Early  ", kind: "nope", end: "08:00" }] },
        { date: "2026-02-30", rites: [{ t: "10:00", name: "x" }] },
        { date: "2026-10-11", rites: [] },
        "junk",
      ],
    });
    expect(s.hideAfter).toBe("");
    expect(s.flyer).toBeNull();
    expect(s.days).toHaveLength(1);
    expect(s.days[0].rites).toEqual([{ t: "09:00", name: "Early", kind: "puja" }]);
    expect(sanitizeSchedule(undefined).days).toEqual([]);
    expect(sanitizeSchedule({ flyer: { display: "/pujo/../../etc/passwd" } }).flyer).toBeNull();
  });

  it("T12 · hidden when switched off, empty, or after the take-down date", () => {
    expect(scheduleVisible(S, new Date("2026-10-03T16:00:00Z"))).toBe(true);
    expect(scheduleVisible(S, new Date("2026-10-12T20:00:00Z"))).toBe(true); // Bijoya day
    expect(scheduleVisible(S, new Date("2026-10-13T14:00:00Z"))).toBe(false);
    expect(scheduleVisible({ ...S, enabled: false }, new Date("2026-10-03T16:00:00Z"))).toBe(false);
    expect(scheduleVisible({ ...S, days: [] }, new Date("2026-10-03T16:00:00Z"))).toBe(false);
    expect(scheduleVisible({ ...S, hideAfter: "" }, new Date("2027-01-01T16:00:00Z"))).toBe(true);
  });

  it("serves the flyer from the right place for each store", () => {
    expect(publicFlyer(S)).toEqual({ src: "/pujo/pujo-nirghonto-2026.jpg", width: 1024, height: 1536, download: "/pujo/pujo-nirghonto-2026.jpg", fileName: "Pujo-Nirghonto-2026.jpg" });
    const priv = publicFlyer({ ...S, flyer: { ...BUNDLED_FLYER, display: "blob:pujo/a.webp", download: "blob:pujo/a.jpg", uploadedAt: "t1" } })!;
    expect(priv.src).toBe("/api/pujo-schedule/flyer?f=display&v=t1");
    expect(priv.download).toBe("/api/pujo-schedule/flyer?f=download&v=t1");
    const pub = publicFlyer({ ...S, flyer: { ...BUNDLED_FLYER, display: "https://x.public.blob.vercel-storage.com/pujo/a.webp", download: "https://x.public.blob.vercel-storage.com/pujo/a.jpg" } })!;
    expect(pub.download).toBe("https://x.public.blob.vercel-storage.com/pujo/a.jpg?download=1");
    expect(publicFlyer({ ...S, allowDownload: false })!.download).toBeNull();
    expect(publicFlyer({ ...S, showFlyer: false, allowDownload: false })).toBeNull();
  });
});
