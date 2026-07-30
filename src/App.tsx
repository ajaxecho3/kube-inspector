import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import type {
  V1Pod,
  V1Deployment,
  V1Service,
  V1Namespace,
  V1Node,
  CoreV1Event,
  V1PersistentVolumeClaim,
} from "@kubernetes/client-node";
import { NavTabs, TAB_LABELS } from "./components/NavTabs.js";
import {
  ResourceTable,
  ResourceRow,
  SPARK_SAMPLES,
} from "./components/ResourceTable.js";
import { AlertBanner } from "./components/AlertBanner.js";
import { ConfirmModal } from "./components/ConfirmModal.js";
import { ContextSwitcher } from "./components/ContextSwitcher.js";
import { NamespacePicker } from "./components/NamespacePicker.js";
import { PodDetail } from "./components/PodDetail.js";
import { MultiPodLogView } from "./components/MultiPodLogView.js";
import { DeploymentDetail } from "./components/DeploymentDetail.js";
import { ScaleModal } from "./components/ScaleModal.js";
import { useKubeClient } from "./hooks/useKubeClient.js";
import { useResources } from "./hooks/useResources.js";
import { useAlerts } from "./hooks/useAlerts.js";
import { useFavourites } from "./hooks/useFavourites.js";
import { useRestartHistory } from "./hooks/useRestartHistory.js";
import { useMetrics } from "./hooks/useMetrics.js";
import {
  podHealth,
  deploymentHealth,
  nodeHealth,
  nodePressureLabel,
  pvcHealth,
  HealthStatus,
} from "./utils/health.js";
import { mutate, MutationAction } from "./utils/mutate.js";
import {
  formatCpu,
  formatMemBytes,
  usageColor,
  usageSpark,
  parseCpuToMillicores,
  parseMemoryToBytes,
} from "./utils/metrics.js";

const PROTECTED_NAMESPACES = new Set(["production", "prod", "kube-system"]);

interface AppProps {
  mutationsEnabled: boolean;
  maxReplicas: number;
}

export function App({ mutationsEnabled, maxReplicas }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showContextSwitcher, setShowContextSwitcher] = useState(false);
  const [showNamespacePicker, setShowNamespacePicker] = useState(false);
  const [activeNamespace, setActiveNamespace] = useState("all");
  const [detailPod, setDetailPod] = useState<V1Pod | null>(null);
  const [selectedPodUids, setSelectedPodUids] = useState<Set<string>>(
    new Set(),
  );
  const [multiPodView, setMultiPodView] = useState(false);
  const [detailDeployment, setDetailDeployment] = useState<V1Deployment | null>(null);
  const [scaleTarget, setScaleTarget] = useState<V1Deployment | null>(null);
  const [pendingMutation, setPendingMutation] = useState<null | {
    title: string;
    description: string;
    action: () => Promise<void>;
    namespace: string;
  }>(null);

  const kubeClient = useKubeClient();
  const { favourites, toggle: toggleFavourite } = useFavourites();

  const pods = useResources<V1Pod>(kubeClient.kubeConfig, "/api/v1/pods", {
    namespaced: true,
  });
  const deployments = useResources<V1Deployment>(
    kubeClient.kubeConfig,
    "/apis/apps/v1/deployments",
    { namespaced: true },
  );
  const services = useResources<V1Service>(
    kubeClient.kubeConfig,
    "/api/v1/services",
    { namespaced: true },
  );
  const namespaces = useResources<V1Namespace>(
    kubeClient.kubeConfig,
    "/api/v1/namespaces",
    { namespaced: false },
  );
  const nodes = useResources<V1Node>(kubeClient.kubeConfig, "/api/v1/nodes", {
    namespaced: false,
  });
  const events = useResources<CoreV1Event>(
    kubeClient.kubeConfig,
    "/api/v1/events",
    { namespaced: true },
  );
  const pvcs = useResources<V1PersistentVolumeClaim>(
    kubeClient.kubeConfig,
    "/api/v1/persistentvolumeclaims",
    { namespaced: true },
  );

  const getPodHealth = useCallback((pod: V1Pod) => podHealth(pod), []);
  const { alerts, dismiss } = useAlerts(pods.resources, getPodHealth);
  const restartHistory = useRestartHistory(pods.resources);
  const metrics = useMetrics(kubeClient.kubeConfig);

  // Chrome that sits above the main content area in every view: header +
  // tabs + alert banner. Detail/overlay views (PodDetail, MultiPodLogView,
  // etc.) replace the table but still render below this same chrome, so
  // they need this number too — otherwise they size themselves against the
  // full terminal height and end up rendering more rows than actually fit,
  // which Ink then has to squeeze/overlap.
  const chromeAboveContent =
    1 + // header
    2 + // tabs (border line + content row)
    (alerts[0] ? 1 : 0); // alert banner when visible (single line, no border)
  const contentMaxHeight = Math.max(5, (stdout?.rows ?? 24) - chromeAboveContent);
  // The table view additionally has the global footer below it.
  const tableMaxHeight = Math.max(5, contentMaxHeight - 2);

  const connectionError = pods.error ?? deployments.error;

  useInput((input, key) => {
    if (
      pendingMutation ||
      showContextSwitcher ||
      showNamespacePicker ||
      detailPod ||
      detailDeployment ||
      scaleTarget ||
      multiPodView
    )
      return;
    if (key.tab) {
      setActiveTab((i) => (i + 1) % TAB_LABELS.length);
      setSelectedPodUids(new Set());
    }
    if (input === "q" || (key.ctrl && input === "c")) exit();
    if (input === "c") setShowContextSwitcher(true);
    if (input === "n") setShowNamespacePicker(true);

    if (activeTab === 0) {
      const podArr = Array.from(pods.resources.values());
      const pod = podArr[selectedIndex];

      if (mutationsEnabled && pod) {
        const name = pod.metadata?.name ?? "";
        const ns = pod.metadata?.namespace ?? "";

        if (input === "d") {
          setPendingMutation({
            title: "Confirm Pod Deletion",
            description: `Delete pod "${name}" in namespace "${ns}"?`,
            namespace: ns,
            action: () =>
              mutate(kubeClient.coreV1 as any, {
                action: MutationAction.DeletePod,
                name,
                namespace: ns,
              }),
          });
        }

        if (input === "D") {
          setPendingMutation({
            title: "Confirm Force Delete",
            description: `Force-delete pod "${name}" in namespace "${ns}"? (grace period = 0)`,
            namespace: ns,
            action: () =>
              mutate(kubeClient.coreV1 as any, {
                action: MutationAction.ForceDeletePod,
                name,
                namespace: ns,
              }),
          });
        }
      }
    }

    if (activeTab === 1) {
      const deployArr = Array.from(deployments.resources.values());
      const deploy = deployArr[selectedIndex];
      if (!deploy) return;
      const name = deploy.metadata?.name ?? "";
      const ns = deploy.metadata?.namespace ?? "";

      if (mutationsEnabled && input === "R") {
        setPendingMutation({
          title: "Confirm Restart",
          description: `Rollout restart deployment "${name}" in namespace "${ns}"?`,
          namespace: ns,
          action: () =>
            mutate(kubeClient.appsV1 as any, {
              action: MutationAction.RestartDeployment,
              name,
              namespace: ns,
            }),
        });
      }

      if (mutationsEnabled && input === "s") {
        setScaleTarget(deploy);
      }
    }
  });

  function nsFilter<T extends { metadata?: { namespace?: string } }>(
    items: T[],
  ): T[] {
    if (activeNamespace === "all") return items;
    return items.filter((x) => x.metadata?.namespace === activeNamespace);
  }

  function buildPodRows(): ResourceRow[] {
    return nsFilter(Array.from(pods.resources.values())).map((pod) => {
      const cs = pod.status?.containerStatuses ?? [];
      const readyCount = cs.filter((s) => s.ready).length;
      const phase = pod.status?.phase ?? "Unknown";
      const restarts = cs.reduce((sum, s) => sum + (s.restartCount ?? 0), 0);
      const node = (pod.spec?.nodeName ?? "").slice(0, 18);

      const metricKey = `${pod.metadata?.namespace ?? ""}/${pod.metadata?.name ?? ""}`;
      const usage = metrics.podMetrics.get(metricKey);
      // Percentage against the pod's own requested resources, when set —
      // otherwise show raw usage with no color (nothing to compare against).
      const requests = (pod.spec?.containers ?? []).reduce(
        (sum, c) => {
          const cpuReq = c.resources?.requests?.["cpu"];
          const memReq = c.resources?.requests?.["memory"];
          const cpuMilli = cpuReq ? parseCpuToMillicores(cpuReq) : null;
          const memB = memReq ? parseMemoryToBytes(memReq) : null;
          return {
            cpu: sum.cpu + (cpuMilli ?? 0),
            mem: sum.mem + (memB ?? 0),
            cpuSeen: sum.cpuSeen || cpuMilli !== null,
            memSeen: sum.memSeen || memB !== null,
          };
        },
        { cpu: 0, mem: 0, cpuSeen: false, memSeen: false },
      );
      const cpuPct =
        usage?.cpuMillicores != null && requests.cpuSeen && requests.cpu > 0
          ? (usage.cpuMillicores / requests.cpu) * 100
          : null;
      const memPct =
        usage?.memBytes != null && requests.memSeen && requests.mem > 0
          ? (usage.memBytes / requests.mem) * 100
          : null;
      const hist = metrics.podHistory.get(metricKey);

      return {
        uid: pod.metadata?.uid ?? "",
        name: pod.metadata?.name ?? "",
        namespace: pod.metadata?.namespace ?? "",
        status: podHealth(pod),
        creationTimestamp: pod.metadata?.creationTimestamp,
        extra: `${phase} ${readyCount}/${cs.length || "?"}`,
        extra2: restarts > 0 ? `↺${restarts}  ${node}` : node,
        extra3: pod.status?.podIP ?? "",
        cpu: metrics.available ? formatCpu(usage?.cpuMillicores) : undefined,
        cpuColor: usageColor(cpuPct),
        cpuSpark: trendSpark(hist?.cpu, requests.cpuSeen ? requests.cpu : 0),
        mem: metrics.available ? formatMemBytes(usage?.memBytes) : undefined,
        memColor: usageColor(memPct),
        memSpark: trendSpark(hist?.mem, requests.memSeen ? requests.mem : 0),
      };
    });
  }

  /** Renders a trend sparkline capped to SPARK_SAMPLES chars (the table
   * reserves exactly that much room) once at least 2 samples exist. Bars are
   * sized/colored by percent of `referenceTotal` (a request/allocatable
   * total) when known, rather than the window's own max — see usageSpark(). */
  function trendSpark(samples: number[] | undefined, referenceTotal: number) {
    if (!samples || samples.length < 2) return undefined;
    return usageSpark(samples.slice(-SPARK_SAMPLES), referenceTotal);
  }

  function buildDeploymentRows(): ResourceRow[] {
    return nsFilter(Array.from(deployments.resources.values())).map((d) => {
      const image = d.spec?.template?.spec?.containers?.[0]?.image ?? "";
      const shortImage = (image.split("/").pop() ?? image).slice(0, 22);
      return {
        uid: d.metadata?.uid ?? "",
        name: d.metadata?.name ?? "",
        namespace: d.metadata?.namespace ?? "",
        status: deploymentHealth(d),
        creationTimestamp: d.metadata?.creationTimestamp,
        extra: `${d.status?.readyReplicas ?? 0}/${d.status?.replicas ?? 0} ready`,
        extra2: shortImage,
        extra3: (() => {
          const strat = d.spec?.strategy?.type ?? "RollingUpdate";
          const surge = d.spec?.strategy?.rollingUpdate?.maxSurge;
          return surge !== undefined ? `${strat} +${surge}` : strat;
        })(),
      };
    });
  }

  function buildServiceRows(): ResourceRow[] {
    return nsFilter(Array.from(services.resources.values())).map((s) => {
      const svcType = s.spec?.type ?? "ClusterIP";
      const ports =
        s.spec?.ports
          ?.map((p) => `${p.port}/${p.protocol ?? "TCP"}`)
          .join(",") ?? "";
      return {
        uid: s.metadata?.uid ?? "",
        name: s.metadata?.name ?? "",
        namespace: s.metadata?.namespace ?? "",
        status: HealthStatus.Healthy,
        creationTimestamp: s.metadata?.creationTimestamp,
        extra: svcType,
        extra2: ports.slice(0, 26),
        extra3: (() => {
          if (s.spec?.type === "LoadBalancer") {
            const ingress = s.status?.loadBalancer?.ingress;
            return ingress?.[0]?.ip ?? ingress?.[0]?.hostname ?? "<pending>";
          }
          return s.spec?.clusterIP ?? "";
        })(),
      };
    });
  }

  function buildNamespaceRows(): ResourceRow[] {
    return Array.from(namespaces.resources.values()).map((ns) => ({
      uid: ns.metadata?.uid ?? "",
      name: ns.metadata?.name ?? "",
      namespace: "",
      status:
        ns.status?.phase === "Active"
          ? HealthStatus.Healthy
          : HealthStatus.Degraded,
      creationTimestamp: ns.metadata?.creationTimestamp,
      extra3: (() => {
        const count = Object.keys(ns.metadata?.labels ?? {}).length;
        return count > 0 ? `${count} label${count !== 1 ? "s" : ""}` : "";
      })(),
    }));
  }

  function buildNodeRows(): ResourceRow[] {
    return Array.from(nodes.resources.values()).map((n) => {
      const roles =
        Object.keys(n.metadata?.labels ?? {})
          .filter((k) => k.startsWith("node-role.kubernetes.io/"))
          .map((k) => k.split("/")[1])
          .join(",") || "worker";
      const version = n.status?.nodeInfo?.kubeletVersion ?? "";
      const pressure = nodePressureLabel(n);

      const usage = metrics.nodeMetrics.get(n.metadata?.name ?? "");
      const allocCpu = parseCpuToMillicores(n.status?.allocatable?.["cpu"]);
      const allocMem = parseMemoryToBytes(n.status?.allocatable?.["memory"]);
      const cpuPct =
        usage?.cpuMillicores != null && allocCpu
          ? (usage.cpuMillicores / allocCpu) * 100
          : null;
      const memPct =
        usage?.memBytes != null && allocMem
          ? (usage.memBytes / allocMem) * 100
          : null;
      const hist = metrics.nodeHistory.get(n.metadata?.name ?? "");

      return {
        uid: n.metadata?.uid ?? "",
        name: n.metadata?.name ?? "",
        namespace: "",
        status: nodeHealth(n),
        creationTimestamp: n.metadata?.creationTimestamp,
        extra: roles,
        extra2: version,
        extra3: pressure
          ? `⚠ ${pressure}`
          : (n.status?.nodeInfo?.osImage ?? "").slice(0, 20),
        cpu: metrics.available ? formatCpu(usage?.cpuMillicores) : undefined,
        cpuColor: usageColor(cpuPct),
        cpuSpark: trendSpark(hist?.cpu, allocCpu ?? 0),
        mem: metrics.available ? formatMemBytes(usage?.memBytes) : undefined,
        memColor: usageColor(memPct),
        memSpark: trendSpark(hist?.mem, allocMem ?? 0),
      };
    });
  }

  function buildPVCRows(): ResourceRow[] {
    return Array.from(pvcs.resources.values())
      .filter(
        (pvc) =>
          activeNamespace === "all" ||
          pvc.metadata?.namespace === activeNamespace,
      )
      .map((pvc) => {
        const phase = pvc.status?.phase ?? "Unknown";
        const capacity =
          pvc.status?.capacity?.["storage"] ??
          pvc.spec?.resources?.requests?.["storage"] ??
          "";
        const storageClass = pvc.spec?.storageClassName ?? "";
        const volumeName = (pvc.spec?.volumeName ?? "").slice(0, 22);
        return {
          uid: pvc.metadata?.uid ?? "",
          name: pvc.metadata?.name ?? "",
          namespace: pvc.metadata?.namespace ?? "",
          status: pvcHealth(pvc),
          creationTimestamp: pvc.metadata?.creationTimestamp,
          extra: phase,
          extra2: capacity,
          extra3: storageClass || volumeName,
        };
      });
  }

  function buildEventRows(): ResourceRow[] {
    return Array.from(events.resources.values())
      .sort((a, b) => {
        const at = a.lastTimestamp ? new Date(a.lastTimestamp).getTime() : 0;
        const bt = b.lastTimestamp ? new Date(b.lastTimestamp).getTime() : 0;
        return bt - at;
      })
      .slice(0, 100)
      .map((e) => ({
        uid: e.metadata?.uid ?? "",
        name: e.involvedObject?.name ?? "",
        namespace: e.metadata?.namespace ?? "",
        status:
          e.type === "Warning" ? HealthStatus.Degraded : HealthStatus.Healthy,
        creationTimestamp: e.lastTimestamp,
        extra: e.reason ?? "",
        extra2: e.message?.slice(0, 38),
        extra3: (e.count ?? 0) > 1 ? `×${e.count}` : "",
      }));
  }

  function pinFavourites(rows: ResourceRow[]): ResourceRow[] {
    if (favourites.size === 0) return rows;
    const pinned = rows.filter((r) => favourites.has(r.uid));
    const rest = rows.filter((r) => !favourites.has(r.uid));
    return [...pinned, ...rest];
  }

  const tabRows: ResourceRow[][] = [
    pinFavourites(buildPodRows()),
    pinFavourites(buildDeploymentRows()),
    pinFavourites(buildServiceRows()),
    buildNamespaceRows(),
    buildNodeRows(),
    buildEventRows(),
    pinFavourites(buildPVCRows()),
  ];

  const tabSummaries = tabRows.map((rows) => ({
    total: rows.length,
    critical: rows.filter((r) => r.status === HealthStatus.Critical).length,
  }));

  const TAB_RESOURCE_LABELS = [
    "pods",
    "deployments",
    "services",
    "namespaces",
    "nodes",
    "events",
    "pvcs",
  ];
  // Per-tab column header labels: [extraLabel, extra2Label, extra3Label]
  const TAB_COL_LABELS: [string, string, string][] = [
    ["PHASE", "NODE", "IP"],
    ["REPLICAS", "IMAGE", "STRATEGY"],
    ["TYPE", "PORTS", "CLUSTER IP"],
    ["", "", "LABELS"],
    ["ROLES", "VERSION", "OS / PRESSURE"],
    ["REASON", "MESSAGE", "COUNT"],
    ["PHASE", "CAPACITY", "STORAGECLASS"],
  ];
  const tabLoading = [
    pods.loading,
    deployments.loading,
    services.loading,
    namespaces.loading,
    nodes.loading,
    events.loading,
    pvcs.loading,
  ];

  // Every detail/overlay view (PodDetail, DeploymentDetail, ScaleModal,
  // MultiPodLogView, ContextSwitcher, NamespacePicker, ConfirmModal) already
  // shows its own hint text internally, so the global footer below is only
  // relevant for the plain resource-table browsing view — showing it during
  // an overlay would just duplicate (and risk drifting out of sync with)
  // hints that view already displays.
  const showGlobalFooter =
    !detailPod &&
    !detailDeployment &&
    !scaleTarget &&
    !multiPodView &&
    !showContextSwitcher &&
    !showNamespacePicker &&
    !pendingMutation;

  function getFooterHints(): string {
    const nsLabel = activeNamespace === "all" ? "all" : activeNamespace;
    const base = `[↑↓] Nav  [Tab] Switch  [/] Search  [*] Favourite  [c] Context  [n] NS:${nsLabel}  [q] Quit`;
    if (activeTab === 0) {
      return mutationsEnabled
        ? base + "  [Space] Select  [Enter] Detail  [d] Delete  [D] Force-del"
        : base + "  [Space] Select  [Enter] Detail";
    }
    if (activeTab === 1) {
      return mutationsEnabled
        ? base + "  [Enter] Detail  [R] Restart  [s] Scale"
        : base + "  [Enter] Detail";
    }
    return base;
  }

  if (connectionError && pods.resources.size === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          Connection Error
        </Text>
        <Text>{connectionError}</Text>
        <Text dimColor>[r] Retry [q] Quit</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      width={stdout?.columns ?? process.stdout.columns}
      height={stdout?.rows ?? process.stdout.rows}
      paddingRight={2}
    >
      {/* Header */}
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold color="cyan">
          kube-inspector
        </Text>
        <Box>
          <Text dimColor>context: {kubeClient.currentContext} </Text>
          <Text dimColor>ns: {activeNamespace} </Text>
          {metrics.available === false && (
            <Text dimColor>(metrics-server not found) </Text>
          )}
        </Box>
        <Text color={connectionError ? "yellow" : "green"}>
          {connectionError ? "⚠ reconnecting..." : "● connected"}
        </Text>
      </Box>

      {/* Alert Banner */}
      {alerts[0] && (
        <AlertBanner
          message={alerts[0].message}
          onDismiss={() => dismiss(alerts[0].id)}
          queueLength={alerts.length}
        />
      )}

      {/* Tabs */}
      <NavTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabSummaries={tabSummaries}
      />

      {/* Main content */}
      <Box flexGrow={1} paddingX={1}>
        {multiPodView ? (
          <MultiPodLogView
            pods={Array.from(pods.resources.values()).filter((p) =>
              selectedPodUids.has(p.metadata?.uid ?? ""),
            )}
            kubeConfig={kubeClient.kubeConfig}
            maxHeight={contentMaxHeight}
            onClose={() => {
              setMultiPodView(false);
              setSelectedPodUids(new Set());
            }}
          />
        ) : detailPod ? (
          <PodDetail
            pod={detailPod}
            kubeConfig={kubeClient.kubeConfig}
            onClose={() => setDetailPod(null)}
            restartHistory={restartHistory}
            metricsHistory={metrics.podHistory.get(
              `${detailPod.metadata?.namespace ?? ""}/${detailPod.metadata?.name ?? ""}`,
            )}
            maxHeight={contentMaxHeight}
          />
        ) : detailDeployment ? (
          <DeploymentDetail
            deployment={detailDeployment}
            kubeConfig={kubeClient.kubeConfig}
            onClose={() => setDetailDeployment(null)}
            onRollback={(deploy, revision) => {
              const rs = Array.from(deployments.resources.values()).find(
                (d) => d.metadata?.uid === deploy.metadata?.uid,
              );
              if (!rs) return;
              const name = deploy.metadata?.name ?? "";
              const ns = deploy.metadata?.namespace ?? "";
              setPendingMutation({
                title: "Confirm Rollback",
                description: `Roll back "${name}" to revision #${revision}?`,
                namespace: ns,
                action: () =>
                  mutate(kubeClient.appsV1 as any, {
                    action: MutationAction.RollbackDeployment,
                    name,
                    namespace: ns,
                    templateSpec: deploy.spec?.template?.spec as Record<string, unknown>,
                    revision,
                  }),
              });
              setDetailDeployment(null);
            }}
          />
        ) : showContextSwitcher ? (
          <ContextSwitcher
            contexts={kubeClient.availableContexts}
            currentContext={kubeClient.currentContext}
            onSelect={(ctx) => {
              kubeClient.setContext(ctx);
              setShowContextSwitcher(false);
            }}
            onClose={() => setShowContextSwitcher(false)}
          />
        ) : showNamespacePicker ? (
          <NamespacePicker
            namespaces={Array.from(namespaces.resources.values())
              .map((ns) => ns.metadata?.name ?? "")
              .filter(Boolean)}
            currentNamespace={activeNamespace}
            onSelect={(ns) => {
              setActiveNamespace(ns);
              setShowNamespacePicker(false);
              setSelectedIndex(0);
            }}
            onClose={() => setShowNamespacePicker(false)}
          />
        ) : scaleTarget ? (
          <ScaleModal
            name={scaleTarget.metadata?.name ?? ""}
            namespace={scaleTarget.metadata?.namespace ?? ""}
            currentReplicas={scaleTarget.spec?.replicas ?? 0}
            maxReplicas={maxReplicas}
            isProduction={PROTECTED_NAMESPACES.has(
              scaleTarget.metadata?.namespace ?? "",
            )}
            onConfirm={(replicas) => {
              const name = scaleTarget.metadata?.name ?? "";
              const ns = scaleTarget.metadata?.namespace ?? "";
              setScaleTarget(null);
              setPendingMutation({
                title: "Confirm Scale",
                description: `Scale deployment "${name}" in namespace "${ns}" to ${replicas} replica${replicas === 1 ? "" : "s"}?`,
                namespace: ns,
                action: () =>
                  mutate(kubeClient.appsV1 as any, {
                    action: MutationAction.ScaleDeployment,
                    name,
                    namespace: ns,
                    replicas,
                    maxReplicas,
                  }),
              });
            }}
            onCancel={() => setScaleTarget(null)}
          />
        ) : pendingMutation ? (
          <ConfirmModal
            title={pendingMutation.title}
            description={pendingMutation.description}
            isProduction={PROTECTED_NAMESPACES.has(pendingMutation.namespace)}
            onConfirm={async () => {
              await pendingMutation.action();
              setPendingMutation(null);
            }}
            onCancel={() => setPendingMutation(null)}
          />
        ) : (
          <ResourceTable
            rows={tabRows[activeTab]}
            selectedIndex={selectedIndex}
            onSelect={(i) => setSelectedIndex(i)}
            onActivate={(row) => {
              if (activeTab === 0) {
                // If 2+ pods are checked, open multi-pod view
                if (selectedPodUids.size >= 2) {
                  setSelectedPodUids((prev) => new Set([...prev, row.uid]));
                  setMultiPodView(true);
                  return;
                }
                const pod = Array.from(pods.resources.values()).find(
                  (p) => p.metadata?.uid === row.uid,
                );
                if (pod) setDetailPod(pod);
              }
              if (activeTab === 1) {
                const deploy = Array.from(deployments.resources.values()).find(
                  (d) => d.metadata?.uid === row.uid,
                );
                if (deploy) setDetailDeployment(deploy);
              }
            }}
            favouriteUids={favourites}
            onToggleFavourite={(row) => toggleFavourite(row.uid)}
            selectedUids={activeTab === 0 ? selectedPodUids : undefined}
            onToggleSelect={
              activeTab === 0
                ? (row) => {
                    setSelectedPodUids((prev) => {
                      const next = new Set(prev);
                      if (next.has(row.uid)) next.delete(row.uid);
                      else next.add(row.uid);
                      return next;
                    });
                  }
                : undefined
            }
            maxHeight={tableMaxHeight}
            mutationsEnabled={mutationsEnabled}
            loading={tabLoading[activeTab]}
            resourceLabel={TAB_RESOURCE_LABELS[activeTab]}
            extraLabel={TAB_COL_LABELS[activeTab][0]}
            extra2Label={TAB_COL_LABELS[activeTab][1]}
            extra3Label={TAB_COL_LABELS[activeTab][2]}
          />
        )}
      </Box>

      {/* Footer — only for the resource-table view; overlays show their own hints */}
      {showGlobalFooter && (
        <Box
          paddingX={1}
          borderStyle="single"
          borderTop={true}
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
        >
          <Text dimColor>{getFooterHints()}</Text>
        </Box>
      )}
    </Box>
  );
}
