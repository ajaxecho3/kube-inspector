import React, { useEffect } from "react";
import { Box, Text, useInput } from "ink";

interface AlertBannerProps {
  message: string;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 5000;

export function AlertBanner({ message, onDismiss }: AlertBannerProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  useInput((_, key) => {
    if (key.escape) onDismiss();
  });

  return (
    <Box borderStyle="round" borderColor="red" paddingX={1}>
      <Text color="red" bold>
        ⚠ ALERT:{" "}
      </Text>
      <Text>{message}</Text>
      <Text dimColor> [Esc] dismiss</Text>
    </Box>
  );
}
