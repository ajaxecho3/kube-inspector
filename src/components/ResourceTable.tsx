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
}

const COL_EXTRA = 18;

interface ResourceTableProps {
  rows: ResourceRow[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onActivate: (row: ResourceRow) => void;
  selectedUids?: Set<string>;
  onToggleSelect?: (row: ResourceRow) => void;
  maxHeight?: number;
  mutationsEnabled: boolean;
}

const COL_NAME = 32;
const COL_NS = 20;
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
  maxHeight,
  mutationsEnabled,
}: ResourceTableProps) {
  const { stdout } = useStdout();
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
  const hasAbove = windowStart > 0;
  const hasBelow = windowStart + visibleCount < filteredRows.length;

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
          {padEnd("NAME", COL_NAME)}
          {padEnd("NAMESPACE", COL_NS)}
          {"STATUS      "}
          {padEnd("AGE", COL_AGE)}
          {padEnd("DETAILS", COL_EXTRA)}
          {"INFO"}
        </Text>
      </Box>

      {/* Empty state */}
      {filteredRows.length === 0 && (
        <Box marginTop={1} paddingX={2}>
          <Text dimColor>
            {searchQuery
              ? `No matches for "${searchQuery}"`
              : "No resources found"}
          </Text>
        </Box>
      )}

      {/* Scroll indicator — above */}
      {hasAbove && (
        <Box paddingX={2}>
          <Text dimColor>↑ {windowStart} more above</Text>
        </Box>
      )}

      {/* Rows — only the visible window */}
      {visibleRows.map((row, i) => {
        const absoluteIndex = windowStart + i;
        const isSelected = absoluteIndex === safeLocal;
        const isEven = absoluteIndex % 2 === 0;
        const isChecked = selectedUids?.has(row.uid) ?? false;

        return (
          <Box key={row.uid} paddingX={1}>
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
                color={isSelected ? "cyan" : undefined}
              >
                <HighlightText
                  text={padEnd(row.name, COL_NAME)}
                  query={searchQuery}
                />
              </Text>
              <Text
                inverse={isSelected}
                color={isSelected ? "cyan" : "gray"}
                dimColor={!isSelected}
              >
                <HighlightText
                  text={padEnd(row.namespace, COL_NS)}
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
              color={isSelected ? "cyan" : "gray"}
              dimColor={!isSelected}
            >
              {padEnd(formatAge(row.creationTimestamp), COL_AGE)}
            </Text>

            {/* Extra / Extra2 */}
            {(row.extra || row.extra2) && (
              <Text
                inverse={isSelected}
                color={isSelected ? "cyan" : "gray"}
                dimColor={!isSelected}
              >
                {padEnd(row.extra ?? "", COL_EXTRA)}
                {row.extra2 ?? ""}
              </Text>
            )}
          </Box>
        );
      })}

      {/* Scroll indicator — below */}
      {hasBelow && (
        <Box paddingX={2}>
          <Text dimColor>
            ↓ {filteredRows.length - windowStart - visibleCount} more below
          </Text>
        </Box>
      )}

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
          / search
          {mutationsEnabled
            ? "  d delete  R restart  s scale  D force-del"
            : "  (read-only)"}
        </Text>
      </Box>
    </Box>
  );
}
