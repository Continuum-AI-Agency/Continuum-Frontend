// The §4 chart vocabulary as plain data: which rows a chart draws, in what order, with what
// label on each bar. ChartBlock renders what these return; nothing here touches Recharts.

import {
  CARTESIAN_CHART_TYPES,
  RANKABLE_CHART_TYPES,
  singleSeriesKeyOf,
} from '@continuum/contracts';
import { formatValue } from '@/lib/jaina/formatValue';
import type { ChartBlockV2 } from '@/lib/jaina/schemas';

/** `[low, high]` of a waterfall's floating bar: Recharts draws an array value as a range bar. */
export const RANGE_KEY = '__chart_range';
/** The printed label of a waterfall or funnel bar (signed delta, total, stage share). */
export const LABEL_KEY = '__chart_label';
/** Set on a waterfall's opening and closing totals, which take the neutral fill. */
export const TOTAL_KEY = '__chart_total';

export type DrawnRow = Record<string, unknown>;
export type SeriesKind = 'bar' | 'line' | 'area';

export function formatChartValue(value: string | number, block: ChartBlockV2): string {
  return formatValue(
    value,
    block.value_format,
    block.currency_code ? { currency: block.currency_code } : undefined,
  );
}

/** A delta reads as a change: "+$3.90 MXN", "-$0.95 MXN" (the sign `formatValue` already prints). */
function formatDelta(value: number, block: ChartBlockV2): string {
  const formatted = formatChartValue(value, block);
  return value > 0 ? `+${formatted}` : formatted;
}

const shareFormat = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumSignificantDigits: 2,
});

/** One stage as a share of the stage before it: 2,315 of 18,420 is "13%", 18,420 of 1.28M "1.4%". */
export function stageShare(value: number, previous: number): string | null {
  return previous > 0 ? shareFormat.format(value / previous) : null;
}

/** Bar, line, area, stacked bar, waterfall, funnel: a category axis against a value axis. */
export function isCartesianChart(block: Pick<ChartBlockV2, 'chart_type'>): boolean {
  return (
    CARTESIAN_CHART_TYPES.has(block.chart_type) ||
    block.chart_type === 'waterfall' ||
    block.chart_type === 'funnel'
  );
}

/** Categories down the side: a ranking laid on its side, and every funnel. */
export function isHorizontalChart(
  block: Pick<ChartBlockV2, 'chart_type' | 'orientation'>,
): boolean {
  return (
    block.chart_type === 'funnel' ||
    (block.orientation === 'horizontal' && RANKABLE_CHART_TYPES.has(block.chart_type))
  );
}

/** The series a chart plots: a waterfall or funnel plots its one measure, the rest every series. */
export function seriesKeysOf(block: ChartBlockV2): string[] {
  if (block.chart_type === 'waterfall' || block.chart_type === 'funnel') {
    const key = singleSeriesKeyOf(block);
    return key ? [key] : [];
  }
  return Object.keys(block.chart_config);
}

/** A series named in `series_kind` draws as that kind; the rest as the chart type's own. */
export function seriesKindOf(block: ChartBlockV2, key: string): SeriesKind {
  const named = block.series_kind?.[key];
  if (named) return named;
  if (block.chart_type === 'line') return 'line';
  if (block.chart_type === 'area') return 'area';
  return 'bar';
}

const toNumber = (value: unknown): number => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
};

/**
 * The rows in the order a ranking draws them: by `value_key`, else the first series (a
 * stacked bar: the row's total across its series). Rows' order when `sort` is absent.
 */
function sortedRows(block: ChartBlockV2): DrawnRow[] {
  if (!block.sort || !RANKABLE_CHART_TYPES.has(block.chart_type)) return block.data;
  const keys = Object.keys(block.chart_config);
  const sortKey = (row: DrawnRow): number => {
    if (block.value_key) return toNumber(row[block.value_key]);
    if (block.chart_type === 'stacked_bar') {
      return keys.reduce((total, key) => total + toNumber(row[key]), 0);
    }
    return toNumber(row[keys[0] ?? '']);
  };
  const direction = block.sort === 'asc' ? 1 : -1;
  return [...block.data].sort((a, b) => direction * (sortKey(a) - sortKey(b)));
}

/**
 * Opening total, one floating bar per cause, closing total. Each delta floats from the
 * running total before it to the one after it, so a negative cause hangs downward.
 */
function waterfallRows(block: ChartBlockV2, valueKey: string): DrawnRow[] {
  const total = (label: string, value: number): DrawnRow => ({
    [block.category_key]: label,
    [valueKey]: value,
    [RANGE_KEY]: [Math.min(0, value), Math.max(0, value)],
    [LABEL_KEY]: formatChartValue(value, block),
    [TOTAL_KEY]: true,
  });
  const rows: DrawnRow[] = block.start ? [total(block.start.label, block.start.value)] : [];
  let running = block.start?.value ?? 0;
  for (const row of block.data) {
    const delta = toNumber(row[valueKey]);
    const next = running + delta;
    rows.push({
      ...row,
      [RANGE_KEY]: [Math.min(running, next), Math.max(running, next)],
      [LABEL_KEY]: formatDelta(delta, block),
    });
    running = next;
  }
  if (block.end) rows.push(total(block.end.label, block.end.value));
  return rows;
}

/** Stages in flow order (never re-sorted), each labelled with its value and its share of the last. */
function funnelRows(block: ChartBlockV2, valueKey: string): DrawnRow[] {
  return block.data.map((row, index) => {
    const value = toNumber(row[valueKey]);
    const previous = index > 0 ? toNumber(block.data[index - 1]?.[valueKey]) : null;
    const share = previous == null ? null : stageShare(value, previous);
    const formatted = formatChartValue(value, block);
    return { ...row, [LABEL_KEY]: share ? `${formatted} · ${share}` : formatted };
  });
}

/** The rows the chart draws, in the order it draws them. */
export function drawnRowsOf(block: ChartBlockV2): DrawnRow[] {
  const valueKey = singleSeriesKeyOf(block);
  if (block.chart_type === 'waterfall' && valueKey) return waterfallRows(block, valueKey);
  if (block.chart_type === 'funnel' && valueKey) return funnelRows(block, valueKey);
  return sortedRows(block);
}

/** The plotted value of one row and series as the reader sees it printed. */
export function printedValueOf(row: DrawnRow, key: string, block: ChartBlockV2): string | null {
  const label = row[LABEL_KEY];
  if (typeof label === 'string') return label;
  const value = row[key];
  return typeof value === 'string' || typeof value === 'number'
    ? formatChartValue(value, block)
    : null;
}
