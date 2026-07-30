import React, { useState, useEffect } from "react";
import { Box, Text, useInput } from "ink";
import type { V1Deployment, V1ReplicaSet, KubeConfig } from "@kubernetes/client-node";
import { AppsV1Api } from "@kubernetes/client-node";
import { formatAge } from "../utils/format.js";

interface Revision {
  revision: number;
  rs: V1ReplicaSet;
  image: string;
  replicas: number;
  createdAt?: Date | string;
}

interface DeploymentDetailProps {
  deployment: V1Deployment;
  kubeConfig: KubeConfig;
  onClose: () => void;
  onRollback?: (deployment: V1Deployment, revision: number) => void;
}

export function DeploymentDetail({
  deployment,
  kubeConfig,
  onClose,
  onRollback,
}: DeploymentDetailProps) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const name = deployment.metadata?.name ?? "";
  const namespace = deployment.metadata?.namespace ?? "default";
  const currentRevision = Number(
    deployment.metadata?.annotations?.["deployment.kubernetes.io/revision"] ?? "0",
  );

  useEffect(() => {
    async function fetchReplicaSets() {
      try {
        const appsV1 = kubeConfig.makeApiClient(AppsV1Api);
        const selector = deployment.spec?.selector?.matchLabels ?? {};
        const labelSelector = Object.entries(selector)
          .map(([k, v]) => `${k}=${v}`)
          .join(",");

        const res = await appsV1.listNamespacedReplicaSet(
          namespace,
          undefined,
          undefined,
          undefined,
          undefined,
          labelSelector,
        );

        const rsList = (res.body?.items ?? []) as V1ReplicaSet[];
        const parsed: Revision[] = rsList
          .map((rs) => {
            const rev = Number(
              rs.metadata?.annotations?.["deployment.kubernetes.io/revision"] ?? "0",
            );
            const image =
              rs.spec?.template?.spec?.containers?.[0]?.image ?? "(unknown)";
            return {
              revision: rev,
              rs,
              image,
              replicas: rs.spec?.replicas ?? 0,
              createdAt: rs.metadata?.creationTimestamp,
            };
          })
          .filter((r) => r.revision > 0)
          .sort((a, b) => b.revision - a.revision);

        setRevisions(parsed);
        setLoading(false);
      } catch (err) {
        setError(String(err));
        setLoading(false);
      }
    }
    fetchReplicaSets();
  }, []);

  // Rollback confirmation happens once, in the shared ConfirmModal (which
  // also shows the production-namespace warning) — App.tsx's onRollback
  // wraps this call in that flow, so this view doesn't need its own.
  useInput((input, key) => {
    if (key.escape) { onClose(); return; }
    if (key.upArrow) setCursor((i) => Math.max(0, i - 1));
    if (key.downArrow) setCursor((i) => Math.min(revisions.length - 1, i + 1));
    if ((input === "r" || key.return) && revisions[cursor]) {
      const rev = revisions[cursor];
      if (rev.revision !== currentRevision) onRollback?.(deployment, rev.revision);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
    >
      {/* Header */}
      <Box justifyContent="space-between">
        <Box>
          <Text bold color="cyan">
            Rollout History —{" "}
          </Text>
          <Text bold>{name}</Text>
          <Text dimColor> ns: {namespace}</Text>
        </Box>
        <Text dimColor>[↑↓] Nav  [r/Enter] Rollback  [Esc] Close</Text>
      </Box>

      {/* Current state */}
      <Box marginTop={1}>
        <Text dimColor>
          Current revision:{" "}
          <Text color="green" bold>
            #{currentRevision}
          </Text>
          {"  "}Ready:{" "}
          {deployment.status?.readyReplicas ?? 0}/
          {deployment.status?.replicas ?? 0}
        </Text>
      </Box>

      {/* Column header */}
      <Box
        marginTop={1}
        borderStyle="single"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderBottom={true}
      >
        <Text bold color="cyan">
          {"  REV  IMAGE                                    REPLICAS  AGE     "}
        </Text>
      </Box>

      {/* Loading / error */}
      {loading && <Text dimColor marginTop={1}>  Loading revisions...</Text>}
      {error && (
        <Text color="red" marginTop={1}>
          {" "}Error: {error}
        </Text>
      )}

      {/* Revision list */}
      {!loading &&
        !error &&
        revisions.map((rev, i) => {
          const isActive = i === cursor;
          const isCurrent = rev.revision === currentRevision;
          const shortImage = rev.image.split("/").pop()?.slice(0, 40) ?? rev.image.slice(0, 40);
          return (
            <Box key={rev.revision} marginTop={1}>
              <Text color={isActive ? "cyan" : undefined} bold={isActive}>
                {isActive ? "▶ " : "  "}
              </Text>
              <Text
                color={isCurrent ? "green" : isActive ? "cyan" : undefined}
                bold={isCurrent || isActive}
              >
                {`#${rev.revision}`.padEnd(5)}
              </Text>
              <Text
                color={isActive ? "cyan" : undefined}
                dimColor={!isActive && !isCurrent}
              >
                {shortImage.padEnd(41)}
              </Text>
              <Text dimColor={!isActive}>{String(rev.replicas).padEnd(10)}</Text>
              <Text dimColor>{formatAge(rev.createdAt)}</Text>
              {isCurrent && (
                <Text color="green" bold>
                  {" "}← current
                </Text>
              )}
            </Box>
          );
        })}

      {!loading && !error && revisions.length === 0 && (
        <Text dimColor marginTop={1}>
          {" "}No revision history found. Ensure revisionHistoryLimit &gt; 0.
        </Text>
      )}
    </Box>
  );
}
