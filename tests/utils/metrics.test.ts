import { describe, it, expect } from "vitest";
import {
  parseCpuToMillicores,
  parseMemoryToBytes,
  formatCpu,
  formatMemBytes,
  usageColor,
  brighten,
  usageSpark,
} from "../../src/utils/metrics.js";

describe("parseCpuToMillicores", () => {
  it("parses nanocores", () => {
    expect(parseCpuToMillicores("123456789n")).toBeCloseTo(123.456789, 3);
  });

  it("parses microcores", () => {
    expect(parseCpuToMillicores("45000u")).toBeCloseTo(45, 3);
  });

  it("parses millicores", () => {
    expect(parseCpuToMillicores("250m")).toBe(250);
  });

  it("parses bare cores", () => {
    expect(parseCpuToMillicores("2")).toBe(2000);
  });

  it("returns null for undefined or malformed input", () => {
    expect(parseCpuToMillicores(undefined)).toBeNull();
    expect(parseCpuToMillicores("not-a-number")).toBeNull();
  });
});

describe("parseMemoryToBytes", () => {
  it("parses binary suffixes", () => {
    expect(parseMemoryToBytes("1Ki")).toBe(1024);
    expect(parseMemoryToBytes("1Mi")).toBe(1024 ** 2);
    expect(parseMemoryToBytes("1Gi")).toBe(1024 ** 3);
  });

  it("parses decimal suffixes", () => {
    expect(parseMemoryToBytes("1K")).toBe(1000);
    expect(parseMemoryToBytes("1M")).toBe(1000 ** 2);
  });

  it("parses bare byte counts", () => {
    expect(parseMemoryToBytes("512")).toBe(512);
  });

  it("returns null for undefined or malformed input", () => {
    expect(parseMemoryToBytes(undefined)).toBeNull();
    expect(parseMemoryToBytes("garbage")).toBeNull();
  });
});

describe("formatCpu", () => {
  it("formats sub-core usage in millicores", () => {
    expect(formatCpu(45)).toBe("45m");
  });

  it("formats core-scale usage as decimal cores", () => {
    expect(formatCpu(1500)).toBe("1.50");
  });

  it("returns a placeholder for missing data", () => {
    expect(formatCpu(null)).toBe("–");
    expect(formatCpu(undefined)).toBe("–");
  });
});

describe("formatMemBytes", () => {
  it("formats bytes using binary units", () => {
    expect(formatMemBytes(1024 ** 2)).toBe("1 MiB");
  });

  it("returns a placeholder for missing data", () => {
    expect(formatMemBytes(null)).toBe("–");
  });
});

describe("usageColor", () => {
  it("returns green below 60%", () => {
    expect(usageColor(30)).toBe("green");
  });

  it("returns yellow between 60% and 85%", () => {
    expect(usageColor(70)).toBe("yellow");
  });

  it("returns red at or above 85%", () => {
    expect(usageColor(90)).toBe("red");
  });

  it("returns undefined when percent is unknown", () => {
    expect(usageColor(null)).toBeUndefined();
    expect(usageColor(undefined)).toBeUndefined();
  });
});

describe("brighten", () => {
  it("appends Bright to a resolved color name", () => {
    expect(brighten("green")).toBe("greenBright");
    expect(brighten("yellow")).toBe("yellowBright");
    expect(brighten("red")).toBe("redBright");
  });

  it("returns undefined when there is no color to brighten", () => {
    expect(brighten(undefined)).toBeUndefined();
  });
});

describe("usageSpark", () => {
  it("returns undefined with fewer than 2 samples", () => {
    expect(usageSpark(undefined, 1000)).toBeUndefined();
    expect(usageSpark([500], 1000)).toBeUndefined();
  });

  it("colors a flat series near its request as a steady, non-orange trend", () => {
    // Regression guard: a stable series must NOT render as "maxed out" just
    // because it's flat — every bar should reflect its real (low) percent.
    const segs = usageSpark([50, 52, 48, 51, 50], 1000)!;
    expect(segs.every((s) => s.color === "green")).toBe(true);
  });

  it("colors each bar by its own percent of the reference total", () => {
    const segs = usageSpark([100, 700, 950], 1000)!;
    expect(segs[0].color).toBe("green"); // 10%
    expect(segs[1].color).toBe("yellow"); // 70%
    expect(segs[2].color).toBe("red"); // 95%
  });

  it("falls back to an uncolored window-relative trend with no reference total", () => {
    const segs = usageSpark([1, 5, 10], 0)!;
    expect(segs.every((s) => s.color === undefined)).toBe(true);
    expect(segs.at(-1)!.char).toBe("█");
  });
});
