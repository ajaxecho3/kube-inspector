import React from "react";
import { Box, Text } from "ink";

export const TAB_LABELS = [
  "Pods",
  "Deployments",
  "Services",
  "Namespaces",
  "Nodes",
  "Events",
] as const;
export type TabIndex = 0 | 1 | 2 | 3 | 4 | 5;

export interface TabSummary {
  total: number;
  critical: number;
}

interface NavTabsProps {
  activeTab: number;
  onTabChange: (index: number) => void;
  tabSummaries?: TabSummary[];
}

export function NavTabs({ activeTab, tabSummaries }: NavTabsProps) {
  return (
    <Box
      borderStyle="single"
      borderBottom={false}
      paddingBottom={0.5}
      borderLeft={false}
      borderRight={false}
    >
      {TAB_LABELS.map((label, i) => {
        const summary = tabSummaries?.[i];
        const isActive = i === activeTab;

        return (
          <Box
            key={label}
            marginRight={1}
            borderStyle={isActive ? "single" : undefined}
            borderColor={isActive ? "cyan" : undefined}
            borderTop={false}
            borderLeft={false}
            borderRight={false}
            borderBottom={isActive}
          >
            <Text bold={isActive} color={isActive ? "cyan" : undefined}>
              {` ${label}`}
            </Text>
            {summary !== undefined && (
              <Text dimColor color={isActive ? "cyan" : undefined}>
                {`(${summary.total})`}
              </Text>
            )}
            {summary !== undefined && summary.critical > 0 && (
              <Text color="red" bold>
                {` ⚠${summary.critical}`}
              </Text>
            )}
            <Text bold={isActive} color={isActive ? "cyan" : undefined}>
              {" "}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
