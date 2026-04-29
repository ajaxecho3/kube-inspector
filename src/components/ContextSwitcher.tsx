import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface ContextSwitcherProps {
  contexts: string[];
  currentContext: string;
  onSelect: (context: string) => void;
  onClose: () => void;
}

export function ContextSwitcher({
  contexts,
  currentContext,
  onSelect,
  onClose,
}: ContextSwitcherProps) {
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, contexts.indexOf(currentContext)),
  );
  const [filterMode, setFilterMode] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  const filteredContexts = filterQuery
    ? contexts.filter((c) =>
        c.toLowerCase().includes(filterQuery.toLowerCase()),
      )
    : contexts;

  const safeIndex = Math.min(
    selectedIndex,
    Math.max(0, filteredContexts.length - 1),
  );

  useInput((input, key) => {
    if (filterMode) {
      if (key.escape) {
        setFilterMode(false);
        setFilterQuery("");
      } else if (key.return) {
        setFilterMode(false);
      } else if (key.backspace || key.delete) {
        setFilterQuery((q) => q.slice(0, -1));
      } else if (input && !key.ctrl && !key.meta) {
        setFilterQuery((q) => q + input);
        setSelectedIndex(0);
      }
      return;
    }

    if (input === "/") {
      setFilterMode(true);
      setFilterQuery("");
      setSelectedIndex(0);
      return;
    }
    if (key.escape && filterQuery) {
      setFilterQuery("");
      setSelectedIndex(0);
      return;
    }
    if (key.upArrow && safeIndex > 0) setSelectedIndex((i) => i - 1);
    if (key.downArrow && safeIndex < filteredContexts.length - 1)
      setSelectedIndex((i) => i + 1);
    if (key.return && filteredContexts[safeIndex])
      onSelect(filteredContexts[safeIndex]);
    if (key.escape) onClose();
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Text bold>Select Context</Text>

      {/* Filter bar */}
      <Box marginTop={1}>
        {filterMode ? (
          <Box>
            <Text color="cyan" bold>
              /{" "}
            </Text>
            <Text bold>{filterQuery}</Text>
            <Text color="cyan" bold>
              █
            </Text>
            <Text dimColor> enter↵ confirm esc clear</Text>
          </Box>
        ) : filterQuery ? (
          <Box>
            <Text color="yellow" bold>
              / {filterQuery}{" "}
            </Text>
            <Text dimColor>
              — {filteredContexts.length}/{contexts.length} match esc clear /
              edit
            </Text>
          </Box>
        ) : (
          <Text dimColor>/ to filter</Text>
        )}
      </Box>

      <Box marginTop={1} flexDirection="column">
        {filteredContexts.map((ctx, i) => (
          <Text
            key={ctx}
            color={i === safeIndex ? "cyan" : undefined}
            inverse={i === safeIndex}
          >
            {i === safeIndex ? "▶ " : "  "}
            {ctx}
            {ctx === currentContext ? " (current)" : ""}
          </Text>
        ))}
        {filteredContexts.length === 0 && (
          <Text dimColor>No contexts match "/{filterQuery}"</Text>
        )}
        {contexts.length === 0 && !filterQuery && (
          <Text dimColor>No contexts found in kubeconfig.</Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          [↑↓] Navigate [Enter] Select [/] Filter [Esc] Cancel
        </Text>
      </Box>
    </Box>
  );
}
