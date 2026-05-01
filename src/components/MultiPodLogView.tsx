import React, { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { V1Pod, KubeConfig } from "@kubernetes/client-node";
import { useLogStream } from "../hooks/useLogStream.js";
import { podHealth, HealthStatus } from "../utils/health.js";
import {
  type LogLevel,
  filterByLevel,
  detectLineLevel,
  levelColor,
  nextLevel,
} from "../utils/logLevel.js";

// chrome: view header(1) + view footer(1) + pane border top+bottom(2)
//       + pane name row(1) + pane ns row(1) + pane separator(1) + pane footer(1) = 8
const PANE_CHROME = 8;

interface PodPaneProps {
  pod: V1Pod;
  kubeConfig: KubeConfig;
  isFocused: boolean;
  logLevel: LogLevel;
  tailLines: number;
}

function PodPane({ pod, kubeConfig, isFocused, logLevel, tailLines }: PodPaneProps) {
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

  const filtered = filterByLevel(lines, logLevel);

  useInput(
    (_input, key) => {
      if (key.upArrow) {
        setScrollOffset((prev) =>
          Math.min(Math.max(0, filtered.length - tailLines), prev + 3),
        );
      }
      if (key.downArrow) {
        setScrollOffset((prev) => Math.max(0, prev - 3));
      }
    },
    { isActive: isFocused },
  );

  const isFollowing = scrollOffset === 0;
  const endIndex = filtered.length - scrollOffset;
  const startIndex = Math.max(0, endIndex - tailLines);
  const visibleLines = filtered.slice(startIndex, endIndex);

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
        <Box>
          <Text bold color={isFocused ? "cyan" : undefined}>
            {podName.length > 24 ? podName.slice(0, 23) + "…" : podName}
          </Text>
          {logLevel !== "ALL" && (
            <Text color={levelColor(logLevel as Exclude<LogLevel, "ALL">)} bold>
              {" "}[{logLevel}]
            </Text>
          )}
        </Box>
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
      <Box flexDirection="column" paddingX={1} height={tailLines} overflow="hidden">
        {error && <Text color="red">{error}</Text>}
        {filtered.length === 0 && !error && (
          <Text dimColor>
            {logLevel !== "ALL" ? `No ${logLevel} lines yet…` : "Waiting for logs…"}
          </Text>
        )}
        {visibleLines.map((line, i) => {
          const color = levelColor(detectLineLevel(line));
          return (
            <Text key={startIndex + i} color={color} dimColor={!color} wrap="truncate">
              {line}
            </Text>
          );
        })}
      </Box>

      {/* Footer */}
      <Box paddingX={1}>
        <Text dimColor>
          {isFollowing ? "● follow" : "⏸ paused"} · {filtered.length} lines
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
  const { stdout } = useStdout();
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [logLevel, setLogLevel] = useState<LogLevel>("ALL");

  const tailLines = Math.max(5, (stdout?.rows ?? 24) - PANE_CHROME);

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
    // Shift+L cycles log level across all panes
    if (input === "L") {
      setLogLevel((cur) => nextLevel(cur));
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
          {logLevel !== "ALL" && (
            <Text color={levelColor(logLevel as Exclude<LogLevel, "ALL">)} bold>
              {" "}[{logLevel}]
            </Text>
          )}
        </Box>
        <Text dimColor>[←→/h/l] focus  [↑↓] scroll  [L] level ({logLevel})  [Esc] back</Text>
      </Box>

      {/* Panes */}
      <Box flexDirection="row" flexGrow={1}>
        {pods.map((pod, i) => (
          <PodPane
            key={pod.metadata?.uid ?? i}
            pod={pod}
            kubeConfig={kubeConfig}
            isFocused={i === focusedIndex}
            logLevel={logLevel}
            tailLines={tailLines}
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
