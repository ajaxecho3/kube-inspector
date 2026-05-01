export type LogLevel = "ALL" | "ERROR" | "WARN" | "INFO";
export const LOG_LEVELS: LogLevel[] = ["ALL", "ERROR", "WARN", "INFO"];

export const LEVEL_KEYWORDS: Record<Exclude<LogLevel, "ALL">, string[]> = {
  ERROR: ["error", "fatal", "exception", "critical"],
  WARN:  ["warn", "warning"],
  INFO:  ["info"],
};

export function detectLineLevel(line: string): Exclude<LogLevel, "ALL"> | null {
  const l = line.toLowerCase();
  if (LEVEL_KEYWORDS.ERROR.some((kw) => l.includes(kw))) return "ERROR";
  if (LEVEL_KEYWORDS.WARN.some((kw) => l.includes(kw)))  return "WARN";
  if (LEVEL_KEYWORDS.INFO.some((kw) => l.includes(kw)))  return "INFO";
  return null;
}

export function levelColor(level: Exclude<LogLevel, "ALL"> | null): string | undefined {
  if (level === "ERROR") return "red";
  if (level === "WARN")  return "yellow";
  if (level === "INFO")  return "cyan";
  return undefined;
}

export function filterByLevel(lines: string[], level: LogLevel): string[] {
  if (level === "ALL") return lines;
  const keywords = LEVEL_KEYWORDS[level];
  return lines.filter((l) => keywords.some((kw) => l.toLowerCase().includes(kw)));
}

export function nextLevel(current: LogLevel): LogLevel {
  const idx = LOG_LEVELS.indexOf(current);
  return LOG_LEVELS[(idx + 1) % LOG_LEVELS.length];
}
