import React, { useState, useEffect } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { StatusBadge } from "./StatusBadge.js";
import { HealthStatus } from "../utils/health.js";
import { formatAge } from "../utils/format.js";

export interface ResourceRow {
  uid: string;
  name: string;
  namespace: string;
  status: HealthStatus;
  creationTimestamp?: Date | string;
  extra?: string;
  extra2?: string;
  extra3?: string;
}

interface ResourceTableProps {
  rows: ResourceRow[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onActivate: (row: ResourceRow) => void;
  selectedUids?: Set<string>;
  onToggleSelect?: (row: ResourceRow) => void;
  maxHeight?: number;
  mutationsEnabled: boolean;
  loading?: boolean;
  resourceLabel?: string;
  extraLabel?: string;
  extra2Label?: string;
  extra3Label?: string;
}

const COL_AGE = 6;

const STATUS_LABEL: Record<HealthStatus, string> = {
  [HealthStatus.Healthy]: "● Healthy ",
  [HealthStatus.Degraded]: "● Degraded",
  [HealthStatus.Critical]: "● Critical",
};

const STATUS_COLOR: Record<HealthStatus, string> = {
  [HealthStatus.Healthy]: "green",
  [HealthStatus.Degraded]: "yellow",
  [HealthStatus.Critical]: "red",
};

function padEnd(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len - 1) + " " : str.padEnd(len);
}

function computeColumns(terminalWidth: number): {
  colName: number;
  colNs: number;
  colExtra: number;
  colExtra2: number;
  colExtra3: number;
  showExtra3: boolean;
} {
  // Reserve: checkbox(2) + status(12) + age(6) + paddingX(2) + gaps(4) = 26
  const available = Math.max(60, terminalWidth) - 26;
  const showExtra3 = terminalWidth >= 100;
  if (showExtra3) {
    // Distribute all available space across 4 variable columns
    const colName = Math.max(24, Math.floor(available * 0.32));
    const colNs = Math.max(14, Math.floor(available * 0.17));
    const colExtra = Math.max(12, Math.floor(available * 0.2));
    const colExtra2 = Math.max(12, Math.floor(available * 0.2));
    const colExtra3 = Math.max(
      10,
      available - colName - colNs - colExtra - colExtra2,
    );
    return { colName, colNs, colExtra, colExtra2, colExtra3, showExtra3 };
  } else {
    const colName = Math.max(24, Math.floor(available * 0.4));
    const colNs = Math.max(14, Math.floor(available * 0.22));
    const colExtra = Math.max(12, Math.floor(available * 0.23));
    const colExtra2 = Math.max(10, available - colName - colNs - colExtra);
    return { colName, colNs, colExtra, colExtra2, colExtra3: 0, showExtra3 };
  }
}

function ProgressBar({
  start,
  visible,
  total,
}: {
  start: number;
  visible: number;
  total: number;
}) {
  const barWidth = 10;
  const maxStart = Math.max(1, total - visible);
  const filled = Math.round((start / maxStart) * barWidth);
  const safeFilled = Math.min(barWidth, Math.max(0, filled));
  return (
    <Text dimColor>
      {"[" +
        "█".repeat(safeFilled) +
        "░".repeat(barWidth - safeFilled) +
        "]" +
        ` ${start + 1}\u2013${Math.min(start + visible, total)}/${total}`}
    </Text>
  );
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <Text>{text}</Text>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <Text>{text}</Text>;
  return (
    <>
      <Text>{text.slice(0, idx)}</Text>
      <Text backgroundColor="yellow" color="black" bold>
        {text.slice(idx, idx + query.length)}
      </Text>
      <Text>{text.slice(idx + query.length)}</Text>
    </>
  );
}

export function ResourceTable({
  rows,
  selectedIndex,
  onSelect,
  onActivate,
  selectedUids,
  onToggleSelect,
  favouriteUids,
  onToggleFavourite,
  maxHeight,
  mutationsEnabled,
  loading,
  resourceLabel,
  extraLabel = "DETAILS",
  extra2Label = "INFO",
  extra3Label = "MORE",
}: ResourceTableProps) {
  const { stdout } = useStdout();
  const { colName, colNs, colExtra, colExtra2, colExtra3, showExtra3 } =
    computeColumns(stdout?.columns ?? 120);
  const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  useEffect(() => {
    if (!loading) return;
    const id = setInterval(
      () => setSpinnerFrame((f) => (f + 1) % SPINNER_FRAMES.length),
      80,
    );
    return () => clearInterval(id);
  }, [loading]);

  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Local selection index — always relative to filteredRows
  const [localSelected, setLocalSelected] = useState(0);
  const [windowStart, setWindowStart] = useState(0);

  const filteredRows = searchQuery
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.namespace.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : rows;

  // Table-internal chrome: search bar(1) + marginBottom(1) + header(1) + border(1) + footer(1) + border(1) = 6
  const TABLE_CHROME = 6;
  const availableHeight = maxHeight ?? stdout?.rows ?? 24;
  const visibleCount = Math.max(5, availableHeight - TABLE_CHROME);

  // When search query changes, reset local selection and window to 0
  useEffect(() => {
    setLocalSelected(0);
    setWindowStart(0);
  }, [searchQuery]);

  // When not searching, keep local selection in sync with parent
  useEffect(() => {
    if (!searchQuery) setLocalSelected(selectedIndex);
  }, [selectedIndex, searchQuery]);

  const safeLocal = Math.min(
    localSelected,
    Math.max(0, filteredRows.length - 1),
  );

  // Slide the window to keep safeLocal in view
  useEffect(() => {
    setWindowStart((ws) => {
      if (safeLocal < ws) return safeLocal;
      if (safeLocal >= ws + visibleCount) return safeLocal - visibleCount + 1;
      return ws;
    });
  }, [safeLocal, visibleCount]);

  const visibleRows = filteredRows.slice(
    windowStart,
    windowStart + visibleCount,
  );

  function moveUp() {
    const next = Math.max(0, safeLocal - 1);
    setLocalSelected(next);
    // Map back to full-list index for parent
    const fullIdx = rows.indexOf(filteredRows[next]);
    if (fullIdx !== -1) onSelect(fullIdx);
  }

  function moveDown() {
    const next = Math.min(filteredRows.length - 1, safeLocal + 1);
    setLocalSelected(next);
    const fullIdx = rows.indexOf(filteredRows[next]);
    if (fullIdx !== -1) onSelect(fullIdx);
  }

  useInput((input, key) => {
    if (searchMode) {
      if (key.escape) {
        setSearchMode(false);
        setSearchQuery("");
      } else if (key.backspace || key.delete)
        setSearchQuery((q) => q.slice(0, -1));
      else if (key.return) setSearchMode(false);
      else if (input && !key.ctrl && !key.meta)
        setSearchQuery((q) => q + input);
      return;
    }
    if (input === "/") {
      setSearchMode(true);
      setSearchQuery("");
      return;
    }
    if (key.escape && searchQuery) {
      setSearchQuery("");
      return;
    }
    if (key.return && filteredRows[safeLocal]) {
      onActivate(filteredRows[safeLocal]);
      return;
    }
    if (input === " " && filteredRows[safeLocal] && onToggleSelect) {
      onToggleSelect(filteredRows[safeLocal]);
      return;
    }
    if (input === "*" && filteredRows[safeLocal] && onToggleFavourite) {
      onToggleFavourite(filteredRows[safeLocal]);
      return;
    }
    if (key.upArrow) moveUp();
    if (key.downArrow) moveDown();
  });

  const hasCritical = filteredRows.some(
    (r) => r.status === HealthStatus.Critical,
  );
  const hasDegraded = filteredRows.some(
    (r) => r.status === HealthStatus.Degraded,
  );

  return (
    <Box flexDirection="column">
      {/* Search bar */}
      <Box justifyContent="space-between" marginBottom={1}>
        {searchMode ? (
          <Box>
            <Text color="cyan" bold>
              /{" "}
            </Text>
            <Text bold>{searchQuery}</Text>
            <Text color="cyan" bold>
              █
            </Text>
            <Text dimColor> enter↵ confirm esc clear</Text>
          </Box>
        ) : searchQuery ? (
          <Box>
            <Text bold color="yellow">
              / {searchQuery}{" "}
            </Text>
            <Text dimColor>
              — {filteredRows.length}/{rows.length} match esc clear / edit
            </Text>
          </Box>
        ) : (
          <Text dimColor>/ to search</Text>
        )}
        {/* Summary badges */}
        <Box>
          {hasCritical && (
            <Text color="red" bold>
              {" "}
              ● {
                rows.filter((r) => r.status === HealthStatus.Critical).length
              }{" "}
              critical
            </Text>
          )}
          {hasDegraded && (
            <Text color="yellow">
              {" "}
              ● {
                rows.filter((r) => r.status === HealthStatus.Degraded).length
              }{" "}
              degraded
            </Text>
          )}
          <Text dimColor>
            {" "}
            {filteredRows.length}
            {searchQuery ? `/${rows.length}` : ""} total
          </Text>
          {selectedUids && selectedUids.size > 0 && (
            <Text color="magenta" bold>
              {"  "}☑ {selectedUids.size} selected [enter] view logs
            </Text>
          )}
          {filteredRows.length > visibleCount && (
            <ProgressBar
              start={windowStart}
              visible={visibleCount}
              total={filteredRows.length}
            />
          )}
        </Box>
      </Box>

      {/* Column headers */}
      <Box
        paddingX={1}
        borderStyle="single"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderBottom={true}
      >
        <Text bold color="cyan">
          {"   "}
          {padEnd("NAME", colName)}
          {padEnd("NAMESPACE", colNs)}
          {"STATUS      "}
          {padEnd("AGE", COL_AGE)}
          {padEnd(extraLabel, colExtra)}
          {padEnd(extra2Label, colExtra2)}
          {showExtra3 ? padEnd(extra3Label, colExtra3) : ""}
        </Text>
      </Box>

      {/* Loading / empty state */}
      {filteredRows.length === 0 && (
        <Box marginTop={1} paddingX={2}>
          {loading ? (
            <Text dimColor>
              {SPINNER_FRAMES[spinnerFrame]} Loading{" "}
              {resourceLabel ?? "resources"}...
            </Text>
          ) : (
            <Text dimColor>
              {searchQuery
                ? `No results for "/${searchQuery}"`
                : `No ${resourceLabel ?? "resources"} found`}
            </Text>
          )}
        </Box>
      )}

      {/* Rows — only the visible window */}
      {visibleRows.map((row, i) => {
        const absoluteIndex = windowStart + i;
        const isSelected = absoluteIndex === safeLocal;
        const isEven = absoluteIndex % 2 === 0;
        const isChecked = selectedUids?.has(row.uid) ?? false;
        const isFavourite = favouriteUids?.has(row.uid) ?? false;

        return (
          <Box key={row.uid} paddingX={1}>
            {/* Favourite star */}
            <Text color={isFavourite ? "yellow" : "gray"}>
              {isFavourite ? "★" : " "}
            </Text>
            {/* Checkbox */}
            <Text
              color={isChecked ? "magenta" : isSelected ? "cyan" : "gray"}
              bold={isChecked}
            >
              {isChecked ? "☑ " : isSelected ? "▶ " : "  "}
            </Text>

            {/* Name + namespace with search highlight */}
            <Box>
              <Text
                inverse={isSelected}
                color={isSelected ? "cyan" : isEven ? undefined : undefined}
                dimColor={!isSelected && !isEven}
                bold={isSelected}
              >
                {padEnd("", 0)}
              </Text>
              <Text
                inverse={isSelected}
                bold={isSelected}
                color={
                  isSelected
                    ? "cyan"
                    : row.status === HealthStatus.Critical
                      ? "red"
                      : undefined
                }
              >
                <HighlightText
                  text={padEnd(row.name, colName)}
                  query={searchQuery}
                />
              </Text>
              <Text
                inverse={isSelected}
                color={isSelected ? "cyan" : undefined}
                dimColor={!isSelected}
              >
                <HighlightText
                  text={padEnd(row.namespace, colNs)}
                  query={searchQuery}
                />
              </Text>
            </Box>

            {/* Status */}
            <Text
              color={isSelected ? "cyan" : STATUS_COLOR[row.status]}
              inverse={isSelected}
              bold={row.status === HealthStatus.Critical || isSelected}
            >
              {padEnd(STATUS_LABEL[row.status], 12)}
            </Text>

            {/* Age */}
            <Text
              inverse={isSelected}
              color={isSelected ? "cyan" : undefined}
              dimColor={!isSelected}
            >
              {padEnd(formatAge(row.creationTimestamp), COL_AGE)}
            </Text>

            {/* Extra / Extra2 */}
            {(row.extra || row.extra2) && (
              <Text
                inverse={isSelected}
                color={isSelected ? "cyan" : undefined}
                dimColor={!isSelected}
              >
                {padEnd(row.extra ?? "", colExtra)}
                {padEnd(row.extra2 ?? "", colExtra2)}
              </Text>
            )}

            {/* Extra3 — only on wide terminals */}
            {showExtra3 && (
              <Text
                inverse={isSelected}
                color={isSelected ? "cyan" : undefined}
                dimColor={!isSelected}
              >
                {padEnd(row.extra3 ?? "", colExtra3)}
              </Text>
            )}
          </Box>
        );
      })}

      {/* Footer hints */}
      <Box
        marginTop={1}
        paddingX={1}
        borderStyle="single"
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderTop={true}
      >
        <Text dimColor>
          ↑↓ navigate space select enter open
          {selectedUids && selectedUids.size > 1
            ? `  ${selectedUids.size} selected → enter`
            : ""}{" "}
          / search  * favourite
          {mutationsEnabled
            ? "  d delete  R restart  s scale  D force-del"
            : "  (read-only)"}
        </Text>
      </Box>
    </Box>
  );
}
