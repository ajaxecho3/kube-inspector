import { useState, useEffect, useRef } from "react";
import { KubeConfig, CustomObjectsApi } from "@kubernetes/client-node";
import { parseCpuToMillicores, parseMemoryToBytes } from "../utils/metrics.js";

export interface ResourceMetric {
  cpuMillicores: number | null;
  memBytes: number | null;
}

/** Rolling per-resource sample history, used to render trend sparklines. */
export interface MetricHistory {
  cpu: number[];
  mem: number[];
}

export interface UseMetricsResult {
  /** Keyed by "namespace/name" */
  podMetrics: Map<string, ResourceMetric>;
  /** Keyed by node name */
  nodeMetrics: Map<string, ResourceMetric>;
  /** Keyed by "namespace/name" — last MAX_HISTORY_SAMPLES CPU/mem readings this session */
  podHistory: Map<string, MetricHistory>;
  /** Keyed by node name — last MAX_HISTORY_SAMPLES CPU/mem readings this session */
  nodeHistory: Map<string, MetricHistory>;
  /** null while the first poll is in flight; false once metrics-server has been confirmed unavailable */
  available: boolean | null;
}

const POLL_INTERVAL_MS = 15_000;
const MAX_HISTORY_SAMPLES = 20;
const METRICS_GROUP = "metrics.k8s.io";
const METRICS_VERSION = "v1beta1";

function recordSample(history: MetricHistory, metric: ResourceMetric): void {
  if (metric.cpuMillicores !== null) {
    history.cpu.push(metric.cpuMillicores);
    if (history.cpu.length > MAX_HISTORY_SAMPLES) history.cpu.shift();
  }
  if (metric.memBytes !== null) {
    history.mem.push(metric.memBytes);
    if (history.mem.length > MAX_HISTORY_SAMPLES) history.mem.shift();
  }
}

interface RawUsage {
  cpu?: string;
  memory?: string;
}

interface RawMetricsList {
  items?: Array<{
    metadata?: { name?: string; namespace?: string };
    usage?: RawUsage;
    containers?: Array<{ usage?: RawUsage }>;
  }>;
}

function sumContainerUsage(
  containers: Array<{ usage?: RawUsage }> | undefined,
): ResourceMetric {
  let cpu = 0;
  let mem = 0;
  let cpuSeen = false;
  let memSeen = false;
  for (const c of containers ?? []) {
    const cpuVal = parseCpuToMillicores(c.usage?.cpu);
    const memVal = parseMemoryToBytes(c.usage?.memory);
    if (cpuVal !== null) {
      cpu += cpuVal;
      cpuSeen = true;
    }
    if (memVal !== null) {
      mem += memVal;
      memSeen = true;
    }
  }
  return {
    cpuMillicores: cpuSeen ? cpu : null,
    memBytes: memSeen ? mem : null,
  };
}

/**
 * Polls the metrics.k8s.io aggregated API (metrics-server) for pod and node
 * usage, mirroring `kubectl top`. If metrics-server isn't installed, the
 * first request fails (typically 404/503) and `available` is set to false —
 * callers should hide usage columns rather than showing an error.
 */
export function useMetrics(kubeConfig: KubeConfig): UseMetricsResult {
  const [podMetrics, setPodMetrics] = useState<Map<string, ResourceMetric>>(
    new Map(),
  );
  const [nodeMetrics, setNodeMetrics] = useState<Map<string, ResourceMetric>>(
    new Map(),
  );
  const [available, setAvailable] = useState<boolean | null>(null);
  const isMounted = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const podHistoryRef = useRef<Map<string, MetricHistory>>(new Map());
  const nodeHistoryRef = useRef<Map<string, MetricHistory>>(new Map());

  useEffect(() => {
    isMounted.current = true;
    const api = kubeConfig.makeApiClient(CustomObjectsApi);

    async function poll() {
      try {
        const [podRes, nodeRes] = await Promise.all([
          api.listCustomObjectForAllNamespaces({
            group: METRICS_GROUP,
            version: METRICS_VERSION,
            plural: "pods",
          }) as Promise<RawMetricsList>,
          api.listClusterCustomObject({
            group: METRICS_GROUP,
            version: METRICS_VERSION,
            plural: "nodes",
          }) as Promise<RawMetricsList>,
        ]);
        if (!isMounted.current) return;

        const nextPods = new Map<string, ResourceMetric>();
        for (const item of podRes.items ?? []) {
          const key = `${item.metadata?.namespace ?? ""}/${item.metadata?.name ?? ""}`;
          const metric = sumContainerUsage(item.containers);
          nextPods.set(key, metric);
          if (!podHistoryRef.current.has(key)) {
            podHistoryRef.current.set(key, { cpu: [], mem: [] });
          }
          recordSample(podHistoryRef.current.get(key)!, metric);
        }

        const nextNodes = new Map<string, ResourceMetric>();
        for (const item of nodeRes.items ?? []) {
          const name = item.metadata?.name ?? "";
          const metric = {
            cpuMillicores: parseCpuToMillicores(item.usage?.cpu),
            memBytes: parseMemoryToBytes(item.usage?.memory),
          };
          nextNodes.set(name, metric);
          if (!nodeHistoryRef.current.has(name)) {
            nodeHistoryRef.current.set(name, { cpu: [], mem: [] });
          }
          recordSample(nodeHistoryRef.current.get(name)!, metric);
        }

        setPodMetrics(nextPods);
        setNodeMetrics(nextNodes);
        setAvailable(true);
      } catch {
        // metrics-server not installed, unreachable, or RBAC-denied — degrade
        // silently rather than surfacing a connection error for an optional feature.
        if (!isMounted.current) return;
        setAvailable((prev) => (prev === true ? true : false));
      } finally {
        if (isMounted.current) {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    poll();

    return () => {
      isMounted.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [kubeConfig]);

  return {
    podMetrics,
    nodeMetrics,
    podHistory: podHistoryRef.current,
    nodeHistory: nodeHistoryRef.current,
    available,
  };
}
