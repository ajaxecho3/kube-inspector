import { describe, it, expect } from "vitest";
import {
  podHealth,
  deploymentHealth,
  nodeHealth,
  HealthStatus,
} from "../../src/utils/health.js";

describe("podHealth", () => {
  it("returns healthy for Running phase", () => {
    expect(podHealth({ status: { phase: "Running" } } as any)).toBe(
      HealthStatus.Healthy,
    );
  });

  it("returns critical for CrashLoopBackOff", () => {
    const pod = {
      status: {
        phase: "Running",
        containerStatuses: [
          { state: { waiting: { reason: "CrashLoopBackOff" } } },
        ],
      },
    };
    expect(podHealth(pod as any)).toBe(HealthStatus.Critical);
  });

  it("returns critical for Failed phase", () => {
    expect(podHealth({ status: { phase: "Failed" } } as any)).toBe(
      HealthStatus.Critical,
    );
  });

  it("returns degraded for Pending phase", () => {
    expect(podHealth({ status: { phase: "Pending" } } as any)).toBe(
      HealthStatus.Degraded,
    );
  });
});

describe("deploymentHealth", () => {
  it("returns healthy when availableReplicas equals replicas", () => {
    const d = { status: { replicas: 3, availableReplicas: 3 } };
    expect(deploymentHealth(d as any)).toBe(HealthStatus.Healthy);
  });

  it("returns degraded when availableReplicas less than replicas", () => {
    const d = { status: { replicas: 3, availableReplicas: 1 } };
    expect(deploymentHealth(d as any)).toBe(HealthStatus.Degraded);
  });

  it("returns critical when availableReplicas is 0", () => {
    const d = { status: { replicas: 3, availableReplicas: 0 } };
    expect(deploymentHealth(d as any)).toBe(HealthStatus.Critical);
  });
});

describe("nodeHealth", () => {
  it("returns healthy when Ready condition is True", () => {
    const node = {
      status: {
        conditions: [{ type: "Ready", status: "True" }],
      },
    };
    expect(nodeHealth(node as any)).toBe(HealthStatus.Healthy);
  });

  it("returns critical when Ready condition is False", () => {
    const node = {
      status: {
        conditions: [{ type: "Ready", status: "False" }],
      },
    };
    expect(nodeHealth(node as any)).toBe(HealthStatus.Critical);
  });
});
