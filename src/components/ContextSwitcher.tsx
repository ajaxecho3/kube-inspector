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

  useInput((input, key) => {
    if (key.upArrow && selectedIndex > 0) setSelectedIndex((i) => i - 1);
    if (key.downArrow && selectedIndex < contexts.length - 1)
      setSelectedIndex((i) => i + 1);
    if (key.return) onSelect(contexts[selectedIndex]);
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
      <Box marginTop={1} flexDirection="column">
        {contexts.map((ctx, i) => (
          <Text
            key={ctx}
            color={i === selectedIndex ? "cyan" : undefined}
            inverse={i === selectedIndex}
          >
            {i === selectedIndex ? "▶ " : "  "}
            {ctx}
            {ctx === currentContext ? " (current)" : ""}
          </Text>
        ))}
        {contexts.length === 0 && (
          <Text dimColor>No contexts found in kubeconfig.</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[↑↓] Navigate [Enter] Select [Esc] Cancel</Text>
      </Box>
    </Box>
  );
}
