import React from "react";
import { Box, Text, useInput } from "ink";

interface ConfirmModalProps {
  title: string;
  description: string;
  isProduction: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  description,
  isProduction,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useInput((input, key) => {
    if (input === "y") {
      onConfirm();
    } else if (key.escape || input === "n") {
      onCancel();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={isProduction ? "red" : "yellow"}
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
      <Text bold>{title}</Text>
      <Box marginY={1}>
        <Text>{description}</Text>
      </Box>
      <Text dimColor>This action cannot be undone.</Text>
      <Box marginTop={1}>
        <Text color="green">[y] Confirm</Text>
        <Text> </Text>
        <Text color="red">[n / Esc] Cancel</Text>
      </Box>
    </Box>
  );
}
