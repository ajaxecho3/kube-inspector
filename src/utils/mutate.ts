import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export enum MutationAction {
  DeletePod = "DeletePod",
  DeleteDeployment = "DeleteDeployment",
  DeleteService = "DeleteService",
  RestartDeployment = "RestartDeployment",
  ScaleDeployment = "ScaleDeployment",
  ForceDeletePod = "ForceDeletePod",
  RollbackDeployment = "RollbackDeployment",
}

const IMMUTABLE_NAMESPACES = new Set(["kube-system"]);
const AUDIT_LOG_PATH = path.join(os.homedir(), ".kube-inspector", "audit.log");

export type MutateParams =
  | {
      action: MutationAction.DeletePod | MutationAction.ForceDeletePod;
      name: string;
      namespace: string;
    }
  | {
      action:
        | MutationAction.DeleteDeployment
        | MutationAction.DeleteService
        | MutationAction.RestartDeployment;
      name: string;
      namespace: string;
    }
  | {
      action: MutationAction.ScaleDeployment;
      name: string;
      namespace: string;
      replicas: number;
      maxReplicas?: number;
    }
  | {
      action: MutationAction.RollbackDeployment;
      name: string;
      namespace: string;
      /** Pod template spec from the target ReplicaSet to restore */
      templateSpec: Record<string, unknown>;
      revision: number;
    };

async function appendAudit(entry: Record<string, unknown>): Promise<void> {
  await fs.mkdir(path.dirname(AUDIT_LOG_PATH), { recursive: true });
  const line =
    JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n";
  await fs.appendFile(AUDIT_LOG_PATH, line, "utf-8");
}

export async function mutate(client: any, params: MutateParams): Promise<void> {
  if (IMMUTABLE_NAMESPACES.has(params.namespace)) {
    throw new Error(
      `Namespace "${params.namespace}" is immutable — mutations are not allowed`,
    );
  }

  if (params.action === MutationAction.ScaleDeployment) {
    const max = params.maxReplicas ?? 20;
    if (params.replicas > max) {
      throw new Error(
        `Replica count ${params.replicas} exceeds maximum allowed (${max})`,
      );
    }
  }

  const auditBase = {
    action: params.action,
    name: params.name,
    namespace: params.namespace,
  };

  try {
    switch (params.action) {
      case MutationAction.DeletePod:
        await client.deleteNamespacedPod(params.name, params.namespace);
        break;
      case MutationAction.ForceDeletePod:
        await client.deleteNamespacedPod(
          params.name,
          params.namespace,
          undefined,
          undefined,
          0,
        );
        break;
      case MutationAction.DeleteDeployment:
        await client.deleteNamespacedDeployment(params.name, params.namespace);
        break;
      case MutationAction.DeleteService:
        await client.deleteNamespacedService(params.name, params.namespace);
        break;
      case MutationAction.RestartDeployment: {
        const now = new Date().toISOString();
        await client.patchNamespacedDeployment(
          params.name,
          params.namespace,
          {
            spec: {
              template: {
                metadata: {
                  annotations: { "kubectl.kubernetes.io/restartedAt": now },
                },
              },
            },
          },
          undefined,
          undefined,
          undefined,
          undefined,
          { headers: { "Content-Type": "application/merge-patch+json" } },
        );
        break;
      }
      case MutationAction.RollbackDeployment: {
        await client.patchNamespacedDeployment(
          params.name,
          params.namespace,
          { spec: { template: { spec: params.templateSpec } } },
          undefined,
          undefined,
          undefined,
          undefined,
          { headers: { "Content-Type": "application/merge-patch+json" } },
        );
        break;
      }
      case MutationAction.ScaleDeployment:
        await client.patchNamespacedDeploymentScale(
          params.name,
          params.namespace,
          { spec: { replicas: params.replicas } },
          undefined,
          undefined,
          undefined,
          undefined,
          { headers: { "Content-Type": "application/merge-patch+json" } },
        );
        break;
    }
    await appendAudit({ ...auditBase, result: "SUCCESS" });
  } catch (err) {
    await appendAudit({ ...auditBase, result: "FAILED", error: String(err) });
    throw err;
  }
}
