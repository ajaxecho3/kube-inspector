import { useState, useEffect } from "react";
import { Log, KubeConfig } from "@kubernetes/client-node";
import { PassThrough } from "node:stream";
import { stripVTControlCharacters } from "node:util";

const RING_BUFFER_SIZE = 500;
const RECONNECT_DELAY_MS = 2000;

export interface UseLogStreamResult {
  lines: string[];
  error: string | null;
}

export function useLogStream(
  kubeConfig: KubeConfig,
  namespace: string,
  podName: string,
  containerName: string,
): UseLogStreamResult {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Local closure flag — each effect run owns its own `active` variable,
    // so stale async callbacks from a previous run can never write to state.
    let active = true;
    let abortRequest: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    // Reset lines when the target (pod/container) changes
    setLines([]);
    setError(null);

    async function startStream() {
      if (!active) return;

      const log = new Log(kubeConfig);
      const logStream = new PassThrough();
      let buffer = "";

      logStream.on("data", (chunk: Buffer) => {
        if (!active) return;
        buffer += chunk.toString("utf-8");
        const allLines = buffer.split("\n");
        buffer = allLines.pop() ?? "";
        const newLines = allLines.filter(Boolean).map(stripVTControlCharacters);
        if (newLines.length > 0) {
          setLines((prev) => {
            const next = [...prev, ...newLines];
            return next.length > RING_BUFFER_SIZE
              ? next.slice(next.length - RING_BUFFER_SIZE)
              : next;
          });
        }
      });

      // Stream ended naturally (server closed the follow connection) — reconnect
      logStream.on("end", () => {
        if (!active) return;
        retryTimer = setTimeout(startStream, RECONNECT_DELAY_MS);
      });

      logStream.on("error", (err) => {
        if (!active) return;
        setError(String(err));
        retryTimer = setTimeout(startStream, RECONNECT_DELAY_MS);
      });

      try {
        const req = await log.log(
          namespace,
          podName,
          containerName,
          logStream,
          {
            follow: true,
            tailLines: 100,
          },
        );
        if (!active) {
          // Effect was cleaned up while we awaited — abort immediately
          (req as any).destroy?.();
          return;
        }
        abortRequest = () => (req as any).destroy?.();
        setError(null);
      } catch (err: unknown) {
        if (!active) return;
        setError(String(err));
        retryTimer = setTimeout(startStream, RECONNECT_DELAY_MS);
      }
    }

    startStream();

    return () => {
      active = false;
      if (retryTimer !== null) clearTimeout(retryTimer);
      abortRequest?.();
    };
  }, [kubeConfig, namespace, podName, containerName]);

  return { lines, error };
}
