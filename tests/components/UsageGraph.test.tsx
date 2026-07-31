import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { UsageGraph, bucketValues, buildAxisLine } from "../../src/components/UsageGraph.js";
import type { V1Pod } from "@kubernetes/client-node";

function makePod(cpuRequest?: string, memRequest?: string): V1Pod {
  return {
    metadata: { name: "demo-pod", namespace: "default" },
    spec: {
      containers: [
        {
          name: "main",
          resources: cpuRequest || memRequest ? { requests: { cpu: cpuRequest, memory: memRequest } } : undefined,
        },
      ],
    },
  } as unknown as V1Pod;
}

describe("bucketValues", () => {
  it("right-aligns a series shorter than the target width, padding with nulls", () => {
    const out = bucketValues([1, 2, 3], 5);
    expect(out).toEqual([null, null, 1, 2, 3]);
  });

  it("returns all nulls for an empty series", () => {
    expect(bucketValues([], 4)).toEqual([null, null, null, null]);
  });

  it("passes a series matching the width straight through", () => {
    expect(bucketValues([1, 2, 3], 3)).toEqual([1, 2, 3]);
  });

  it("averages a longer series down to the target width", () => {
    // 6 samples -> 3 buckets of 2: [1,2]->1.5, [3,4]->3.5, [5,6]->5.5
    const out = bucketValues([1, 2, 3, 4, 5, 6], 3);
    expect(out).toEqual([1.5, 3.5, 5.5]);
  });
});

describe("buildAxisLine", () => {
  it("labels the rightmost column as 'now'", () => {
    const line = buildAxisLine(20, 15_000);
    expect(line.trim().endsWith("now")).toBe(true);
  });

  it("leaves the unpopulated left portion blank when history is still short", () => {
    const line = buildAxisLine(2, 15_000); // far fewer samples than the 20-column width
    // Only the last couple of columns can have real data/labels.
    expect(line.slice(0, 10).trim()).toBe("");
  });

  it("reflects a longer span once history exceeds the display width", () => {
    const line = buildAxisLine(240, 15_000); // 1 hour of samples at the default poll interval
    expect(line).toMatch(/-\d+m/);
  });

  it("does not clip the leftmost tick's label (regression: used to render as just 'm')", () => {
    const line = buildAxisLine(20, 15_000);
    expect(line.trim().startsWith("-5m")).toBe(true);
  });
});

describe("UsageGraph", () => {
  it("shows a waiting message with fewer than 2 samples", () => {
    const { lastFrame } = render(
      <UsageGraph pod={makePod()} history={{ cpu: [100], mem: [] }} onClose={() => {}} />,
    );
    expect(lastFrame()).toContain("Not enough samples yet");
  });

  it("renders CPU/MEM sections once there's enough history", () => {
    const { lastFrame } = render(
      <UsageGraph
        pod={makePod("500m", "512Mi")}
        history={{ cpu: [100, 150, 120], mem: [1e8, 1.2e8, 1.1e8] }}
        onClose={() => {}}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("CPU");
    expect(frame).toContain("MEM");
    expect(frame).toContain("Usage History — demo-pod");
  });

  it("notes when there's no resource request to compare against", () => {
    const { lastFrame } = render(
      <UsageGraph pod={makePod()} history={{ cpu: [100, 150, 120], mem: [] }} onClose={() => {}} />,
    );
    expect(lastFrame()).toContain("No resource requests set");
  });
});
