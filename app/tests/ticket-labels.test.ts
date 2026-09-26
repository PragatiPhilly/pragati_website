import { describe, it, expect } from "vitest";
import { dayLabel, fmtClock, foodLabel, ticketDetail } from "../src/lib/ticket-labels";

const days = [
  { key: "fri", label: "Friday, Oct 9" },
  { key: "sat", label: "Saturday, Oct 10" },
];

describe("ticket labels", () => {
  it("formats clock times and ignores bad values", () => {
    expect(fmtClock("18:00")).toBe("6:00 PM");
    expect(fmtClock("09:30")).toBe("9:30 AM");
    expect(fmtClock(null)).toBeNull();
    expect(fmtClock("nonsense")).toBeNull();
  });

  it("names food and days in plain English", () => {
    expect(foodLabel("non_veg")).toBe("Non-veg meal");
    expect(foodLabel("kid")).toBe("Kid's meal");
    expect(foodLabel("none")).toBe("No meal");
    expect(foodLabel(null)).toBe("No meal");
    expect(dayLabel("sat", days)).toBe("Saturday, Oct 10");
    expect(dayLabel("all", days)).toBe("All days");
    expect(dayLabel("sun", days)).toBe("SUN");
  });

  it("says a concert ticket has no meal and when entry opens", () => {
    expect(ticketDetail({ dayKey: "sat", foodPref: "none" }, { ageBand: "concert", checkInStart: "18:00" }, days)).toBe(
      "Saturday, Oct 10 · 🎶 Concert · no meal · entry from 6:00 PM",
    );
    expect(ticketDetail({ dayKey: "all", foodPref: "veg" }, { ageBand: "adult", checkInStart: null }, days)).toBe("All days · Veg meal");
  });
});
