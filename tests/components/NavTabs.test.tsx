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
});
