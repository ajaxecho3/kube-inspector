import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp, useStdout } from "ink";
import type {
  V1Pod,
  V1Deployment,
  V1Service,
  V1Namespace,
  V1Node,
  CoreV1Event,
} from "@kubernetes/client-node";
import { NavTabs, TAB_LABELS } from "./components/NavTabs.js";
import { ResourceTable, ResourceRow } from "./components/ResourceTable.js";
import { AlertBanner } from "./components/AlertBanner.js";
import { ConfirmModal } from "./components/ConfirmModal.js";
import { ContextSwitcher } from "./components/ContextSwitcher.js";
import { PodDetail } from "./components/PodDetail.js";
import { MultiPodLogView } from "./components/MultiPodLogView.js";
import { useKubeClient } from "./hooks/useKubeClient.js";
import { useResources } from "./hooks/useResources.js";
import { useAlerts } from "./hooks/useAlerts.js";
import {
  podHealth,
  deploymentHealth,
  nodeHealth,
  HealthStatus,
} from "./utils/health.js";
import { mutate, MutationAction } from "./utils/mutate.js";

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
  const [detailPod, setDetailPod] = useState<V1Pod | null>(null);
  const [selectedPodUids, setSelectedPodUids] = useState<Set<string>>(
    new Set(),
  );
  const [multiPodView, setMultiPodView] = useState(false);
  const [pendingMutation, setPendingMutation] = useState<null | {
    title: string;
    description: string;
    action: () => Promise<void>;
    namespace: string;
  }>(null);

  const kubeClient = useKubeClient();

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

  const getPodHealth = useCallback((pod: V1Pod) => podHealth(pod), []);
  const { alerts, dismiss } = useAlerts(pods.resources, getPodHealth);

  // Dynamic chrome: accounts for whether summary bar and alert banner are currently rendered
  const isOverlay =
    !!detailPod || multiPodView || showContextSwitcher || !!pendingMutation;
  const appChrome =
    1 + // header
    2 + // tabs (border line + content row)
    (isOverlay ? 0 : 1) + // summary bar (hidden in overlays)
    (alerts[0] ? 3 : 0) + // alert banner when visible (top border + content + bottom border)
    2; // footer (border line + text)
  const tableMaxHeight = Math.max(5, (stdout?.rows ?? 24) - appChrome);
  const activeNamespace = "all"; // read-only display; filtering wired in a future spec

  const connectionError = pods.error ?? deployments.error;

  useInput((input, key) => {
    if (pendingMutation || showContextSwitcher || detailPod || multiPodView)
      return;
    if (key.tab) {
      setActiveTab((i) => (i + 1) % TAB_LABELS.length);
      setSelectedPodUids(new Set());
    }
    if (input === "q" || (key.ctrl && input === "c")) exit();
    if (input === "c") setShowContextSwitcher(true);

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

      if (mutationsEnabled && activeTab === parseInt("1", 10)) {
        const deployArr = Array.from(deployments.resources.values());
        const deploy = deployArr[selectedIndex];
        if (!deploy) return;
        const name = deploy.metadata?.name ?? "";
        const ns = deploy.metadata?.namespace ?? "";

        if (input === "R") {
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
      }
    }
  });

  function buildPodRows(): ResourceRow[] {
    return Array.from(pods.resources.values()).map((pod) => {
      const cs = pod.status?.containerStatuses ?? [];
      const readyCount = cs.filter((s) => s.ready).length;
      const phase = pod.status?.phase ?? "Unknown";
      const restarts = cs.reduce((sum, s) => sum + (s.restartCount ?? 0), 0);
      const node = (pod.spec?.nodeName ?? "").slice(0, 18);
      return {
        uid: pod.metadata?.uid ?? "",
        name: pod.metadata?.name ?? "",
        namespace: pod.metadata?.namespace ?? "",
        status: podHealth(pod),
        creationTimestamp: pod.metadata?.creationTimestamp,
        extra: `${phase} ${readyCount}/${cs.length || "?"}`,
        extra2: restarts > 0 ? `↺${restarts}  ${node}` : node,
        extra3: pod.status?.podIP ?? "",
      };
    });
  }

  function buildDeploymentRows(): ResourceRow[] {
    return Array.from(deployments.resources.values()).map((d) => {
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
    return Array.from(services.resources.values()).map((s) => {
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
      return {
        uid: n.metadata?.uid ?? "",
        name: n.metadata?.name ?? "",
        namespace: "",
        status: nodeHealth(n),
        creationTimestamp: n.metadata?.creationTimestamp,
        extra: roles,
        extra2: version,
        extra3: (n.status?.nodeInfo?.osImage ?? "").slice(0, 20),
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

  const tabRows: ResourceRow[][] = [
    buildPodRows(),
    buildDeploymentRows(),
    buildServiceRows(),
    buildNamespaceRows(),
    buildNodeRows(),
    buildEventRows(),
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
  ];
  // Per-tab column header labels: [extraLabel, extra2Label, extra3Label]
  const TAB_COL_LABELS: [string, string, string][] = [
    ["PHASE", "NODE", "IP"],
    ["REPLICAS", "IMAGE", "STRATEGY"],
    ["TYPE", "PORTS", "CLUSTER IP"],
    ["", "", "LABELS"],
    ["ROLES", "VERSION", "OS"],
    ["REASON", "MESSAGE", "COUNT"],
  ];
  const tabLoading = [
    pods.loading,
    deployments.loading,
    services.loading,
    namespaces.loading,
    nodes.loading,
    events.loading,
  ];

  function getFooterHints(): string {
    if (showContextSwitcher || pendingMutation) {
      return "[↑↓] Navigate  [Enter] Select  [Esc] Cancel";
    }
    if (detailPod) {
      return "[↑↓] Scroll  [[] []] Container  [f] Follow  [/] Search  [Esc] Close";
    }
    if (multiPodView) {
      return "[↑↓] Scroll  [Esc] Close";
    }
    const base = "[↑↓] Nav  [Tab] Switch  [/] Search  [c] Context  [q] Quit";
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
          <Text dimColor>ns: {activeNamespace}</Text>
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

      {/* Status summary bar — hidden when overlay/detail is active */}
      {!detailPod &&
        !multiPodView &&
        !showContextSwitcher &&
        !pendingMutation && (
          <Box paddingX={1}>
            {(() => {
              const rows = tabRows[activeTab];
              const total = rows.length;
              const critical = rows.filter(
                (r) => r.status === HealthStatus.Critical,
              ).length;
              const degraded = rows.filter(
                (r) => r.status === HealthStatus.Degraded,
              ).length;
              const healthy = rows.filter(
                (r) => r.status === HealthStatus.Healthy,
              ).length;
              return (
                <>
                  <Text dimColor>{total} total </Text>
                  {critical > 0 && (
                    <Text color="red">{critical} ● critical </Text>
                  )}
                  {degraded > 0 && (
                    <Text color="yellow">{degraded} ● degraded </Text>
                  )}
                  <Text color="green">{healthy} ● healthy</Text>
                </>
              );
            })()}
          </Box>
        )}

      {/* Main content */}
      <Box flexGrow={1} paddingX={1}>
        {multiPodView ? (
          <MultiPodLogView
            pods={Array.from(pods.resources.values()).filter((p) =>
              selectedPodUids.has(p.metadata?.uid ?? ""),
            )}
            kubeConfig={kubeClient.kubeConfig}
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
                  // Also make sure the activated row is included
                  setSelectedPodUids((prev) => new Set([...prev, row.uid]));
                  setMultiPodView(true);
                  return;
                }
                const pod = Array.from(pods.resources.values()).find(
                  (p) => p.metadata?.uid === row.uid,
                );
                if (pod) setDetailPod(pod);
              }
            }}
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

      {/* Footer */}
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
    </Box>
  );
}
