import React, { useState, useMemo, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { V1Pod, KubeConfig } from "@kubernetes/client-node";
import type { RestartHistory } from "../hooks/useRestartHistory.js";
import { RestartGraph } from "./RestartGraph.js";
import { UsageGraph } from "./UsageGraph.js";
import type { MetricHistory } from "../hooks/useMetrics.js";
import { useLogStream } from "../hooks/useLogStream.js";
import { formatAge } from "../utils/format.js";
import { SplitLogView } from "./SplitLogView.js";
import {
  type LogLevel,
  LEVEL_KEYWORDS,
  detectLineLevel,
  levelColor,
  nextLevel,
} from "../utils/logLevel.js";

// ── Constants ────────────────────────────────────────────────────────────────

/** Cycling options for tail size (lines fetched on connect) */
const TAIL_OPTIONS = [50, 100, 200, 500] as const;

/** Cycling options for since-filter in minutes (undefined = all) */
const SINCE_OPTIONS = [undefined, 5, 15, 60] as const;

/** Strip RFC3339 timestamp prefix added by the k8s API (timestamps:true) */
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z /;
function stripTs(line: string): string {
  return line.replace(TS_RE, "");
}

// ── Types ────────────────────────────────────────────────────────────────────

interface DisplayLine {
  /** Text shown on screen — includes timestamp when showTimestamps:true */
  display: string;
  /** Timestamp-stripped content used for filtering and level detection */
  content: string;
}

// ── Component ────────────────────────────────────────────────────────────────

interface PodDetailProps {
  pod: V1Pod;
  kubeConfig: KubeConfig;
  onClose: () => void;
  restartHistory?: RestartHistory;
  /** This pod's CPU/mem sample history, for the usage-history graph ('u'). */
  metricsHistory?: MetricHistory;
  /** Rows actually available to this view (terminal height minus the header/
   * tabs/alert-banner chrome that still renders above it). Falls back to the
   * raw terminal height if not provided. */
  maxHeight?: number;
}

export function PodDetail({ pod, kubeConfig, onClose, restartHistory, metricsHistory, maxHeight }: PodDetailProps) {
  const { stdout } = useStdout();
  const namespace = pod.metadata?.namespace ?? "default";
  const podName   = pod.metadata?.name ?? "";
  const containers = pod.spec?.containers ?? [];

  // ── View state ─────────────────────────────────────────────────────────────
  const [activeContainer, setActiveContainer] = useState(0);
  const [scrollOffset,    setScrollOffset]    = useState(0);
  const [follow,          setFollow]          = useState(true);
  const [splitMode,       setSplitMode]       = useState(false);
  const [showRestartGraph, setShowRestartGraph] = useState(false);
  const [showUsageGraph, setShowUsageGraph] = useState(false);

  // ── Export state ───────────────────────────────────────────────────────────
  const [exportMsg, setExportMsg] = useState<string | null>(null);

  // ── Log filter / display state ─────────────────────────────────────────────
  const [logLevel,       setLogLevel]       = useState<LogLevel>("ALL");
  const [logSearch,      setLogSearch]      = useState("");
  const [logSearchMode,  setLogSearchMode]  = useState(false);
  const [regexMode,      setRegexMode]      = useState(false);
  const [showTimestamps, setShowTimestamps] = useState(false);
  const [wrapLines,      setWrapLines]      = useState(false);

  // ── Stream options ─────────────────────────────────────────────────────────
  const [tailIdx,      setTailIdx]      = useState(1);       // index into TAIL_OPTIONS
  const [sinceIdx,     setSinceIdx]     = useState(0);       // index into SINCE_OPTIONS
  const [showPrevious, setShowPrevious] = useState(false);

  const tailLines   = TAIL_OPTIONS[tailIdx];
  const sinceOption = SINCE_OPTIONS[sinceIdx];
  const sinceSeconds = sinceOption !== undefined ? sinceOption * 60 : undefined;

  const containerName = containers[activeContainer]?.name ?? "";

  // ── #18: Auto-enable previous logs for CrashLoopBackOff containers ─────────
  const activeCs = pod.status?.containerStatuses?.find(
    (s) => s.name === containerName,
  );
  const isCrashLoop =
    activeCs?.state?.waiting?.reason === "CrashLoopBackOff";

  useEffect(() => {
    if (isCrashLoop) {
      setShowPrevious(true);
      setFollow(false);
    } else {
      setShowPrevious(false);
      setFollow(true);
    }
    setScrollOffset(0);
  }, [containerName, isCrashLoop]);

  // Chrome: title(1) + meta(1) + labels(1) + log-header(1, includes hints + status)
  //       + round-border(2) + inner-border(1, containers box) = 7, plus 1 row
  //       per container shown (capped at 4). Previously this constant also
  //       baked a worst-case "4" into itself while separately adding
  //       Math.min(containers.length, 4) again — double-counting container
  //       rows and needlessly shrinking the visible log area.
  const CHROME   = 7 + Math.min(containers.length, 4);
  const availableRows = maxHeight ?? stdout?.rows ?? 30;
  const logLines = Math.max(5, availableRows - CHROME);

  // ── Log stream ─────────────────────────────────────────────────────────────
  const { lines, error: logError } = useLogStream(
    kubeConfig,
    namespace,
    podName,
    containerName,
    { tailLines, timestamps: true, previous: showPrevious, sinceSeconds },
  );

  // ── Derived display lines ──────────────────────────────────────────────────
  const displayLines = useMemo((): DisplayLine[] => {
    let items: DisplayLine[] = lines.map((raw) => ({
      display: showTimestamps ? raw : stripTs(raw),
      content: stripTs(raw),
    }));

    // Level filter
    if (logLevel !== "ALL") {
      const kws = LEVEL_KEYWORDS[logLevel];
      items = items.filter(({ content }) =>
        kws.some((kw) => content.toLowerCase().includes(kw)),
      );
    }

    // Search filter
    if (logSearch) {
      if (regexMode) {
        try {
          const re = new RegExp(logSearch, "i");
          items = items.filter(({ content }) => re.test(content));
        } catch {
          items = [];
        }
      } else {
        const q = logSearch.toLowerCase();
        items = items.filter(({ content }) => content.toLowerCase().includes(q));
      }
    }

    return items;
  }, [lines, logLevel, logSearch, regexMode, showTimestamps]);

  const maxOffset      = Math.max(0, displayLines.length - logLines);
  const effectiveOffset = follow
    ? maxOffset
    : Math.min(scrollOffset, maxOffset);
  const visibleLines   = displayLines.slice(effectiveOffset, effectiveOffset + logLines);

  // Keep scrollOffset pinned to the live bottom while following, so the
  // first manual scroll (↑) after opening/streaming moves up by one line
  // from where the view actually is — instead of jumping from a stale
  // scrollOffset (e.g. 0, from before any lines had arrived).
  useEffect(() => {
    if (follow) setScrollOffset(maxOffset);
  }, [follow, maxOffset]);

  const scrollPercent =
    displayLines.length <= logLines
      ? 100
      : Math.round((effectiveOffset / maxOffset) * 100);

  // ── Key input ──────────────────────────────────────────────────────────────
  useInput((input, key) => {
    // Search mode captures all keys
    if (logSearchMode) {
      if (key.escape) {
        setLogSearchMode(false);
        setLogSearch("");
      } else if (key.return) {
        setLogSearchMode(false);
      } else if (key.backspace || key.delete) {
        setLogSearch((q) => q.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setLogSearch((q) => q + input);
      }
      return;
    }

    if (key.escape) { onClose(); return; }

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
      // Scroll
      if (key.upArrow) {
        setFollow(false);
        setScrollOffset((o) => Math.max(0, o - 1));
      }
      if (key.downArrow) {
        const next = Math.min(maxOffset, scrollOffset + 1);
        setScrollOffset(next);
        if (next >= maxOffset) setFollow(true);
      }
      if (input === "g") { setScrollOffset(0);        setFollow(false); }
      if (input === "G") { setScrollOffset(maxOffset); setFollow(true);  }
      if (input === "f") setFollow((v) => !v);

      // Search
      if (input === "/") { setLogSearchMode(true); setLogSearch(""); }
      if (input === "r") setRegexMode((v) => !v);

      // Display toggles
      if (input === "l") {
        setLogLevel((cur) => nextLevel(cur));
        setScrollOffset(0);
        setFollow(true);
      }
      if (input === "t") setShowTimestamps((v) => !v);
      if (input === "w") setWrapLines((v) => !v);

      // Stream options (restart stream)
      if (input === "+" || input === "=") {
        setTailIdx((i) => Math.min(TAIL_OPTIONS.length - 1, i + 1));
        setScrollOffset(0);
        setFollow(true);
      }
      if (input === "-") {
        setTailIdx((i) => Math.max(0, i - 1));
        setScrollOffset(0);
        setFollow(true);
      }
      if (input === "s") {
        setSinceIdx((i) => (i + 1) % SINCE_OPTIONS.length);
        setScrollOffset(0);
        setFollow(true);
      }
      if (input === "p") {
        setShowPrevious((v) => {
          // Switching to previous: force follow off (prev logs are finite)
          if (!v) setFollow(false);
          else    setFollow(true);
          return !v;
        });
        setScrollOffset(0);
      }

      // #10 — Export logs to file
      if (input === "e") {
        const dir = path.join(os.homedir(), "kube-inspector-logs");
        const filename = `${podName}-${containerName}-${Date.now()}.log`;
        const filepath = path.join(dir, filename);
        const content = displayLines.map((d) => d.display).join("\n");
        fs.mkdir(dir, { recursive: true })
          .then(() => fs.writeFile(filepath, content, "utf-8"))
          .then(() => {
            setExportMsg(`Exported → ${filepath}`);
            setTimeout(() => setExportMsg(null), 4000);
          })
          .catch((err) => {
            setExportMsg(`Export failed: ${String(err)}`);
            setTimeout(() => setExportMsg(null), 4000);
          });
      }

      // #5 — Restart history graph
      if (input === "h") setShowRestartGraph((v) => !v);

      // Usage (CPU/mem) history graph
      if (input === "u") setShowUsageGraph((v) => !v);
    }
  });

  // ── Derived pod metadata ───────────────────────────────────────────────────
  const phase      = pod.status?.phase ?? "Unknown";
  const phaseColor = phase === "Running" ? "green" : phase === "Pending" ? "yellow" : "red";
  const podIP      = pod.status?.podIP   ?? "-";
  const nodeName   = pod.spec?.nodeName  ?? "-";
  const labels     = pod.metadata?.labels ?? {};
  const labelStr   = Object.entries(labels).map(([k, v]) => `${k}=${v}`).join("  ");

  // ── Render helpers ─────────────────────────────────────────────────────────

  /** Highlight a single display line for search matches */
  function renderLine(dl: DisplayLine, idx: number) {
    const { display, content } = dl;
    const color    = levelColor(detectLineLevel(content));
    const wrapProp = wrapLines ? "wrap" : "truncate";

    if (!logSearch) {
      return (
        <Text key={idx} color={color} dimColor={!color} wrap={wrapProp}>
          {display}
        </Text>
      );
    }

    // Regex highlight
    if (regexMode) {
      try {
        const re  = new RegExp(`(${logSearch})`, "gi");
        const parts = display.split(re);
        return (
          <Text key={idx} color={color} dimColor={!color} wrap={wrapProp}>
            {parts.map((part, pi) =>
              re.test(part) ? (
                <Text key={pi} backgroundColor="yellow" color="black">{part}</Text>
              ) : (
                part
              ),
            )}
          </Text>
        );
      } catch {
        return <Text key={idx} color={color} dimColor={!color} wrap={wrapProp}>{display}</Text>;
      }
    }

    // Plain-string highlight
    const q   = logSearch.toLowerCase();
    const pos = display.toLowerCase().indexOf(q);
    if (pos === -1) {
      return <Text key={idx} color={color} dimColor={!color} wrap={wrapProp}>{display}</Text>;
    }
    return (
      <Text key={idx} color={color} dimColor={!color} wrap={wrapProp}>
        {display.slice(0, pos)}
        <Text backgroundColor="yellow" color="black">
          {display.slice(pos, pos + logSearch.length)}
        </Text>
        {display.slice(pos + logSearch.length)}
      </Text>
    );
  }

  // ── Status badges shown in log header ──────────────────────────────────────
  const badges: React.ReactNode[] = [];
  if (logLevel !== "ALL")
    badges.push(<Text key="lvl" color={levelColor(logLevel as Exclude<LogLevel,"ALL">)} bold> [{logLevel}]</Text>);
  if (showPrevious)
    badges.push(<Text key="prev" color="magenta" bold> [PREV]</Text>);
  if (sinceOption !== undefined)
    badges.push(<Text key="since" color="cyan" dimColor> [{sinceOption}m]</Text>);
  if (showTimestamps)
    badges.push(<Text key="ts" color="cyan" dimColor> [TS]</Text>);
  if (wrapLines)
    badges.push(<Text key="wrap" color="cyan" dimColor> [WRAP]</Text>);
  if (regexMode)
    badges.push(<Text key="re" color="yellow" dimColor> [RE]</Text>);

  // ── JSX ───────────────────────────────────────────────────────────────────

  // Show restart graph overlay
  if (showRestartGraph && restartHistory) {
    return (
      <RestartGraph
        pod={pod}
        history={restartHistory}
        onClose={() => setShowRestartGraph(false)}
      />
    );
  }

  // Show CPU/mem usage history overlay
  if (showUsageGraph) {
    return (
      <UsageGraph
        pod={pod}
        history={metricsHistory}
        onClose={() => setShowUsageGraph(false)}
        maxHeight={maxHeight}
      />
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={isCrashLoop ? "red" : "cyan"} flexGrow={1}>
      {/* Title bar */}
      <Box justifyContent="space-between" paddingX={1}>
        <Box>
          <Text bold color={isCrashLoop ? "red" : "cyan"}>Pod: </Text>
          <Text bold>{podName}</Text>
          <Text dimColor> ns: {namespace}</Text>
          {isCrashLoop && (
            <Text color="red" bold> ⚠ CRASHLOOP</Text>
          )}
        </Box>
        <Box>
          {containers.length > 1 && (
            <Text dimColor>[m] {splitMode ? "single" : "split"} logs </Text>
          )}
          <Text dimColor>[u] Usage  [h] History  [e] Export  [Esc] Close</Text>
        </Box>
      </Box>

      {/* #18 Crash detail banner */}
      {isCrashLoop && activeCs?.lastState?.terminated && (() => {
        const t = activeCs.lastState.terminated;
        return (
          <Box paddingX={1} borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderBottom={true}>
            <Text color="red" bold>Last crash: </Text>
            <Text color="yellow">exit {t.exitCode ?? "?"} </Text>
            {t.reason && <Text color="yellow">{t.reason} </Text>}
            {t.message && <Text dimColor>{t.message.slice(0, 60)} </Text>}
            {t.finishedAt && <Text dimColor>finished {formatAge(t.finishedAt)} ago</Text>}
          </Box>
        );
      })()}

      {/* Export confirmation */}
      {exportMsg && (
        <Box paddingX={1}>
          <Text color={exportMsg.startsWith("Export failed") ? "red" : "green"}>
            {exportMsg}
          </Text>
        </Box>
      )}

      {/* Metadata row — no border here; the containers box below already
          provides the single visual break before the log section */}
      <Box paddingX={1}>
        <Text color={phaseColor}>● {phase} </Text>
        <Text dimColor>IP: </Text><Text>{podIP} </Text>
        <Text dimColor>Node: </Text>
        <Text>{nodeName.length > 24 ? nodeName.slice(0, 23) + "…" : nodeName}{"  "}</Text>
        <Text dimColor>Age: {formatAge(pod.metadata?.creationTimestamp)}</Text>
      </Box>

      {/* Labels */}
      {labelStr ? (
        <Box paddingX={1}>
          <Text dimColor>Labels: </Text>
          <Text>{labelStr.length > 100 ? labelStr.slice(0, 99) + "…" : labelStr}</Text>
        </Box>
      ) : null}

      {/* Containers summary */}
      <Box flexDirection="column" paddingX={1} borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} borderBottom={true}>
        {containers.slice(0, 4).map((c, i) => {
          const cs       = pod.status?.containerStatuses?.find((s) => s.name === c.name);
          const isActive = i === activeContainer && !splitMode;
          const image    = c.image ?? "";
          const shortImg = (image.split("/").pop() ?? image).slice(0, 26);
          const cpuR     = c.resources?.requests?.["cpu"]    ?? "-";
          const memR     = c.resources?.requests?.["memory"] ?? "-";
          const cpuL     = c.resources?.limits?.["cpu"]      ?? "-";
          const memL     = c.resources?.limits?.["memory"]   ?? "-";
          const restarts = cs?.restartCount ?? 0;
          return (
            <Box key={c.name}>
              <Text color={isActive ? "cyan" : "gray"}>{isActive ? "▶ " : "  "}</Text>
              <Text bold={isActive} color={isActive ? "cyan" : undefined}>{c.name}</Text>
              <Text dimColor> {shortImg}</Text>
              <Text color={cs?.ready ? "green" : "red"}>{cs?.ready ? "  ● Ready" : "  ● NotReady"}</Text>
              <Text dimColor>{"  cpu "}{cpuR}/{cpuL}{"  mem "}{memR}/{memL}</Text>
              {restarts > 0 && <Text color="yellow"> ↺{restarts}</Text>}
            </Box>
          );
        })}
        {containers.length > 4 && (
          <Text dimColor> … {containers.length - 4} more containers</Text>
        )}
      </Box>

      {/* Log area */}
      {splitMode ? (
        <>
          <SplitLogView pod={pod} kubeConfig={kubeConfig} logLevel={logLevel} />
          <Box paddingX={1}>
            <Text dimColor>[m] Single Mode  [Esc] Close — all containers auto-follow</Text>
          </Box>
        </>
      ) : (
        <Box flexDirection="column" flexGrow={1}>
          {/* Log header — title/badges, key hints, and live status all on one line */}
          <Box paddingX={1} justifyContent="space-between">
            {logSearchMode ? (
              <Box>
                {regexMode && <Text color="yellow" bold>re</Text>}
                <Text color="cyan" bold>/ </Text>
                <Text>{logSearch}</Text>
                <Text color="cyan">█</Text>
              </Box>
            ) : logSearch ? (
              <Box>
                <Text color="yellow">{regexMode ? "re/" : "/"}{logSearch}</Text>
                <Text dimColor> {displayLines.length} match  esc clear</Text>
              </Box>
            ) : (
              <Box>
                <Text dimColor bold>Logs ({containerName})</Text>
                {badges}
              </Box>
            )}
            <Text dimColor>
              [↑↓][g/G] Scroll  [f] Follow  [/] Search  [r] Regex  [l] Level  [t] Timestamps  [w] Wrap  [s] Since  [p] Prev  [+/-] Tail({tailLines})
              {containers.length > 1 ? "  [[] []] Ctr" : ""}
            </Text>
            <Box>
              {showPrevious ? (
                <Text color="magenta">◀ previous</Text>
              ) : follow ? (
                <Text color="green">● follow</Text>
              ) : (
                <Text color="yellow">⏸ paused</Text>
              )}
              <Text dimColor>
                {"  "}{effectiveOffset + 1}-
                {Math.min(effectiveOffset + logLines, displayLines.length)}/
                {displayLines.length}
                {"  "}{scrollPercent}%
                {"  tail:"}{tailLines}
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
                  : showPrevious
                  ? "No previous logs found"
                  : "Waiting for logs..."}
              </Text>
            )}
            {visibleLines.map((dl, i) => renderLine(dl, effectiveOffset + i))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
