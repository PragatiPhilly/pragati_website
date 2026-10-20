import { describe, expect, it } from "vitest";
import { resolveTheme } from "../src/lib/theme";

describe("site theme (spec/17-kali-theme.md)", () => {
  it("auto / blank follows the active event", () => {
    expect(resolveTheme("auto", "kali")).toBe("kali");
    expect(resolveTheme("", "saraswati")).toBe("saraswati");
    expect(resolveTheme(undefined, "durga")).toBe("durga");
  });
  it("a forced theme wins over the event", () => {
    expect(resolveTheme("kali", "durga")).toBe("kali");
    expect(resolveTheme(" KALI ", "durga")).toBe("kali");
    expect(resolveTheme("durga", "kali")).toBe("durga");
  });
  it("falls back to Durga for no event, 'none', or a typo", () => {
    expect(resolveTheme("auto", null)).toBe("durga");
    expect(resolveTheme("auto", "none")).toBe("durga");
    expect(resolveTheme("kaali", "none")).toBe("durga");
  });
});
