import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { PUJO_MENU, plateFor, starOf, menuMatchesEvent, menuOnHomepage, photoCredits } from "../src/lib/pujo-menu";

const pub = path.resolve(__dirname, "../public");

describe("Pujo menu data", () => {
  it("has the five meals from the poster, in order", () => {
    expect(PUJO_MENU.meals.map((m) => m.id)).toEqual(["fri-dinner", "sat-lunch", "sat-dinner", "sun-lunch", "sun-dinner"]);
  });

  it("never puts a non-veg dish on a veg plate, or a veg-only dish on a non-veg plate", () => {
    for (const m of PUJO_MENU.meals)
      for (const kids of [false, true]) {
        expect(plateFor(m, true, kids).some((d) => d.plate === "nv")).toBe(false);
        expect(plateFor(m, false, kids).some((d) => d.plate === "veg")).toBe(false);
      }
  });

  it("gives every plate a centre dish that is on that plate", () => {
    for (const m of PUJO_MENU.meals)
      for (const veg of [false, true])
        for (const kids of [false, true]) {
          const list = plateFor(m, veg, kids);
          expect(list.length).toBeGreaterThan(0);
          expect(list).toContain(starOf(list));
        }
  });

  it("has a photo file and a credit for every dish, and the poster file", () => {
    const slugs = new Set(PUJO_MENU.meals.flatMap((m) => [...m.adults, ...m.kids].map((d) => d.slug)));
    for (const s of slugs) {
      expect(fs.existsSync(path.join(pub, "menu/dishes", `${s}.webp`)), s).toBe(true);
      expect(photoCredits[s], s).toBeDefined();
    }
    expect(fs.existsSync(path.join(pub, PUJO_MENU.poster))).toBe(true);
  });
});

describe("where the menu shows", () => {
  const pujo = { theme: "durga", startsAt: new Date("2026-10-09T16:00:00-04:00") };

  it("matches only Durga Pujo 2026", () => {
    expect(menuMatchesEvent(pujo)).toBe(true);
    expect(menuMatchesEvent({ ...pujo, theme: "kali" })).toBe(false);
    expect(menuMatchesEvent({ ...pujo, startsAt: new Date("2027-10-01T16:00:00-04:00") })).toBe(false);
    expect(menuMatchesEvent(null)).toBe(false);
  });

  it("leaves the homepage after the last day (Philadelphia time)", () => {
    expect(menuOnHomepage(pujo, new Date("2026-09-25T12:00:00-04:00"))).toBe(true);
    expect(menuOnHomepage(pujo, new Date("2026-10-11T23:30:00-04:00"))).toBe(true);
    expect(menuOnHomepage(pujo, new Date("2026-10-12T00:30:00-04:00"))).toBe(false);
  });
});
