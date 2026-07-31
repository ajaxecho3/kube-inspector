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

    expect(mockClient.deleteNamespacedPod).toHaveBeenCalledWith({
      name: "bad-pod",
      namespace: "staging",
    });
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

  it("force-deletes a pod with gracePeriodSeconds: 0, object-param style", async () => {
    const { mutate, MutationAction } =
      await import("../../src/utils/mutate.js");

    const mockClient = {
      deleteNamespacedPod: vi.fn().mockResolvedValue({}),
    } as any;

    await mutate(mockClient, {
      action: MutationAction.ForceDeletePod,
      name: "stuck-pod",
      namespace: "staging",
    });

    expect(mockClient.deleteNamespacedPod).toHaveBeenCalledWith({
      name: "stuck-pod",
      namespace: "staging",
      gracePeriodSeconds: 0,
    });
  });

  it("deletes a deployment and a service with object-param style", async () => {
    const { mutate, MutationAction } =
      await import("../../src/utils/mutate.js");

    const mockDeploy = { deleteNamespacedDeployment: vi.fn().mockResolvedValue({}) } as any;
    await mutate(mockDeploy, {
      action: MutationAction.DeleteDeployment,
      name: "api",
      namespace: "default",
    });
    expect(mockDeploy.deleteNamespacedDeployment).toHaveBeenCalledWith({
      name: "api",
      namespace: "default",
    });

    const mockSvc = { deleteNamespacedService: vi.fn().mockResolvedValue({}) } as any;
    await mutate(mockSvc, {
      action: MutationAction.DeleteService,
      name: "api-svc",
      namespace: "default",
    });
    expect(mockSvc.deleteNamespacedService).toHaveBeenCalledWith({
      name: "api-svc",
      namespace: "default",
    });
  });

  it("restarts a deployment via a merge-patch, object-param style", async () => {
    const { mutate, MutationAction } =
      await import("../../src/utils/mutate.js");

    const mockClient = {
      patchNamespacedDeployment: vi.fn().mockResolvedValue({}),
    } as any;

    await mutate(mockClient, {
      action: MutationAction.RestartDeployment,
      name: "api",
      namespace: "default",
    });

    expect(mockClient.patchNamespacedDeployment).toHaveBeenCalledTimes(1);
    const [param, options] = mockClient.patchNamespacedDeployment.mock.calls[0];
    expect(param.name).toBe("api");
    expect(param.namespace).toBe("default");
    expect(param.body.spec.template.metadata.annotations).toHaveProperty(
      "kubectl.kubernetes.io/restartedAt",
    );
    // Forces merge-patch semantics rather than the client's default
    // (JSON-Patch) content-type negotiation — see mutate.ts for why.
    expect(options.middlewareMergeStrategy).toBe("append");
    expect(options.middleware).toHaveLength(1);
  });

  it("rolls back a deployment to the target revision's template, object-param style", async () => {
    const { mutate, MutationAction } =
      await import("../../src/utils/mutate.js");

    const mockClient = {
      patchNamespacedDeployment: vi.fn().mockResolvedValue({}),
    } as any;

    const templateSpec = { containers: [{ name: "app", image: "app:v1" }] };
    await mutate(mockClient, {
      action: MutationAction.RollbackDeployment,
      name: "api",
      namespace: "default",
      templateSpec,
      revision: 3,
    });

    const [param] = mockClient.patchNamespacedDeployment.mock.calls[0];
    expect(param).toEqual({
      name: "api",
      namespace: "default",
      body: { spec: { template: { spec: templateSpec } } },
    });
  });

  it("scales a deployment via object-param style", async () => {
    const { mutate, MutationAction } =
      await import("../../src/utils/mutate.js");

    const mockClient = {
      patchNamespacedDeploymentScale: vi.fn().mockResolvedValue({}),
    } as any;

    await mutate(mockClient, {
      action: MutationAction.ScaleDeployment,
      name: "api",
      namespace: "default",
      replicas: 5,
    });

    const [param] = mockClient.patchNamespacedDeploymentScale.mock.calls[0];
    expect(param).toEqual({
      name: "api",
      namespace: "default",
      body: { spec: { replicas: 5 } },
    });
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
