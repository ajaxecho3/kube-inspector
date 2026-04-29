import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { NavTabs, TAB_LABELS } from "../../src/components/NavTabs";

describe("NavTabs", () => {
  it("renders all tab labels", () => {
    const { lastFrame } = render(
      <NavTabs activeTab={0} onTabChange={() => {}} />,
    );
    const frame = lastFrame();
    for (const label of TAB_LABELS) {
      expect(frame).toContain(label);
    }
  });

  it("marks the active tab", () => {
    const { lastFrame } = render(
      <NavTabs activeTab={0} onTabChange={() => {}} />,
    );
    expect(lastFrame()).toContain(TAB_LABELS[0]);
  });

  it("shows resource count when tabSummaries provided", () => {
    const summaries = TAB_LABELS.map((_, i) => ({ total: i + 1, critical: 0 }));
    const { lastFrame } = render(
      <NavTabs activeTab={0} onTabChange={() => {}} tabSummaries={summaries} />,
    );
    expect(lastFrame()).toContain("(1)");
    expect(lastFrame()).toContain("(2)");
  });

  it("shows critical badge when critical count > 0", () => {
    const summaries = TAB_LABELS.map(() => ({ total: 5, critical: 0 }));
    summaries[0] = { total: 5, critical: 3 };
    const { lastFrame } = render(
      <NavTabs activeTab={0} onTabChange={() => {}} tabSummaries={summaries} />,
    );
    expect(lastFrame()).toContain("⚠3");
  });

  it("omits critical badge when critical count is 0", () => {
    const summaries = TAB_LABELS.map(() => ({ total: 5, critical: 0 }));
    const { lastFrame } = render(
      <NavTabs activeTab={0} onTabChange={() => {}} tabSummaries={summaries} />,
    );
    expect(lastFrame()).not.toContain("⚠");
  });

  it("renders without tabSummaries (backward compatible)", () => {
    const { lastFrame } = render(
      <NavTabs activeTab={0} onTabChange={() => {}} />,
    );
    expect(lastFrame()).not.toContain("(");
  });
});
