import { useState, useEffect, useRef } from "react";
import type { V1Pod } from "@kubernetes/client-node";

export interface RestartSnapshot {
  ts: number; // epoch ms
  count: number;
}

/** Per-pod, per-container restart history recorded during this session. */
export type RestartHistory = Map<string, Map<string, RestartSnapshot[]>>;

const MAX_SNAPSHOTS = 30;
const SNAPSHOT_INTERVAL_MS = 15_000;

/**
 * Watches the pod map and records restart-count snapshots every interval.
 * Returns a stable ref so consumers can look up history without re-renders.
 */
export function useRestartHistory(pods: Map<string, V1Pod>): RestartHistory {
  const historyRef = useRef<RestartHistory>(new Map());
  const [, forceRender] = useState(0);

  function snapshot() {
    pods.forEach((pod) => {
      const uid = pod.metadata?.uid;
      if (!uid) return;
      if (!historyRef.current.has(uid))
        historyRef.current.set(uid, new Map());
      const podHistory = historyRef.current.get(uid)!;

      for (const cs of pod.status?.containerStatuses ?? []) {
        const name = cs.name;
        if (!podHistory.has(name)) podHistory.set(name, []);
        const snapshots = podHistory.get(name)!;
        const count = cs.restartCount ?? 0;
        const last = snapshots[snapshots.length - 1];
        // Only record if count changed or first snapshot
        if (!last || last.count !== count) {
          snapshots.push({ ts: Date.now(), count });
          if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
        }
      }
    });
  }

  // Record immediately when pod data arrives
  useEffect(() => {
    snapshot();
  }, [pods]);

  // Also record on a fixed interval to capture slow-drift restarts
  useEffect(() => {
    const id = setInterval(() => {
      snapshot();
      forceRender((n) => n + 1);
    }, SNAPSHOT_INTERVAL_MS);
    return () => clearInterval(id);
  }, [pods]);

  return historyRef.current;
}
