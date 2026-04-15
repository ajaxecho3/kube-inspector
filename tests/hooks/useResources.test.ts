// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { mockAbort, mockWatch } = vi.hoisted(() => ({
  mockAbort: vi.fn(),
  mockWatch: vi.fn(),
}));

vi.mock("@kubernetes/client-node", () => ({
  Watch: vi.fn().mockImplementation(function () {
    return { watch: mockWatch };
  }),
  KubeConfig: vi.fn().mockImplementation(function () {
    return {
      loadFromDefault: vi.fn(),
      getCurrentContext: vi.fn(() => "test-context"),
      getContexts: vi.fn(() => []),
      makeApiClient: vi.fn(),
    };
  }),
}));

import { useResources } from "../../src/hooks/useResources.js";

describe("useResources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWatch.mockResolvedValue({ abort: mockAbort });
  });

  it("starts with an empty map", () => {
    const kc = {} as any;
    const { result } = renderHook(() =>
      useResources(kc, "/api/v1/pods", { namespaced: true }),
    );
    expect(result.current.resources.size).toBe(0);
    expect(result.current.error).toBeNull();
  });

  it("adds a resource on ADDED event", async () => {
    const kc = {} as any;
    mockWatch.mockImplementation(
      (_path: string, _params: any, callback: Function) => {
        callback("ADDED", { metadata: { uid: "uid-1", name: "pod-1" } });
        return Promise.resolve({ abort: mockAbort });
      },
    );

    const { result } = renderHook(() =>
      useResources(kc, "/api/v1/pods", { namespaced: true }),
    );

    await waitFor(() => {
      expect(result.current.resources.get("uid-1")).toBeDefined();
    });
  });

  it("removes a resource on DELETED event", async () => {
    const kc = {} as any;
    let capturedCallback!: Function;
    mockWatch.mockImplementation(
      (_path: string, _params: any, callback: Function) => {
        capturedCallback = callback;
        callback("ADDED", { metadata: { uid: "uid-1", name: "pod-1" } });
        return Promise.resolve({ abort: mockAbort });
      },
    );

    const { result } = renderHook(() =>
      useResources(kc, "/api/v1/pods", { namespaced: true }),
    );

    await waitFor(() => {
      expect(result.current.resources.size).toBe(1);
    });

    await act(async () => {
      capturedCallback("DELETED", {
        metadata: { uid: "uid-1", name: "pod-1" },
      });
    });

    expect(result.current.resources.size).toBe(0);
  });
});
