import React from "react";
import { Box, Text, useInput } from "ink";
import type { V1Pod } from "@kubernetes/client-node";
import type { MetricHistory } from "../hooks/useMetrics.js";
import { POLL_INTERVAL_MS } from "../hooks/useMetrics.js";
import {
  formatCpu,
  formatMemBytes,
  formatUsage,
  usageColor,
  parseCpuToMillicores,
  parseMemoryToBytes,
} from "../utils/metrics.js";

interface UsageGraphProps {
  pod: V1Pod;
  history?: MetricHistory;
  onClose: () => void;
  /** Rows actually available to this view (see PodDetail's maxHeight prop). */
  maxHeight?: number;
}

// Rendering resolution (dot-matrix columns) — independent of how much raw
// history is retained (see MAX_HISTORY_SAMPLES in useMetrics.ts, currently up
// to 1 hour). When there are more samples than columns, samples are bucketed
// (averaged) down to fit; when there are fewer, each sample gets its own
// column, right-aligned, with blank columns on the left.
const WIDTH = 20;
const LIT = "●";
const OFF = "·";

/** Buckets an arbitrary-length sample series down to exactly `width` values
 * (averaging within each bucket), or right-aligns it with leading nulls when
 * it's shorter than `width`. Nulls mean "no sample in this column yet". */
export function bucketValues(samples: number[], width: number): (number | null)[] {
  const n = samples.length;
  const out: (number | null)[] = new Array(width).fill(null);
  if (n === 0) return out;
  if (n <= width) {
    const start = width - n;
    samples.forEach((v, i) => {
      out[start + i] = v;
    });
    return out;
  }
  for (let i = 0; i < width; i++) {
    const lo = Math.floor((i * n) / width);
    const hi = Math.max(lo + 1, Math.floor(((i + 1) * n) / width));
    const slice = samples.slice(lo, hi);
    out[i] = slice.reduce((a, b) => a + b, 0) / slice.length;
  }
  return out;
}

interface Column {
  /** 0..1, used for bar height. null = no sample in this column yet. */
  ratio: number | null;
  /** Health color for this column (green/yellow/red), or undefined when
   * there's no request/limit to compare against. */
  color?: string;
}

/**
 * The chart's vertical scale, as a percent-of-request ceiling. Colors stay
 * absolute (usageColor against real percent), but the height axis auto-fits
 * to this session's peak instead of always assuming 100% — otherwise a pod
 * idling at 3% of its request would render almost entirely empty, dim rows.
 * A little headroom is added above the peak so it doesn't look pinned to
 * the very top, with a floor to avoid over-zooming tiny fluctuations.
 */
function chartScaleMax(percents: number[]): number {
  if (percents.length === 0) return 100;
  const peak = Math.max(...percents, 0);
  return Math.max(10, Math.min(150, peak * 1.25));
}

/**
 * One column's worth of dots (bottom-lit) per sample. Colored by each
 * sample's own percent of `referenceTotal` (the pod's CPU/mem request) when
 * known — NOT by the window's own max, which would make any stable series
 * look permanently maxed out (and always the "hottest" color) even when
 * usage is low and flat. Height is scaled against `scaleMax` (see
 * chartScaleMax) so the chart fills its available rows instead of leaving
 * most of them empty when usage sits well under 100%. Falls back to a plain
 * window-relative, uncolored trend when no request is set on the pod.
 */
function buildColumns(samples: number[], referenceTotal: number, scaleMax: number): Column[] {
  const bucketed = bucketValues(samples, WIDTH);
  if (referenceTotal > 0) {
    return bucketed.map((v) => {
      if (v === null) return { ratio: null };
      const percent = (v / referenceTotal) * 100;
      return { ratio: Math.max(0, Math.min(1, percent / scaleMax)), color: usageColor(percent) };
    });
  }
  const known = bucketed.filter((v): v is number => v !== null);
  const max = Math.max(...known, 1);
  return bucketed.map((v) => (v === null ? { ratio: null } : { ratio: Math.max(0, Math.min(1, v / max)) }));
}

function renderChart(samples: number[], referenceTotal: number, scaleMax: number, rows: number) {
  const cols = buildColumns(samples, referenceTotal, scaleMax);
  const lines: React.ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    lines.push(
      <Box key={row}>
        {cols.map((c, i) => {
          if (c.ratio === null) {
            return (
              <Text key={i} dimColor>
                {OFF}
              </Text>
            );
          }
          const litRows = Math.max(c.ratio > 0 ? 1 : 0, Math.round(c.ratio * rows));
          const isLit = rows - row <= litRows;
          if (!isLit) {
            return (
              <Text key={i} dimColor>
                {OFF}
              </Text>
            );
          }
          return c.color ? (
            <Text key={i} color={c.color}>
              {LIT}
            </Text>
          ) : (
            <Text key={i} color="cyan">
              {LIT}
            </Text>
          );
        })}
      </Box>,
    );
  }
  return lines;
}

/**
 * Builds a single-line time axis (e.g. "-45m ... -15m ... now") aligned
 * under the WIDTH-column chart, one tick per ~quarter of the window.
 * `sampleCount` is the pod's *actual* number of retained samples so far —
 * early in a session (before history fills up) this is less than WIDTH, and
 * the axis should reflect the real (shorter) span rather than assuming the
 * full 1-hour retention window has already elapsed. Once sampleCount exceeds
 * WIDTH, samples are bucketed into columns (see bucketValues), so each
 * column's age is approximated as a proportional slice of the full span.
 */
export function buildAxisLine(sampleCount: number, intervalMs: number): string {
  const intervalSec = intervalMs / 1000;
  const tickCols = Array.from(
    new Set([0, Math.round(WIDTH * 0.25), Math.round(WIDTH * 0.5), Math.round(WIDTH * 0.75), WIDTH - 1]),
  ).sort((a, b) => a - b);
  const chars = new Array(WIDTH).fill(" ");
  const dataStartCol = Math.max(0, WIDTH - sampleCount);
  for (const col of tickCols) {
    if (col < dataStartCol) continue; // no data placed this far back yet
    const elapsedSec =
      sampleCount <= WIDTH
        ? (WIDTH - 1 - col) * intervalSec
        : ((sampleCount * intervalSec) * (WIDTH - 1 - col)) / (WIDTH - 1);
    const label =
      elapsedSec < 1
        ? "now"
        : elapsedSec >= 60
          ? `-${Math.round(elapsedSec / 60)}m`
          : `-${Math.round(elapsedSec)}s`;
    // Anchor the label so it ENDS at `col` rather than starting there —
    // otherwise the rightmost tick ("now") has nowhere to grow into and gets
    // clipped to a single character at the display's right edge.
    for (let i = 0; i < label.length; i++) {
      const pos = col - (label.length - 1) + i;
      if (pos >= 0 && pos < WIDTH) chars[pos] = label[i];
    }
  }
  return chars.join("");
}

export function UsageGraph({ pod, history, onClose, maxHeight }: UsageGraphProps) {
  useInput((_input, key) => {
    if (key.escape) onClose();
  });

  // Budget: header(2) + border(2) + per-metric block: label(1) + rows + axis(1)
  // + gap(1) = rows+3, twice, + footer(2). Solve for rows within maxHeight.
  // Capped at 6 — with the chart's height auto-fit to its own peak (below),
  // taller charts just added dead space rather than more useful detail.
  const available = maxHeight ?? 30;
  const rows = Math.max(3, Math.min(6, Math.floor((available - 2 - 2 - 2 * 4) / 2)));

  // Requested totals across all containers — the reference each sample is
  // scaled/colored against (falls back to a neutral trend when unset).
  const requests = (pod.spec?.containers ?? []).reduce(
    (sum, c) => {
      const cpuReq = c.resources?.requests?.["cpu"];
      const memReq = c.resources?.requests?.["memory"];
      const cpuMilli = cpuReq ? parseCpuToMillicores(cpuReq) : null;
      const memB = memReq ? parseMemoryToBytes(memReq) : null;
      return {
        cpu: sum.cpu + (cpuMilli ?? 0),
        mem: sum.mem + (memB ?? 0),
      };
    },
    { cpu: 0, mem: 0 },
  );

  const cpuSamples = history?.cpu ?? [];
  const memSamples = history?.mem ?? [];
  const cpuNow = cpuSamples[cpuSamples.length - 1] ?? null;
  const memNow = memSamples[memSamples.length - 1] ?? null;
  const cpuPeak = cpuSamples.length ? Math.max(...cpuSamples) : null;
  const memPeak = memSamples.length ? Math.max(...memSamples) : null;
  const cpuNowPct = cpuNow != null && requests.cpu > 0 ? (cpuNow / requests.cpu) * 100 : null;
  const memNowPct = memNow != null && requests.mem > 0 ? (memNow / requests.mem) * 100 : null;

  const cpuPercents = requests.cpu > 0 ? cpuSamples.map((v) => (v / requests.cpu) * 100) : [];
  const memPercents = requests.mem > 0 ? memSamples.map((v) => (v / requests.mem) * 100) : [];
  const cpuScaleMax = chartScaleMax(cpuPercents);
  const memScaleMax = chartScaleMax(memPercents);

  const cpuAxisLine = buildAxisLine(cpuSamples.length, POLL_INTERVAL_MS);
  const memAxisLine = buildAxisLine(memSamples.length, POLL_INTERVAL_MS);
  const hasData = cpuSamples.length >= 2 || memSamples.length >= 2;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" padding={1}>
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          Usage History — {pod.metadata?.name}
        </Text>
        <Text dimColor>[Esc] Close</Text>
      </Box>

      {!hasData ? (
        <Box marginTop={1}>
          <Text dimColor>
            Not enough samples yet — this chart fills in as metrics-server is polled
            every {POLL_INTERVAL_MS / 1000}s.
          </Text>
        </Box>
      ) : (
        <>
          <Box marginTop={1} flexDirection="column">
            <Box justifyContent="space-between">
              <Text bold>
                CPU{requests.cpu > 0 ? <Text dimColor> (scale 0–{Math.round(cpuScaleMax)}%)</Text> : null}
              </Text>
              <Text dimColor>
                now:{" "}
                <Text color={usageColor(cpuNowPct)} bold>
                  {formatUsage(formatCpu(cpuNow), cpuNowPct)}
                </Text>
                {"  peak: "}
                {formatCpu(cpuPeak)}
              </Text>
            </Box>
            {renderChart(cpuSamples, requests.cpu, cpuScaleMax, rows)}
            <Text dimColor>{cpuAxisLine}</Text>
          </Box>

          <Box marginTop={1} flexDirection="column">
            <Box justifyContent="space-between">
              <Text bold>
                MEM{requests.mem > 0 ? <Text dimColor> (scale 0–{Math.round(memScaleMax)}%)</Text> : null}
              </Text>
              <Text dimColor>
                now:{" "}
                <Text color={usageColor(memNowPct)} bold>
                  {formatUsage(formatMemBytes(memNow), memNowPct)}
                </Text>
                {"  peak: "}
                {formatMemBytes(memPeak)}
              </Text>
            </Box>
            {renderChart(memSamples, requests.mem, memScaleMax, rows)}
            <Text dimColor>{memAxisLine}</Text>
          </Box>
        </>
      )}

      <Box marginTop={1}>
        <Text dimColor>
          {requests.cpu > 0 || requests.mem > 0
            ? "Bars are colored by percent of the pod's resource requests (green/yellow/red)."
            : "No resource requests set on this pod — bars show relative trend only."}
        </Text>
      </Box>
    </Box>
  );
}
