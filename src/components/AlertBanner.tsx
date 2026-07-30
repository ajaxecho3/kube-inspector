import React, { useEffect } from "react";
import { Box, Text, useInput } from "ink";

interface AlertBannerProps {
  message: string;
  onDismiss: () => void;
  queueLength?: number;
}

const AUTO_DISMISS_MS = 5000;

export function AlertBanner({
  message,
  onDismiss,
  queueLength = 1,
}: AlertBannerProps) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  useInput((_, key) => {
    if (key.escape) onDismiss();
  });

  return (
    <Box paddingX={1}>
      <Text backgroundColor="red" color="white" bold>
        {" "}⚠ ALERT{" "}
      </Text>
      <Text color="red" bold>
        {" "}{message}
      </Text>
      <Text dimColor>
        {" [Esc] Dismiss"}
        {queueLength > 1 ? `  (+${queueLength - 1} more)` : ""}
      </Text>
    </Box>
  );
}
