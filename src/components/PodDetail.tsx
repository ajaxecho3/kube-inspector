import React, { useState, useMemo } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { V1Pod, KubeConfig } from "@kubernetes/client-node";
import { useLogStream } from "../hooks/useLogStream.js";
import { formatAge } from "../utils/format.js";
import { SplitLogView } from "./SplitLogView.js";

interface PodDetailProps {
  pod: V1Pod;
  kubeConfig: KubeConfig;
  onClose: () => void;
}

export function PodDetail({ pod, kubeConfig, onClose }: PodDetailProps) {
  const { stdout } = useStdout();
  const namespace = pod.metadata?.namespace ?? "default";
  const podName = pod.metadata?.name ?? "";
  const containers = pod.spec?.containers ?? [];
  const [activeContainer, setActiveContainer] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [follow, setFollow] = useState(true);
  const [logSearch, setLogSearch] = useState("");
  const [logSearchMode, setLogSearchMode] = useState(false);
  const [splitMode, setSplitMode] = useState(false);

  const containerName = containers[activeContainer]?.name ?? "";

  // Chrome: title(1) + meta(1) + labels(1) + container rows(capped 4) + log header(1) + log footer(1) + 5 borders
  const CHROME = 10 + Math.min(containers.length, 4);
  const logLines = Math.max(5, (stdout?.rows ?? 30) - CHROME);

  const { lines, error: logError } = useLogStream(
    kubeConfig,
    namespace,
    podName,
    containerName,
  );

  const displayLines = useMemo(() => {
    if (!logSearch) return lines;
    return lines.filter((l) =>
      l.toLowerCase().includes(logSearch.toLowerCase()),
    );
  }, [lines, logSearch]);

  const maxOffset = Math.max(0, displayLines.length - logLines);
  const effectiveOffset = follow
    ? maxOffset
    : Math.min(scrollOffset, maxOffset);
  const visibleLines = displayLines.slice(
    effectiveOffset,
    effectiveOffset + logLines,
  );

  useInput((input, key) => {
    if (logSearchMode) {
      if (key.escape) {
        setLogSearchMode(false);
        setLogSearch("");
      } else if (key.return) {
        setLogSearchMode(false);
      } else if (key.backspace || key.delete)
        setLogSearch((q) => q.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setLogSearch((q) => q + input);
      return;
    }

    if (key.escape) {
      onClose();
      return;
    }

    if (input === "m" && containers.length > 1) {
      setSplitMode((v) => !v);
      return;
    }

    if (input === "[" && activeContainer > 0) {
      setActiveContainer((c) => c - 1);
      setScrollOffset(0);
      setFollow(true);
    }
    if (input === "]" && activeContainer < containers.length - 1) {
      setActiveContainer((c) => c + 1);
      setScrollOffset(0);
      setFollow(true);
    }

    if (!splitMode) {
      if (key.upArrow) {
        setFollow(false);
        setScrollOffset((o) => Math.max(0, o - 1));
      }
      if (key.downArrow) {
        const next = Math.min(maxOffset, scrollOffset + 1);
        setScrollOffset(next);
        if (next >= maxOffset) setFollow(true);
      }
      if (input === "g") {
        setScrollOffset(0);
        setFollow(false);
      }
      if (input === "G") {
        setScrollOffset(maxOffset);
        setFollow(true);
      }
      if (input === "f") setFollow((v) => !v);
      if (input === "/") {
        setLogSearchMode(true);
        setLogSearch("");
      }
    }
  });

  // Derived pod info
  const phase = pod.status?.phase ?? "Unknown";
  const phaseColor =
    phase === "Running" ? "green" : phase === "Pending" ? "yellow" : "red";
  const podIP = pod.status?.podIP ?? "-";
  const nodeName = pod.spec?.nodeName ?? "-";
  const labels = pod.metadata?.labels ?? {};
  const labelStr = Object.entries(labels)
    .map(([k, v]) => `${k}=${v}`)
    .join("  ");
  const scrollPercent =
    displayLines.length <= logLines
      ? 100
      : Math.round((effectiveOffset / maxOffset) * 100);

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      flexGrow={1}
    >
      {/* Title bar */}
      <Box justifyContent="space-between" paddingX={1}>
        <Box>
          <Text bold color="cyan">
            Pod:{" "}
          </Text>
          <Text bold>{podName}</Text>
          <Text dimColor> ns: {namespace}</Text>
        </Box>
        <Box>
          {containers.length > 1 && (
            <Text dimColor>[m] {splitMode ? "single" : "split"} logs </Text>
          )}
          <Text dimColor>[esc] close</Text>
        </Box>
      </Box>

      {/* Metadata row */}
      <Box
        paddingX={1}
        borderStyle="single"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderBottom={true}
      >
        <Text color={phaseColor}>● {phase} </Text>
        <Text dimColor>IP: </Text>
        <Text>{podIP} </Text>
        <Text dimColor>Node: </Text>
        <Text>
          {nodeName.length > 24 ? nodeName.slice(0, 23) + "…" : nodeName}
          {"  "}
        </Text>
        <Text dimColor>Age: {formatAge(pod.metadata?.creationTimestamp)}</Text>
      </Box>

      {/* Labels */}
      {labelStr ? (
        <Box paddingX={1}>
          <Text dimColor>Labels: </Text>
          <Text>
            {labelStr.length > 100 ? labelStr.slice(0, 99) + "…" : labelStr}
          </Text>
        </Box>
      ) : null}

      {/* Containers summary */}
      <Box
        flexDirection="column"
        paddingX={1}
        borderStyle="single"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderBottom={true}
      >
        {containers.slice(0, 4).map((c, i) => {
          const cs = pod.status?.containerStatuses?.find(
            (s) => s.name === c.name,
          );
          const isActive = i === activeContainer && !splitMode;
          const image = c.image ?? "";
          const shortImage = (image.split("/").pop() ?? image).slice(0, 26);
          const cpuR = c.resources?.requests?.["cpu"] ?? "-";
          const memR = c.resources?.requests?.["memory"] ?? "-";
          const cpuL = c.resources?.limits?.["cpu"] ?? "-";
          const memL = c.resources?.limits?.["memory"] ?? "-";
          const restarts = cs?.restartCount ?? 0;

          return (
            <Box key={c.name}>
              <Text color={isActive ? "cyan" : "gray"}>
                {isActive ? "▶ " : "  "}
              </Text>
              <Text bold={isActive} color={isActive ? "cyan" : undefined}>
                {c.name}
              </Text>
              <Text dimColor> {shortImage}</Text>
              <Text color={cs?.ready ? "green" : "red"}>
                {cs?.ready ? "  ● Ready" : "  ● NotReady"}
              </Text>
              <Text dimColor>
                {"  cpu "}
                {cpuR}/{cpuL}
                {"  mem "}
                {memR}/{memL}
              </Text>
              {restarts > 0 && <Text color="yellow"> ↺{restarts}</Text>}
            </Box>
          );
        })}
        {containers.length > 4 && (
          <Text dimColor> … {containers.length - 4} more containers</Text>
        )}
      </Box>

      {/* Log area — split or single */}
      {splitMode ? (
        <>
          <SplitLogView pod={pod} kubeConfig={kubeConfig} />
          <Box paddingX={1}>
            <Text dimColor>
              [m] single mode [Esc] close — all containers auto-follow
            </Text>
          </Box>
        </>
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          {/* Log header */}
          <Box paddingX={1} justifyContent="space-between">
            {logSearchMode ? (
              <Box>
                <Text color="cyan" bold>
                  /{" "}
                </Text>
                <Text>{logSearch}</Text>
                <Text color="cyan">█</Text>
              </Box>
            ) : logSearch ? (
              <Box>
                <Text color="yellow">/ {logSearch}</Text>
                <Text dimColor> {displayLines.length} match esc clear</Text>
              </Box>
            ) : (
              <Text dimColor bold>
                Logs ({containerName})
              </Text>
            )}
            <Box>
              {follow ? (
                <Text color="green">● follow</Text>
              ) : (
                <Text color="yellow">⏸ paused</Text>
              )}
              <Text dimColor>
                {"  "}
                {effectiveOffset + 1}-
                {Math.min(effectiveOffset + logLines, displayLines.length)}/
                {displayLines.length}
                {"  "}
                {scrollPercent}%
              </Text>
            </Box>
          </Box>

          {/* Log lines */}
          <Box
            flexDirection="column"
            paddingX={1}
            flexGrow={1}
            borderStyle="single"
            borderLeft={true}
            borderRight={false}
            borderTop={false}
            borderBottom={false}
          >
            {logError && <Text color="red">{logError}</Text>}
            {displayLines.length === 0 && !logError && (
              <Text dimColor>
                {logSearch
                  ? `No matches for "${logSearch}"`
                  : "Waiting for logs..."}
              </Text>
            )}
            {visibleLines.map((line, i) => {
              if (logSearch) {
                const idx = line.toLowerCase().indexOf(logSearch.toLowerCase());
                if (idx !== -1) {
                  return (
                    <Text key={effectiveOffset + i}>
                      {line.slice(0, idx)}
                      <Text backgroundColor="yellow" color="black">
                        {line.slice(idx, idx + logSearch.length)}
                      </Text>
                      {line.slice(idx + logSearch.length)}
                    </Text>
                  );
                }
              }
              return <Text key={effectiveOffset + i}>{line}</Text>;
            })}
          </Box>

          {/* Log footer */}
          <Box paddingX={1}>
            <Text dimColor>
              [↑↓] Scroll [g] Top [G] Bottom [f] Follow [/] Search
              {containers.length > 1 ? "  [[] []] Container" : ""}
              {"  [Esc] Close"}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
