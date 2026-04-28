import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { V1Pod, KubeConfig } from "@kubernetes/client-node";
import { useLogStream } from "../hooks/useLogStream.js";
import { podHealth } from "../utils/health.js";
import { HealthStatus } from "../utils/health.js";

const TAIL_LINES = 25;

interface PodPaneProps {
  pod: V1Pod;
  kubeConfig: KubeConfig;
  isFocused: boolean;
}

function PodPane({ pod, kubeConfig, isFocused }: PodPaneProps) {
  const [scrollOffset, setScrollOffset] = useState(0);

  const namespace = pod.metadata?.namespace ?? "default";
  const podName = pod.metadata?.name ?? "";
  // Stream the first container by default
  const containerName = pod.spec?.containers?.[0]?.name ?? "";
  const containerCount = pod.spec?.containers?.length ?? 1;

  const { lines, error } = useLogStream(
    kubeConfig,
    namespace,
    podName,
    containerName,
  );

  useInput(
    (_input, key) => {
      if (key.upArrow) {
        setScrollOffset((prev) =>
          Math.min(Math.max(0, lines.length - TAIL_LINES), prev + 3),
        );
      }
      if (key.downArrow) {
        setScrollOffset((prev) => Math.max(0, prev - 3));
      }
    },
    { isActive: isFocused },
  );

  const isFollowing = scrollOffset === 0;
  const endIndex = lines.length - scrollOffset;
  const startIndex = Math.max(0, endIndex - TAIL_LINES);
  const visibleLines = lines.slice(startIndex, endIndex);

  const health = podHealth(pod);
  const healthColor =
    health === HealthStatus.Healthy
      ? "green"
      : health === HealthStatus.Degraded
        ? "yellow"
        : "red";

  const phase = pod.status?.phase ?? "Unknown";
  const allCs = pod.status?.containerStatuses ?? [];
  const readyCount = allCs.filter((s) => s.ready).length;

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      flexShrink={1}
      flexBasis={0}
      borderStyle="round"
      borderColor={isFocused ? "cyan" : "gray"}
    >
      {/* Pane header */}
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color={isFocused ? "cyan" : undefined}>
          {podName.length > 24 ? podName.slice(0, 23) + "…" : podName}
        </Text>
        <Box>
          <Text color={healthColor}>● {phase}</Text>
          <Text dimColor>
            {"  "}
            {readyCount}/{containerCount}
          </Text>
        </Box>
      </Box>
      <Box paddingX={1}>
        <Text dimColor>
          {namespace}
          {containerCount > 1 ? `  +${containerCount - 1} more` : ""}
        </Text>
      </Box>

      {/* Separator */}
      <Box>
        <Text dimColor>{"─".repeat(40)}</Text>
      </Box>

      {/* Log tail */}
      <Box flexDirection="column" paddingX={1} flexGrow={1} overflow="hidden">
        {error && <Text color="red">{error}</Text>}
        {lines.length === 0 && !error && (
          <Text dimColor>Waiting for logs…</Text>
        )}
        {visibleLines.map((line, i) => (
          <Text key={startIndex + i} wrap="truncate">
            {line}
          </Text>
        ))}
      </Box>

      {/* Footer */}
      <Box paddingX={1}>
        <Text dimColor>
          {isFollowing ? "● follow" : "⏸ paused"} · {lines.length} lines
          {!isFollowing && ` (↑${scrollOffset})`}
        </Text>
      </Box>
    </Box>
  );
}

export interface MultiPodLogViewProps {
  pods: V1Pod[];
  kubeConfig: KubeConfig;
  onClose: () => void;
}

export function MultiPodLogView({
  pods,
  kubeConfig,
  onClose,
}: MultiPodLogViewProps) {
  const [focusedIndex, setFocusedIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.leftArrow || input === "h") {
      setFocusedIndex((i) => Math.max(0, i - 1));
    }
    if (key.rightArrow || input === "l") {
      setFocusedIndex((i) => Math.min(pods.length - 1, i + 1));
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Header */}
      <Box justifyContent="space-between" paddingX={1}>
        <Box>
          <Text bold color="cyan">
            Multi-pod logs —{" "}
          </Text>
          <Text dimColor>{pods.length} pods</Text>
        </Box>
        <Text dimColor>[←→ / h/l] focus [↑↓] scroll [Esc] back to table</Text>
      </Box>

      {/* Panes */}
      <Box flexDirection="row" flexGrow={1}>
        {pods.map((pod, i) => (
          <PodPane
            key={pod.metadata?.uid ?? i}
            pod={pod}
            kubeConfig={kubeConfig}
            isFocused={i === focusedIndex}
          />
        ))}
      </Box>

      {/* Footer */}
      <Box paddingX={1}>
        <Text dimColor>
          Focused:{" "}
          <Text color="cyan">{pods[focusedIndex]?.metadata?.name ?? ""}</Text>
          {"  "}
          {pods.map((p, i) => (
            <Text key={i} color={i === focusedIndex ? "cyan" : "gray"}>
              {i === focusedIndex ? "▶" : "·"}{" "}
            </Text>
          ))}
        </Text>
      </Box>
    </Box>
  );
}
