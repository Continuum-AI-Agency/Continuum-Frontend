const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type TimePreset = "last_7d" | "last_14d" | "last_30d" | "custom";
type RollingTimePreset = Exclude<TimePreset, "custom">;

export type PaidMediaTimeRange =
  | { preset: RollingTimePreset }
  | { preset: "custom"; since: string; until: string };

export const TIME_RANGE_OPTIONS: ReadonlyArray<{ value: TimePreset; label: string }> = [
  { value: "last_7d", label: "Last 7 days" },
  { value: "last_14d", label: "Last 14 days" },
  { value: "last_30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
] as const;

function toIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && toIsoDay(date) === value;
}

function daysForPreset(preset: RollingTimePreset): number {
  switch (preset) {
    case "last_14d":
      return 14;
    case "last_30d":
      return 30;
    case "last_7d":
    default:
      return 7;
  }
}

export function buildDefaultCustomRange(now: Date = new Date()): { since: string; until: string } {
  const until = toIsoDay(now);
  const since = toIsoDay(new Date(now.getTime() - 7 * DAY_MS));
  return { since, until };
}

export function normalizeCustomRange(
  range: { since: string; until: string },
  now: Date = new Date(),
): { since: string; until: string } {
  if (!isValidDateOnly(range.since) || !isValidDateOnly(range.until)) {
    return buildDefaultCustomRange(now);
  }

  if (range.since <= range.until) {
    return range;
  }

  return {
    since: range.until,
    until: range.since,
  };
}

export function resolveTimeRangeWindow(
  range: PaidMediaTimeRange,
  now: Date = new Date(),
): { since: string; until: string; dayCount: number } {
  if (range.preset === "custom") {
    const custom = normalizeCustomRange({ since: range.since, until: range.until }, now);
    const sinceDate = new Date(`${custom.since}T00:00:00.000Z`);
    const untilDate = new Date(`${custom.until}T00:00:00.000Z`);
    const dayCount = Math.max(1, Math.floor((untilDate.getTime() - sinceDate.getTime()) / DAY_MS) + 1);
    return { ...custom, dayCount };
  }

  const dayCount = daysForPreset(range.preset);
  return {
    since: toIsoDay(new Date(now.getTime() - dayCount * DAY_MS)),
    until: toIsoDay(now),
    dayCount,
  };
}

export function toMetricsRange(range: PaidMediaTimeRange): PaidMediaTimeRange {
  if (range.preset !== "custom") {
    return { preset: range.preset };
  }

  const custom = normalizeCustomRange({ since: range.since, until: range.until });
  return {
    preset: "custom",
    since: custom.since,
    until: custom.until,
  };
}
