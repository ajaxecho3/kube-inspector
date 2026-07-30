import React from "react";
import { Box, Text, useInput } from "ink";
import type { V1Pod } from "@kubernetes/client-node";
import type { RestartHistory } from "../hooks/useRestartHistory.js";
import { formatAge } from "../utils/format.js";
import { sparkline } from "../utils/sparkline.js";

interface RestartGraphProps {
  pod: V1Pod;
  history: RestartHistory;
  onClose: () => void;
}

export function RestartGraph({ pod, history, onClose }: RestartGraphProps) {
  useInput((_input, key) => {
    if (key.escape) onClose();
  });

  const uid = pod.metadata?.uid ?? "";
  const podHistory = history.get(uid) ?? new Map<string, { ts: number; count: number }[]>();
  const containers = pod.spec?.containers ?? [];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
    >
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          Restart History — {pod.metadata?.name}
        </Text>
        <Text dimColor>[Esc] close</Text>
      </Box>

      <Box
        marginTop={1}
        borderStyle="single"
        borderTop={false}
        borderLeft={false}
        borderRight={false}
        borderBottom={true}
      >
        <Text bold color="cyan">
          {"  CONTAINER             RESTARTS  SPARKLINE (session)   LAST EXIT"}
        </Text>
      </Box>

      {containers.map((c) => {
        const cs = pod.status?.containerStatuses?.find((s) => s.name === c.name);
        const restarts = cs?.restartCount ?? 0;
        const snapshots = podHistory.get(c.name) ?? [];
        const spark = sparkline(snapshots.map((s) => s.count));
        const last = cs?.lastState?.terminated;
        const exitInfo = last
          ? `exit:${last.exitCode ?? "?"} ${last.reason ?? ""} ${
              last.finishedAt ? formatAge(last.finishedAt) + " ago" : ""
            }`
          : "—";
        const isCrash =
          cs?.state?.waiting?.reason === "CrashLoopBackOff";

        return (
          <Box key={c.name} marginTop={1} flexDirection="column">
            <Box>
              <Text color={isCrash ? "red" : restarts > 0 ? "yellow" : "green"}>
                {isCrash ? "⚠ " : "  "}
              </Text>
              <Text bold={isCrash} color={isCrash ? "red" : undefined}>
                {c.name.padEnd(22)}
              </Text>
              <Text
                color={
                  restarts > 10 ? "red" : restarts > 3 ? "yellow" : "green"
                }
                bold={restarts > 0}
              >
                {String(restarts).padEnd(10)}
              </Text>
              <Text color="cyan">{spark.padEnd(22)}</Text>
              <Text dimColor>{exitInfo}</Text>
            </Box>
            {last && (
              <Box>
                <Text dimColor>
                  {"    "}Started:{" "}
                  {last.startedAt
                    ? new Date(last.startedAt).toISOString()
                    : "—"}
                  {"  "}Finished:{" "}
                  {last.finishedAt
                    ? new Date(last.finishedAt).toISOString()
                    : "—"}
                </Text>
              </Box>
            )}
          </Box>
        );
      })}

      {containers.length === 0 && (
        <Text dimColor marginTop={1}>
          No container data available.
        </Text>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          Sparkline shows restart counts sampled every 15s during this session.
          Each bar represents one recorded change.
        </Text>
      </Box>
    </Box>
  );
}
