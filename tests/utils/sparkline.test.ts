import { describe, it, expect } from "vitest";
import { sparkline, charForRatio } from "../../src/utils/sparkline";

describe("sparkline", () => {
  it("returns a placeholder for an empty series", () => {
    expect(sparkline([])).toBe("no data");
  });

  it("renders one character per value", () => {
    expect(sparkline([1, 2, 3]).length).toBe(3);
  });

  it("scales the tallest bar to the max in the series", () => {
    const result = sparkline([0, 5, 10]);
    // last value is the max of the series, so it should render as the tallest block
    expect(result.at(-1)).toBe("█");
  });

  it("renders the lowest block for an all-zero series", () => {
    expect(sparkline([0, 0, 0])).toBe("▁▁▁");
  });

  it("is stable for a flat non-zero series", () => {
    expect(sparkline([5, 5, 5])).toBe("███");
  });
});

describe("charForRatio", () => {
  it("returns the lowest block at ratio 0", () => {
    expect(charForRatio(0)).toBe("▁");
  });

  it("returns the tallest block at ratio 1", () => {
    expect(charForRatio(1)).toBe("█");
  });

  it("clamps out-of-range ratios", () => {
    expect(charForRatio(-1)).toBe(charForRatio(0));
    expect(charForRatio(2)).toBe(charForRatio(1));
  });

  it("is monotonic across the 0..1 range", () => {
    const chars = "▁▂▃▄▅▆▇█";
    let lastIndex = -1;
    for (let i = 0; i <= 10; i++) {
      const idx = chars.indexOf(charForRatio(i / 10));
      expect(idx).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = idx;
    }
  });
});
