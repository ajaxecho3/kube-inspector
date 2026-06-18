import type {
  V1Pod,
  V1Deployment,
  V1Node,
  V1PersistentVolumeClaim,
} from "@kubernetes/client-node";

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
  const conditions = node.status?.conditions ?? [];
  const readyCondition = conditions.find((c) => c.type === "Ready");
  if (!readyCondition) return HealthStatus.Degraded;
  if (readyCondition.status === "False") return HealthStatus.Critical;

  // Any active pressure condition degrades the node
  const pressureTypes = ["MemoryPressure", "DiskPressure", "PIDPressure"];
  const hasPressure = pressureTypes.some(
    (t) => conditions.find((c) => c.type === t)?.status === "True",
  );
  if (hasPressure) return HealthStatus.Degraded;

  if (readyCondition.status === "True") return HealthStatus.Healthy;
  return HealthStatus.Degraded;
}

/** Returns active pressure conditions as a short string, e.g. "Mem Disk" */
export function nodePressureLabel(node: V1Node): string {
  const conditions = node.status?.conditions ?? [];
  const labels: string[] = [];
  if (conditions.find((c) => c.type === "MemoryPressure")?.status === "True")
    labels.push("Mem");
  if (conditions.find((c) => c.type === "DiskPressure")?.status === "True")
    labels.push("Disk");
  if (conditions.find((c) => c.type === "PIDPressure")?.status === "True")
    labels.push("PID");
  return labels.join("+");
}

export function pvcHealth(pvc: V1PersistentVolumeClaim): HealthStatus {
  const phase = pvc.status?.phase;
  if (phase === "Bound") return HealthStatus.Healthy;
  if (phase === "Lost") return HealthStatus.Critical;
  return HealthStatus.Degraded; // Pending or unknown
}
