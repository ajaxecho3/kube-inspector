// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAlerts } from "../../src/hooks/useAlerts.js";
import { HealthStatus } from "../../src/utils/health.js";

describe("useAlerts", () => {
  it("emits no alerts for empty resources", () => {
    const getHealth = vi.fn().mockReturnValue(HealthStatus.Healthy);
    const { result } = renderHook(() => useAlerts(new Map(), getHealth));
    expect(result.current.alerts).toHaveLength(0);
  });

  it("emits alert when resource transitions to critical", () => {
    const pod = {
      metadata: { uid: "uid-1", name: "bad-pod", namespace: "staging" },
    };
    const getHealth = vi.fn().mockReturnValue(HealthStatus.Critical);

    const { result, rerender } = renderHook(
      ({ resources }: { resources: Map<string, any> }) =>
        useAlerts(resources, getHealth),
      { initialProps: { resources: new Map<string, any>() } },
    );

    act(() => {
      rerender({ resources: new Map([["uid-1", pod]]) });
    });

    expect(result.current.alerts.length).toBeGreaterThan(0);
    expect(result.current.alerts[0].resourceName).toBe("bad-pod");
  });

  it("dismissing an alert removes it", () => {
    const pod = {
      metadata: { uid: "uid-1", name: "bad-pod", namespace: "staging" },
    };
    const getHealth = vi.fn().mockReturnValue(HealthStatus.Critical);

    const { result, rerender } = renderHook(
      ({ resources }: { resources: Map<string, any> }) =>
        useAlerts(resources, getHealth),
      { initialProps: { resources: new Map<string, any>() } },
    );

    act(() => {
      rerender({ resources: new Map([["uid-1", pod]]) });
    });

    const alertId = result.current.alerts[0]?.id;
    act(() => {
      result.current.dismiss(alertId);
    });

    expect(result.current.alerts).toHaveLength(0);
  });
});
