import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { formatAge } from "../../src/utils/format";

describe("formatAge", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats seconds", () => {
    const d = new Date("2026-04-14T11:59:30Z");
    expect(formatAge(d)).toBe("30s");
  });

  it("formats minutes", () => {
    const d = new Date("2026-04-14T11:55:00Z");
    expect(formatAge(d)).toBe("5m");
  });

  it("formats hours", () => {
    const d = new Date("2026-04-14T10:00:00Z");
    expect(formatAge(d)).toBe("2h");
  });

  it("formats days", () => {
    const d = new Date("2026-04-12T12:00:00Z");
    expect(formatAge(d)).toBe("2d");
  });

  it("returns unknown for undefined", () => {
    expect(formatAge(undefined)).toBe("?");
  });
});
