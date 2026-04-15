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

interface NavTabsProps {
  activeTab: number;
  onTabChange: (index: number) => void;
}

export function NavTabs({ activeTab }: NavTabsProps) {
  return (
    <Box borderStyle="single" borderBottom={false}>
      {TAB_LABELS.map((label, i) => (
        <Box key={label} marginRight={1}>
          <Text
            bold={i === activeTab}
            underline={i === activeTab}
            color={i === activeTab ? "cyan" : undefined}
          >
            {` ${label} `}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
