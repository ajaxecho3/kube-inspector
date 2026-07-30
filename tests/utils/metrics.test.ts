import { describe, it, expect } from "vitest";
import {
  parseCpuToMillicores,
  parseMemoryToBytes,
  formatCpu,
  formatMemBytes,
  usageColor,
} from "../../src/utils/metrics";

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
