import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "ink-testing-library";
import { StatusBadge } from "../../src/components/StatusBadge";
import { HealthStatus } from "../../src/utils/health";

describe("StatusBadge", () => {
  it("renders a dot for healthy status", () => {
    const { lastFrame } = render(<StatusBadge status={HealthStatus.Healthy} />);
    expect(lastFrame()).toContain("●");
  });

  it("renders a dot for degraded status", () => {
    const { lastFrame } = render(
      <StatusBadge status={HealthStatus.Degraded} />,
    );
    expect(lastFrame()).toContain("●");
  });

  it("renders a dot for critical status", () => {
    const { lastFrame } = render(
      <StatusBadge status={HealthStatus.Critical} />,
    );
    expect(lastFrame()).toContain("●");
  });
});
