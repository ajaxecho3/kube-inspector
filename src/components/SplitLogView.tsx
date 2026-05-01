import React from "react";
import { Box, Text } from "ink";
import type { V1Pod, KubeConfig } from "@kubernetes/client-node";
import { useLogStream } from "../hooks/useLogStream.js";
import {
  type LogLevel,
  filterByLevel,
  detectLineLevel,
  levelColor,
} from "../utils/logLevel.js";

const TAIL_LINES = 20;

interface ContainerTailPaneProps {
  kubeConfig: KubeConfig;
  namespace: string;
  podName: string;
  containerName: string;
  isReady: boolean;
  restarts: number;
  logLevel: LogLevel;
}

function ContainerTailPane({
  kubeConfig,
  namespace,
  podName,
  containerName,
  isReady,
  restarts,
  logLevel,
}: ContainerTailPaneProps) {
  const { lines, error } = useLogStream(
    kubeConfig,
    namespace,
    podName,
    containerName,
  );
  const filtered = filterByLevel(lines, logLevel);
  const tail = filtered.slice(-TAIL_LINES);

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      borderStyle="single"
      borderColor="gray"
    >
      {/* Pane header */}
      <Box paddingX={1} justifyContent="space-between">
        <Box>
          <Text bold>{containerName}</Text>
          {logLevel !== "ALL" && (
            <Text color={levelColor(logLevel as Exclude<LogLevel, "ALL">)} bold>
              {" "}[{logLevel}]
            </Text>
          )}
        </Box>
        <Box>
          <Text color={isReady ? "green" : "red"}>
            {isReady ? "● Ready" : "● NotReady"}
          </Text>
          {restarts > 0 && <Text color="yellow"> ↺{restarts}</Text>}
        </Box>
      </Box>

      {/* Log tail */}
      <Box flexDirection="column" paddingX={1} flexGrow={1}>
        {error && <Text color="red">{error}</Text>}
        {filtered.length === 0 && !error && (
          <Text dimColor>
            {logLevel !== "ALL"
              ? `No ${logLevel} lines yet…`
              : "Waiting for logs..."}
          </Text>
        )}
        {tail.map((line, i) => {
          const color = levelColor(detectLineLevel(line));
          return (
            <Text key={filtered.length - tail.length + i} color={color} dimColor={!color} wrap="truncate">
              {line}
            </Text>
          );
        })}
      </Box>

      {/* Footer */}
      <Box paddingX={1}>
        <Text dimColor>● auto-follow {filtered.length} lines</Text>
      </Box>
    </Box>
  );
}

export interface SplitLogViewProps {
  pod: V1Pod;
  kubeConfig: KubeConfig;
  logLevel: LogLevel;
}

export function SplitLogView({ pod, kubeConfig, logLevel }: SplitLogViewProps) {
  const namespace = pod.metadata?.namespace ?? "default";
  const podName = pod.metadata?.name ?? "";
  const containers = pod.spec?.containers ?? [];

  return (
    <Box flexDirection="row" flexGrow={1}>
      {containers.map((c) => {
        const cs = pod.status?.containerStatuses?.find(
          (s) => s.name === c.name,
        );
        return (
          <ContainerTailPane
            key={c.name}
            kubeConfig={kubeConfig}
            namespace={namespace}
            podName={podName}
            containerName={c.name}
            isReady={cs?.ready ?? false}
            restarts={cs?.restartCount ?? 0}
            logLevel={logLevel}
          />
        );
      })}
    </Box>
  );
}
