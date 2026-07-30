import prettyBytes from "./pretty-bytes.js";
import { charForRatio } from "./sparkline.js";

/**
 * Parses a Kubernetes CPU quantity string (as returned by metrics-server,
 * e.g. "123456789n", "45m", "2") into millicores.
 */
export function parseCpuToMillicores(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d+(?:\.\d+)?)([nmu])?$/.exec(value.trim());
  if (!match) return null;
  const num = Number(match[1]);
  const suffix = match[2];
  if (suffix === "n") return num / 1_000_000;
  if (suffix === "u") return num / 1_000;
  if (suffix === "m") return num;
  return num * 1000; // bare cores
}

/**
 * Parses a Kubernetes memory quantity string (e.g. "204124Ki", "512Mi", "1Gi",
 * or a bare byte count) into bytes.
 */
export function parseMemoryToBytes(value: string | undefined): number | null {
  if (!value) return null;
  const match = /^(\d+(?:\.\d+)?)([EPTGMK]i?)?$/.exec(value.trim());
  if (!match) return null;
  const num = Number(match[1]);
  const suffix = match[2];
  const BINARY: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
  };
  const DECIMAL: Record<string, number> = {
    K: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
    P: 1000 ** 5,
    E: 1000 ** 6,
  };
  if (!suffix) return num;
  if (BINARY[suffix]) return num * BINARY[suffix];
  if (DECIMAL[suffix]) return num * DECIMAL[suffix];
  return null;
}

/** Formats millicores for display: "45m" below 1 core, "1.20" cores otherwise. */
export function formatCpu(millicores: number | null | undefined): string {
  if (millicores === null || millicores === undefined) return "–";
  if (millicores < 1000) return `${Math.round(millicores)}m`;
  return `${(millicores / 1000).toFixed(2)}`;
}

/** Formats a byte count using the binary pretty-bytes formatter (e.g. "512 MiB"). */
export function formatMemBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "–";
  return prettyBytes(bytes, { binary: true, maximumFractionDigits: 1 });
}

/** Color threshold shared with health status colors: green < 60%, yellow < 85%, red >= 85%. */
export function usageColor(percent: number | null | undefined): string | undefined {
  if (percent === null || percent === undefined) return undefined;
  if (percent >= 85) return "red";
  if (percent >= 60) return "yellow";
  return "green";
}

/** Bright chalk variant of an already-resolved color name (or undefined) —
 * used to make a sparkline's bars pop against its own (dimmer) value text. */
export function brighten(color: string | undefined): string | undefined {
  return color ? `${color}Bright` : undefined;
}

export interface UsageSparkSegment {
  char: string;
  /** Health color for this bar (green/yellow/red), or undefined when there's
   * no request/limit to compare against — render those bars in a neutral tone. */
  color?: string;
}

/**
 * Builds per-bar sparkline segments from a raw sample history, using each
 * sample's own percent of `referenceTotal` (a request or allocatable total)
 * for BOTH bar height and color. This is deliberately not scaled against the
 * window's own max: a series that's flat at 90% of its reference renders as
 * a steady, tall, red trend, and a series flat at 10% renders as a steady,
 * short, green trend. Scaling against the window's own max instead would
 * make almost any stable series look permanently maxed out and orange/red,
 * since one sample is always the local max.
 *
 * Falls back to a plain, uncolored, window-relative trend when no reference
 * total is known (nothing meaningful to compare against, e.g. no resource
 * request set on the pod).
 */
export function usageSpark(
  samples: number[] | undefined,
  referenceTotal: number,
): UsageSparkSegment[] | undefined {
  if (!samples || samples.length < 2) return undefined;
  if (referenceTotal > 0) {
    return samples.map((v) => {
      const percent = (v / referenceTotal) * 100;
      return { char: charForRatio(percent / 100), color: usageColor(percent) };
    });
  }
  const max = Math.max(...samples, 1);
  return samples.map((v) => ({ char: charForRatio(v / max), color: undefined }));
}

/** Renders a compact usage string, optionally with a percentage against a capacity value. */
export function formatUsage(
  formattedValue: string,
  percent: number | null | undefined,
): string {
  if (percent === null || percent === undefined) return formattedValue;
  return `${formattedValue} (${Math.round(percent)}%)`;
}
