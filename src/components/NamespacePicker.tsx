import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface NamespacePickerProps {
  namespaces: string[];
  currentNamespace: string;
  onSelect: (ns: string) => void;
  onClose: () => void;
}

export function NamespacePicker({
  namespaces,
  currentNamespace,
  onSelect,
  onClose,
}: NamespacePickerProps) {
  const options = ["all", ...namespaces];
  const [cursor, setCursor] = useState(
    Math.max(0, options.indexOf(currentNamespace)),
  );

  useInput((_input, key) => {
    if (key.upArrow) setCursor((i) => Math.max(0, i - 1));
    if (key.downArrow) setCursor((i) => Math.min(options.length - 1, i + 1));
    if (key.return) onSelect(options[cursor]);
    if (key.escape) onClose();
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Text bold color="cyan">
        Select namespace
      </Text>
      <Text dimColor>↑↓ Navigate  Enter Select  Esc Cancel</Text>
      <Box flexDirection="column" marginTop={1}>
        {options.map((ns, i) => {
          const isActive = i === cursor;
          const isCurrent = ns === currentNamespace;
          return (
            <Box key={ns}>
              <Text color={isActive ? "cyan" : undefined} bold={isActive}>
                {isActive ? "▶ " : "  "}
                {ns}
                {isCurrent ? " (current)" : ""}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
