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

  it("shows queue count when queueLength > 1", () => {
    const { lastFrame } = render(
      <AlertBanner
        message="pod crashed"
        onDismiss={() => {}}
        queueLength={3}
      />,
    );
    expect(lastFrame()).toContain("+2 more");
  });

  it("does not show queue count when queueLength is 1", () => {
    const { lastFrame } = render(
      <AlertBanner
        message="pod crashed"
        onDismiss={() => {}}
        queueLength={1}
      />,
    );
    expect(lastFrame()).not.toContain("more");
  });
});
