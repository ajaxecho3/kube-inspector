import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { AlertBanner } from "../../src/components/AlertBanner";

describe("AlertBanner", () => {
  it("renders the alert message", () => {
    const { lastFrame } = render(
      <AlertBanner
        message="bad-pod is CrashLoopBackOff"
        onDismiss={() => {}}
      />,
    );
    expect(lastFrame()).toContain("bad-pod is CrashLoopBackOff");
  });

  it("renders dismiss hint", () => {
    const { lastFrame } = render(
      <AlertBanner message="something bad" onDismiss={() => {}} />,
    );
    expect(lastFrame()).toContain("Esc");
  });
});
