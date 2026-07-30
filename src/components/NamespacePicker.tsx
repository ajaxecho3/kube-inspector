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
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Text bold>Select Namespace</Text>

      <Box marginTop={1} flexDirection="column">
        {options.map((ns, i) => (
          <Text
            key={ns}
            color={i === cursor ? "cyan" : undefined}
            inverse={i === cursor}
          >
            {i === cursor ? "▶ " : "  "}
            {ns}
            {ns === currentNamespace ? " (current)" : ""}
          </Text>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>[↑↓] Navigate  [Enter] Select  [Esc] Cancel</Text>
      </Box>
    </Box>
  );
}
