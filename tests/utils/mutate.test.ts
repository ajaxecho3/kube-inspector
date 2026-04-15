import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/promises BEFORE importing mutate
vi.mock("node:fs/promises", () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

describe("mutate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("calls deleteNamespacedPod and writes audit log on delete pod", async () => {
    const { appendFile } = await import("node:fs/promises");
    const { mutate, MutationAction } =
      await import("../../src/utils/mutate.js");

    const mockClient = {
      deleteNamespacedPod: vi.fn().mockResolvedValue({}),
    } as any;

    await mutate(mockClient, {
      action: MutationAction.DeletePod,
      name: "bad-pod",
      namespace: "staging",
    });

    expect(mockClient.deleteNamespacedPod).toHaveBeenCalledWith(
      "bad-pod",
      "staging",
    );
    expect(appendFile).toHaveBeenCalled();
    const auditEntry = (appendFile as any).mock.calls[0][1] as string;
    expect(auditEntry).toContain("bad-pod");
    expect(auditEntry).toContain("staging");
    expect(auditEntry).toContain(MutationAction.DeletePod);
  });

  it("still appends audit log with FAILED when k8s call fails", async () => {
    const { appendFile } = await import("node:fs/promises");
    const { mutate, MutationAction } =
      await import("../../src/utils/mutate.js");

    const mockClient = {
      deleteNamespacedPod: vi.fn().mockRejectedValue(new Error("forbidden")),
    } as any;

    await expect(
      mutate(mockClient, {
        action: MutationAction.DeletePod,
        name: "bad-pod",
        namespace: "staging",
      }),
    ).rejects.toThrow("forbidden");

    expect(appendFile).toHaveBeenCalled();
    const auditEntry = (appendFile as any).mock.calls[0][1] as string;
    expect(auditEntry).toContain("FAILED");
  });

  it("rejects scale above max replicas without calling k8s", async () => {
    vi.mocked(await import("node:fs/promises")).appendFile;
    const { mutate, MutationAction } =
      await import("../../src/utils/mutate.js");

    const mockClient = { patchNamespacedDeploymentScale: vi.fn() } as any;

    await expect(
      mutate(mockClient, {
        action: MutationAction.ScaleDeployment,
        name: "my-deploy",
        namespace: "default",
        replicas: 999,
        maxReplicas: 20,
      }),
    ).rejects.toThrow("exceeds maximum");

    expect(mockClient.patchNamespacedDeploymentScale).not.toHaveBeenCalled();
  });

  it("rejects mutations on kube-system namespace without calling k8s", async () => {
    const { mutate, MutationAction } =
      await import("../../src/utils/mutate.js");

    const mockClient = { deleteNamespacedPod: vi.fn() } as any;

    await expect(
      mutate(mockClient, {
        action: MutationAction.DeletePod,
        name: "core-dns",
        namespace: "kube-system",
      }),
    ).rejects.toThrow("immutable");

    expect(mockClient.deleteNamespacedPod).not.toHaveBeenCalled();
  });
});
