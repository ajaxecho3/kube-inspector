import type { V1Pod, V1Deployment, V1Node } from "@kubernetes/client-node";

export enum HealthStatus {
  Healthy = "healthy",
  Degraded = "degraded",
  Critical = "critical",
}

const CRITICAL_WAITING_REASONS = new Set([
  "CrashLoopBackOff",
  "OOMKilled",
  "Error",
  "ImagePullBackOff",
  "ErrImagePull",
  "CreateContainerConfigError",
]);

export function podHealth(pod: V1Pod): HealthStatus {
  const phase = pod.status?.phase;
  if (phase === "Failed") return HealthStatus.Critical;
  if (phase === "Pending") return HealthStatus.Degraded;

  const containerStatuses = pod.status?.containerStatuses ?? [];
  for (const cs of containerStatuses) {
    const reason = cs.state?.waiting?.reason;
    if (reason && CRITICAL_WAITING_REASONS.has(reason)) {
      return HealthStatus.Critical;
    }
  }

  if (phase === "Running") return HealthStatus.Healthy;
  return HealthStatus.Degraded;
}

export function deploymentHealth(deployment: V1Deployment): HealthStatus {
  const replicas = deployment.status?.replicas ?? 0;
  const available = deployment.status?.availableReplicas ?? 0;

  if (replicas === 0) return HealthStatus.Degraded;
  if (available === 0) return HealthStatus.Critical;
  if (available < replicas) return HealthStatus.Degraded;
  return HealthStatus.Healthy;
}

export function nodeHealth(node: V1Node): HealthStatus {
  const readyCondition = node.status?.conditions?.find(
    (c) => c.type === "Ready",
  );
  if (!readyCondition) return HealthStatus.Degraded;
  if (readyCondition.status === "True") return HealthStatus.Healthy;
  if (readyCondition.status === "False") return HealthStatus.Critical;
  return HealthStatus.Degraded;
}
