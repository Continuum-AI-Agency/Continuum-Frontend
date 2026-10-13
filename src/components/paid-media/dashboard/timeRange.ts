// Every rolling preset here is N COMPLETE days ending yesterday (PP-L3-last-7d-asks-eight-
// days-including-today): the window the truth calculator, Meta's own presets and the Optimizer
// mean, and the one a reader can hold a figure against. The edge resolves a preset on the
// clock ([now − N days, now] = N + 1 days with today half-written), so the preset is never
// sent; `toMetricsRange` asks with the explicit window. The arithmetic and the calendar it
// reads today in live in lib/paid-media/reportingWindow.ts.

import { completeDaysEndingYesterday } from '@/lib/paid-media/reportingWindow';

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type TimePreset = 'last_7d' | 'last_14d' | 'last_30d' | 'custom';
type RollingTimePreset = Exclude<TimePreset, 'custom'>;

export type PaidMediaTimeRange =
  | { preset: RollingTimePreset }
  | { preset: 'custom'; since: string; until: string };

export const TIME_RANGE_OPTIONS: ReadonlyArray<{ value: TimePreset; label: string }> = [
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_14d', label: 'Last 14 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom range' },
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
    case 'last_14d':
      return 14;
    case 'last_30d':
      return 30;
    case 'last_7d':
    default:
      return 7;
  }
}

export function buildDefaultCustomRange(
  now: Date = new Date(),
  timeZone?: string,
): { since: string; until: string } {
  return completeDaysEndingYesterday(7, now, timeZone);
}

export function normalizeCustomRange(
  range: { since: string; until: string },
  now: Date = new Date(),
  timeZone?: string,
): { since: string; until: string } {
  if (!isValidDateOnly(range.since) || !isValidDateOnly(range.until)) {
    return buildDefaultCustomRange(now, timeZone);
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
  timeZone?: string,
): { since: string; until: string; dayCount: number } {
  if (range.preset === 'custom') {
    const custom = normalizeCustomRange({ since: range.since, until: range.until }, now, timeZone);
    const sinceDate = new Date(`${custom.since}T00:00:00.000Z`);
    const untilDate = new Date(`${custom.until}T00:00:00.000Z`);
    const dayCount = Math.max(
      1,
      Math.floor((untilDate.getTime() - sinceDate.getTime()) / DAY_MS) + 1,
    );
    return { ...custom, dayCount };
  }

  const dayCount = daysForPreset(range.preset);
  return { ...completeDaysEndingYesterday(dayCount, now, timeZone), dayCount };
}

/** What the edge is asked with: always the explicit window, so a rolling preset reads the same
 *  N complete days the picker's label promises. */
export function toMetricsRange(
  range: PaidMediaTimeRange,
  now: Date = new Date(),
  timeZone?: string,
): Extract<PaidMediaTimeRange, { preset: 'custom' }> {
  const { since, until } = resolveTimeRangeWindow(range, now, timeZone);
  return { preset: 'custom', since, until };
}
