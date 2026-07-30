import React, { useState } from "react";
import { Box, Text, useInput } from "ink";

interface ScaleModalProps {
  name: string;
  namespace: string;
  currentReplicas: number;
  maxReplicas: number;
  isProduction: boolean;
  onConfirm: (replicas: number) => void;
  onCancel: () => void;
}

export function ScaleModal({
  name,
  namespace,
  currentReplicas,
  maxReplicas,
  isProduction,
  onConfirm,
  onCancel,
}: ScaleModalProps) {
  const [replicas, setReplicas] = useState(currentReplicas);

  useInput((input, key) => {
    if (key.upArrow || input === "+" || input === "=") {
      setReplicas((r) => Math.min(maxReplicas, r + 1));
    } else if (key.downArrow || input === "-") {
      setReplicas((r) => Math.max(0, r - 1));
    } else if (key.return) {
      onConfirm(replicas);
    } else if (key.escape || input === "n") {
      onCancel();
    }
  });

  const barWidth = 20;
  const filled = maxReplicas > 0
    ? Math.min(barWidth, Math.max(0, Math.round((replicas / maxReplicas) * barWidth)))
    : 0;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isProduction ? "red" : "cyan"}
      paddingX={2}
      paddingY={1}
    >
      {isProduction && (
        <Box marginBottom={1}>
          <Text color="red" bold>
            ⚠ [PRODUCTION] — extra care required
          </Text>
        </Box>
      )}
      <Text bold>Scale Deployment</Text>
      <Box marginY={1}>
        <Text>
          {name} <Text dimColor>({namespace})</Text>
        </Text>
      </Box>
      <Box>
        <Text color="cyan" bold>
          {replicas}
        </Text>
        <Text dimColor>
          {" "}
          replicas [{"█".repeat(filled)}
          {"░".repeat(barWidth - filled)}] max {maxReplicas}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[↑/+] Increase  [↓/-] Decrease  </Text>
        <Text color="green">[Enter] Confirm</Text>
        <Text> </Text>
        <Text color="red">[Esc] Cancel</Text>
      </Box>
    </Box>
  );
}
