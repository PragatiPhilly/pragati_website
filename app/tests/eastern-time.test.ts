/**
 * Everything is Pennsylvania (Eastern) time — whatever the server's clock zone.
 * The bug: the event form read/wrote times as UTC, so "7:00 PM" became 2 PM
 * Eastern and an 11:30 PM finish (04:30 UTC) made Kali Pujo a two-day event.
 */
import { describe, it, expect } from "vitest";
import { dateToEasternWall, easternWallToDate, easternYmd, endOfEasternDay } from "../src/lib/tz";
import { buildEventDays } from "../src/lib/event-days";
import { eventDateLine, isOneDay } from "../src/lib/event-dates";

describe("Eastern time", () => {
  it("a typed 7:00 PM on Nov 14 is 7:00 PM Eastern (EST, UTC−5)", () => {
    expect(easternWallToDate("2026-11-14T19:00").toISOString()).toBe("2026-11-15T00:00:00.000Z");
    expect(easternWallToDate("2026-11-14T23:30").toISOString()).toBe("2026-11-15T04:30:00.000Z");
  });
  it("summer dates use EDT (UTC−4)", () => {
    expect(easternWallToDate("2026-10-09T17:00").toISOString()).toBe("2026-10-09T21:00:00.000Z");
  });
  it("the edit form shows back exactly what was typed", () => {
    for (const w of ["2026-11-14T19:00", "2026-11-14T23:30", "2026-10-09T17:00", "2026-03-08T03:30"]) {
      expect(dateToEasternWall(easternWallToDate(w))).toBe(w);
    }
  });
  it("calendar days are Pennsylvania's", () => {
    expect(easternYmd(new Date("2026-11-15T03:00:00Z"))).toBe("2026-11-14"); // 10 PM on the 14th
    expect(endOfEasternDay("2026-11-14").toISOString()).toBe("2026-11-15T04:59:59.000Z");
  });
});

describe("event days from the form", () => {
  it("an evening event is ONE day", () => {
    expect(buildEventDays("2026-11-14T19:00", "2026-11-14T23:30").map((d) => d.key)).toEqual(["sat"]);
  });
  it("an evening that runs past midnight is still one day", () => {
    expect(buildEventDays("2026-11-14T19:00", "2026-11-15T00:30").map((d) => d.key)).toEqual(["sat"]);
  });
  it("a real three-day pujo is three days", () => {
    expect(buildEventDays("2026-10-09T17:00", "2026-10-11T23:00").map((d) => d.key)).toEqual(["fri", "sat", "sun"]);
  });
  it("the public date line reads as one Eastern evening", () => {
    const s = new Date("2026-11-15T00:00:00Z");
    const e = new Date("2026-11-15T04:30:00Z");
    expect(isOneDay(s, e)).toBe(true);
    expect(eventDateLine(s, e)).toBe("Saturday, November 14, 2026 · 7:00 PM – 11:30 PM");
  });
});
