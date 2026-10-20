import { describe, expect, it } from "vitest";
import {
  buildRecap,
  eventHasEnded,
  isPostEvent,
  parsePostEventMode,
  parseStat,
} from "../src/lib/season-model";

// Durga Pujo 2026 as it is in production: ends Sun Oct 11, 7:20 PM New York.
const durga = {
  name: "Durga Pujo 2026",
  nameBengali: "দুর্গা পূজা ২০২৬",
  theme: "durga",
  endsAt: new Date("2026-10-11T23:20:00Z"),
};
const during = new Date("2026-10-10T18:00:00Z");
const after = new Date("2026-10-19T12:00:00Z");

describe("thank-you mode (spec/16-post-event-mode.md)", () => {
  it("reads the mode leniently and defaults to auto", () => {
    expect(parsePostEventMode("on")).toBe("on");
    expect(parsePostEventMode(" OFF ")).toBe("off");
    expect(parsePostEventMode("auto")).toBe("auto");
    expect(parsePostEventMode("")).toBe("auto");
    expect(parsePostEventMode(undefined)).toBe("auto");
    expect(parsePostEventMode("yes")).toBe("auto");
  });

  it("an event has ended only once its end time is in the past", () => {
    expect(eventHasEnded(durga, during)).toBe(false);
    expect(eventHasEnded(durga, new Date("2026-10-11T23:20:00Z"))).toBe(true);
    expect(eventHasEnded(durga, after)).toBe(true);
    expect(eventHasEnded(null, after)).toBe(false);
    expect(eventHasEnded({ endsAt: "2026-10-11T23:20:00Z" }, after)).toBe(true);
  });

  it("auto follows the end time; on/off force it", () => {
    expect(isPostEvent("auto", durga, during)).toBe(false);
    expect(isPostEvent("auto", durga, after)).toBe(true);
    expect(isPostEvent("on", durga, during)).toBe(true);
    expect(isPostEvent("off", durga, after)).toBe(false);
    // no event at all → never thank-you mode
    expect(isPostEvent("on", null, after)).toBe(false);
  });

  it("auto switches itself off when the next (unfinished) event is made active", () => {
    const kali = { endsAt: new Date("2026-11-08T05:00:00Z") };
    expect(isPostEvent("auto", kali, after)).toBe(false);
  });

  it("parses stat values for the count-up, leaving anything odd as text", () => {
    expect(parseStat("650+", "Passes")).toMatchObject({ n: 650, suffix: "+", prefix: "" });
    expect(parseStat("3", "Days")).toMatchObject({ n: 3, suffix: "" });
    expect(parseStat("1,200+", "Guests")).toMatchObject({ n: 1200, suffix: "+" });
    expect(parseStat("$5,000", "Raised")).toMatchObject({ n: 5000, prefix: "$" });
    expect(parseStat("2k", "x")).toMatchObject({ n: null, text: "2k" });
    expect(parseStat("Sold out", "x")).toMatchObject({ n: null, text: "Sold out" });
  });

  it("builds the card: blank title/Bengali fall back to the event name; blank numbers hide", () => {
    const r = buildRecap(
      {
        recap_title: "",
        recap_title_bn: "",
        recap_message: "Thank you!",
        recap_stat_1_value: "3",
        recap_stat_1_label: "Days of Pujo",
        recap_stat_2_value: "",
        recap_stat_2_label: "Hidden",
        recap_stat_3_value: "650+",
        recap_stat_3_label: "Passes issued",
      },
      durga,
    );
    expect(r.title).toBe("Durga Pujo 2026 — thank you!");
    expect(r.titleBn).toBe("দুর্গা পূজা ২০২৬ সুসম্পন্ন");
    expect(r.kicker).toMatch(/Pujo complete/);
    expect(r.stats.map((s) => s.label)).toEqual(["Days of Pujo", "Passes issued"]);
    expect(r.message).toBe("Thank you!");
  });

  it("uses the EC's own title when one is set", () => {
    const r = buildRecap({ recap_title: "Durga Pujo 2026 — a grand success", recap_title_bn: "শুভ বিজয়া" }, durga);
    expect(r.title).toBe("Durga Pujo 2026 — a grand success");
    expect(r.titleBn).toBe("শুভ বিজয়া");
  });
});
