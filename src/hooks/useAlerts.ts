import { useState, useEffect, useRef } from "react";
import { HealthStatus } from "../utils/health.js";

export interface Alert {
  id: string;
  resourceName: string;
  namespace: string;
  message: string;
  timestamp: Date;
}

type KubeObject = {
  metadata?: { uid?: string; name?: string; namespace?: string };
};
type GetHealth<T> = (resource: T) => HealthStatus;

export interface UseAlertsResult {
  alerts: Alert[];
  dismiss: (id: string) => void;
}

export function useAlerts<T extends KubeObject>(
  resources: Map<string, T>,
  getHealth: GetHealth<T>,
): UseAlertsResult {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const prevHealthRef = useRef<Map<string, HealthStatus>>(new Map());

  useEffect(() => {
    const newAlerts: Alert[] = [];

    resources.forEach((resource, uid) => {
      const currentHealth = getHealth(resource);
      const prevHealth = prevHealthRef.current.get(uid);

      if (
        currentHealth === HealthStatus.Critical &&
        prevHealth !== HealthStatus.Critical
      ) {
        newAlerts.push({
          id: `${uid}-${Date.now()}`,
          resourceName: resource.metadata?.name ?? uid,
          namespace: resource.metadata?.namespace ?? "",
          message: `${resource.metadata?.name} is in a critical state`,
          timestamp: new Date(),
        });
      }
    });

    const newSnapshot = new Map<string, HealthStatus>();
    resources.forEach((resource, uid) => {
      newSnapshot.set(uid, getHealth(resource));
    });
    prevHealthRef.current = newSnapshot;

    if (newAlerts.length > 0) {
      setAlerts((prev) => [...prev, ...newAlerts]);
    }
  }, [resources, getHealth]);

  function dismiss(id: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }

  return { alerts, dismiss };
}
