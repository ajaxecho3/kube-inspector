import React from "react";
import { Text } from "ink";
import { HealthStatus } from "../utils/health.js";

const STATUS_COLOR: Record<HealthStatus, string> = {
  [HealthStatus.Healthy]: "green",
  [HealthStatus.Degraded]: "yellow",
  [HealthStatus.Critical]: "red",
};

interface StatusBadgeProps {
  status: HealthStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return <Text color={STATUS_COLOR[status]}>●</Text>;
}
