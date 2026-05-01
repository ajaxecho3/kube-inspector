import { useState, useEffect } from "react";
import { Log, KubeConfig } from "@kubernetes/client-node";
import { PassThrough } from "node:stream";
import { stripVTControlCharacters } from "node:util";

const RING_BUFFER_SIZE = 500;
const RECONNECT_DELAY_MS = 2000;

export interface UseLogStreamOptions {
  /** How many historical lines to fetch on connect (default: 100) */
  tailLines?: number;
  /** Request RFC3339 timestamp prefix on every line (default: true) */
  timestamps?: boolean;
  /** Stream the previously-terminated container instance (default: false) */
  previous?: boolean;
  /** Only return logs newer than this many seconds ago (default: undefined = all) */
  sinceSeconds?: number;
}

export interface UseLogStreamResult {
  lines: string[];
  error: string | null;
}

export function useLogStream(
  kubeConfig: KubeConfig,
  namespace: string,
  podName: string,
  containerName: string,
  options: UseLogStreamOptions = {},
): UseLogStreamResult {
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Destructure so primitives go into the dep array (avoids object-identity issues)
  const {
    tailLines = 100,
    timestamps = true,
    previous = false,
    sinceSeconds,
  } = options;

  useEffect(() => {
    let active = true;
    let abortRequest: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

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

      logStream.on("end", () => {
        if (!active) return;
        // Previous-container logs are finite — don't reconnect, we have all of them.
        // Live logs: reconnect when the server closes the follow connection.
        if (!previous) {
          retryTimer = setTimeout(startStream, RECONNECT_DELAY_MS);
        }
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
            follow: !previous, // can't follow previous-container logs
            tailLines,
            timestamps,
            previous,
            ...(sinceSeconds !== undefined ? { sinceSeconds } : {}),
          },
        );
        if (!active) {
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
  }, [kubeConfig, namespace, podName, containerName, tailLines, timestamps, previous, sinceSeconds]);

  return { lines, error };
}
