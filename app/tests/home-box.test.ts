/** spec/20 — homepage box: countdown or a past festival's numbers, per event. */
import { describe, it, expect } from "vitest";
import { cleanHomeBox, eventDatesLabel, homeBoxCard, parseHomeBox, suggestedHomeBox } from "../src/lib/home-box";

const cfg = {
  recap_stat_1_value: "3", recap_stat_1_label: "Days of Pujo",
  recap_stat_2_value: "1000+", recap_stat_2_label: "Attendees",
  recap_stat_3_value: "", recap_stat_3_label: "",
  recap_stat_4_value: "2", recap_stat_4_label: "Concert nights",
};
const durga = { name: "Durga Pujo 2026", nameBengali: "দুর্গাপূজা ২০২৬", startsAt: new Date("2026-10-09T13:00:00Z"), endsAt: new Date("2026-10-11T23:20:00Z"), venueName: "Greater Philadelphia Expo Center" };

describe("homepage box", () => {
  it("nothing stored / junk stored = countdown (the old behaviour)", () => {
    expect(parseHomeBox(undefined).mode).toBe("countdown");
    expect(parseHomeBox("{not json").mode).toBe("countdown");
    expect(homeBoxCard(parseHomeBox(null))).toBeNull();
  });

  it("suggests the thank-you card's numbers and the last festival's dates", () => {
    const b = suggestedHomeBox(cfg, { ...durga, dates: eventDatesLabel(durga) });
    expect(b.mode).toBe("numbers");
    expect(b.title).toBe("Durga Pujo 2026 — by the numbers");
    expect(b.foot).toBe("Oct 9–11 · Greater Philadelphia Expo Center");
    expect(b.stats).toEqual([
      { value: "3", label: "Days of Pujo" },
      { value: "1000+", label: "Attendees" },
      { value: "2", label: "Concert nights" },
    ]);
  });

  it("numbers card counts up plain numbers and keeps text as typed", () => {
    const card = homeBoxCard(cleanHomeBox({ mode: "numbers", kicker: "", title: "T", titleBn: "", foot: "", stats: [{ value: "1000+", label: "Attendees" }, { value: "", label: "dropped" }, { value: "$5k", label: "Raised" }] }))!;
    expect(card.kicker).toBe("Last celebration");
    expect(card.stats.map((s) => [s.n, s.suffix, s.text])).toEqual([[1000, "+", "1000+"], [null, "", "$5k"]]);
  });

  it("numbers picked but every number blank → falls back to the countdown", () => {
    expect(homeBoxCard({ mode: "numbers", kicker: "", title: "x", titleBn: "", foot: "", stats: [{ value: " ", label: "a" }] })).toBeNull();
  });

  it("one-night events read as one date (Eastern)", () => {
    expect(eventDatesLabel({ startsAt: new Date("2026-11-15T00:00:00Z"), endsAt: new Date("2026-11-15T04:30:00Z") })).toBe("Sat, Nov 14");
  });
});
