const SPARK_CHARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/**
 * Renders a series of non-negative numbers as a compact Unicode block
 * sparkline, scaled against the series' own max. Returns "no data" for an
 * empty series so callers don't have to special-case it.
 */
export function sparkline(values: number[]): string {
  if (values.length === 0) return "no data";
  const max = Math.max(...values, 1);
  return values
    .map((v) => SPARK_CHARS[Math.min(7, Math.floor((v / max) * 7))])
    .join("");
}

/** Maps a 0..1 ratio to one of the 8 block-height characters used above. */
export function charForRatio(ratio: number): string {
  const r = Math.max(0, Math.min(1, ratio));
  return SPARK_CHARS[Math.min(7, Math.floor(r * 7))];
}
