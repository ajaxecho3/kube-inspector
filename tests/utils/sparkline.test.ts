import { describe, it, expect } from "vitest";
import { sparkline } from "../../src/utils/sparkline";

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
