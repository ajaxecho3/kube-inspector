import { useState, useEffect, useRef } from "react";
import { Watch, KubeConfig } from "@kubernetes/client-node";

type KubeObject = { metadata?: { uid?: string } };

export interface UseResourcesResult<T> {
  resources: Map<string, T>;
  error: string | null;
  loading: boolean;
}

interface UseResourcesOptions {
  namespaced: boolean;
  namespace?: string;
}

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;

export function useResources<T extends KubeObject>(
  kubeConfig: KubeConfig,
  path: string,
  _options: UseResourcesOptions,
): UseResourcesResult<T> {
  const [resources, setResources] = useState<Map<string, T>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const retryCount = useRef(0);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const isMounted = useRef(true);
  const firstEventRef = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    firstEventRef.current = false;

    async function startWatch() {
      const watch = new Watch(kubeConfig);
      try {
        const req = await watch.watch(
          path,
          {},
          (type: string, obj: T) => {
            if (!isMounted.current) return;
            const uid = obj.metadata?.uid;
            if (!uid) return;

            if (!firstEventRef.current) {
              firstEventRef.current = true;
              setLoading(false);
            }

            setResources((prev) => {
              const next = new Map(prev);
              if (type === "DELETED") {
                next.delete(uid);
              } else {
                next.set(uid, obj);
              }
              return next;
            });
          },
          (err: Error | null) => {
            if (!isMounted.current) return;
            if (err) {
              setLoading(false);
              setError(err.message);
              const delay = Math.min(
                BASE_BACKOFF_MS * 2 ** retryCount.current,
                MAX_BACKOFF_MS,
              );
              retryCount.current++;
              setTimeout(startWatch, delay);
            } else {
              retryCount.current = 0;
              setError(null);
            }
          },
        );
        abortRef.current = req;
        setError(null);
      } catch (err) {
        if (!isMounted.current) return;
        setLoading(false);
        setError(String(err));
      }
    }

    startWatch();

    return () => {
      isMounted.current = false;
      abortRef.current?.abort();
      setResources(new Map());
      setLoading(true);
      firstEventRef.current = false;
    };
  }, [kubeConfig, path]);

  return { resources, error, loading };
}
