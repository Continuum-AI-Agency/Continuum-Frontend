// Shared organic-analytics number/percent/date formatters. Extracted from
// OrganicMetricsDashboard so the post cards (StatTile, DeltaBadge, PostQuickLook)
// and the dashboard render numbers identically. Compact formatting reuses the
// canonical jaina formatValue helper.

import { formatValue } from '@/lib/jaina/formatValue';

// The one token for "there is no number here", used by every formatter below and
// by every organic surface that renders a missing value inline. It exists as a
// constant because the same absence was previously spelled four ways ("-", "--",
// an em dash, and a coerced "0"), which read as four different states.
export const NO_DATA = '-';

// A comparison that never ran is not a comparison that found no change: 'flat'
// claims a measurement, 'unknown' admits there wasn't one. Callers must render
// no badge for 'unknown'.
export type TrendDirection = 'up' | 'down' | 'flat' | 'unknown';
export type DeltaTone = 'positive' | 'negative' | 'flat';

const YMD_ONLY = /^\d{4}-\d{2}-\d{2}$/;

// Full grouped number (e.g. 12,431).
export function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return NO_DATA;
  return new Intl.NumberFormat().format(value);
}

// Compact number (e.g. 12.4K).
export function formatCompactNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return NO_DATA;
  return formatValue(value, 'compact');
}

// A 0-100 rate rendered as a percent (e.g. 4.1%).
export function formatRate(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return NO_DATA;
  return formatValue(value, 'percent');
}

// Signed percentage change (e.g. "+12.3%"). The window it describes is supplied
// by the adjacent label. An exact zero is rendered unsigned: "+0.0%" reads as a
// measured gain, which is exactly the misreading it used to sit next to.
export function formatPercentChange(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return NO_DATA;
  const magnitude = `${Math.abs(value).toFixed(1)}%`;
  if (value === 0) return magnitude;
  return `${value > 0 ? '+' : '-'}${magnitude}`;
}

export function trendDirection(value: number | undefined): TrendDirection {
  if (value === undefined || !Number.isFinite(value)) return 'unknown';
  if (value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

export function deltaTone(value: number | undefined): DeltaTone {
  const direction = trendDirection(value);
  if (direction === 'up') return 'positive';
  if (direction === 'down') return 'negative';
  return 'flat';
}

// Percentage change from `previous` to `current`. Undefined when no percentage
// exists: a zero baseline has no proportion to grow by, so reporting 0 -> 10 as
// "+100%" would state a rate the data cannot support.
export function percentChangeFrom(current: number, previous: number): number | undefined {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return undefined;
  if (previous === 0) return undefined;
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}

export function formatShortDate(date: string | undefined): string {
  if (!date) return NO_DATA;
  // A bare YYYY-MM-DD parses as UTC midnight, which renders as the *previous*
  // day in any western timezone — an axis tick then names a day the backend
  // never reported. Pin it to local midnight so the label matches the data.
  const parsed = new Date(YMD_ONLY.test(date) ? `${date}T00:00:00` : date);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// States a window in absolute dates. Preferred over a bare day count anywhere a
// reader could mistake the count for the active range filter.
export function formatDateRangeLabel(
  range: { from: string; to: string } | null | undefined,
): string {
  if (!range) return NO_DATA;
  const from = formatShortDate(range.from);
  const to = formatShortDate(range.to);
  return from === to ? from : `${from} to ${to}`;
}

// "Select a instagram account" was shipping in two empty states. The article
// follows the label's leading letter, so the copy is built from the label rather
// than hardcoded per string.
export function articleFor(label: string): string {
  return /^[aeiou]/i.test(label) ? 'an' : 'a';
}

export function formatDateTime(value: string | undefined): string {
  if (!value) return NO_DATA;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
