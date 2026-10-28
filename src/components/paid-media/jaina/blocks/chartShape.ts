// When a chart earns its space, and how tall it is when it does.
//
// A 380px chart for three numbers was the single largest element of the 2026-09-27 EasyFit
// summary, and it said less than the three tiles would have. A chart shows a TREND or a
// COMPARISON; with fewer points than a week and fewer entities than three there is neither,
// and the block degrades to metric tiles — the same figures, read at a glance.

import type { ChartBlockV2 } from '@/lib/jaina/schemas';

/** A time series shorter than a week is a handful of numbers. */
export const CHART_MIN_POINTS = 7;
/** Fewer than three entities side by side is a pair, and a pair is two tiles. */
export const CHART_MIN_ENTITIES = 3;

/** Charts whose rows are entities (bars, slices, causes, stages) rather than moments in time. */
const ROWS_ARE_ENTITIES: ReadonlySet<string> = new Set([
  'bar',
  'pie',
  'doughnut',
  'waterfall',
  'funnel',
]);

export type ChartShape = {
  points: number;
  entities: number;
  earnsChart: boolean;
};

type ShapeInput = Pick<ChartBlockV2, 'chart_type' | 'data' | 'chart_config'> &
  Partial<Pick<ChartBlockV2, 'start' | 'end'>>;

/**
 * Points are the rows. Entities are the rows of a categorical chart (one bar or slice per
 * entity; a waterfall's opening and closing totals are bars too) and the series of a temporal
 * one (one line per entity). A stacked bar is a part-of-whole chart, both at once: two periods
 * split across four platforms is four entities, and a chart.
 */
export function chartShapeOf(block: ShapeInput): ChartShape {
  const points = block.data.length;
  const series = Object.keys(block.chart_config).length;
  const totals = block.chart_type === 'waterfall' ? Number(!!block.start) + Number(!!block.end) : 0;
  const entities =
    block.chart_type === 'stacked_bar'
      ? Math.max(points, series)
      : ROWS_ARE_ENTITIES.has(block.chart_type)
        ? points + totals
        : series;
  return {
    points,
    entities,
    earnsChart: points >= CHART_MIN_POINTS || entities >= CHART_MIN_ENTITIES,
  };
}

/** A category label split into lines of at most `max` characters, on word boundaries. */
export function wrapTickLabel(value: string, max = 18): string[] {
  return value.split(/\s+/).reduce<string[]>((lines, word) => {
    const previous = lines.at(-1);
    if (!previous || `${previous} ${word}`.length > max) lines.push(word);
    else lines[lines.length - 1] = `${previous} ${word}`;
    return lines;
  }, []);
}

const PLOT_HEIGHT_PX = 240;
const TICK_LINE_HEIGHT_PX = 15;
const TICK_PADDING_PX = 16;
export const MAX_TICK_AREA_PX = 112;

const MAX_TICK_LINES = Math.floor((MAX_TICK_AREA_PX - TICK_PADDING_PX) / TICK_LINE_HEIGHT_PX);

/**
 * Lines a category tick may take: what its names need at 18 characters — and, where every
 * row is an entity that must be named, two at least, so a narrow chart has a second line to
 * wrap a name onto rather than run it into its neighbour.
 */
export function tickLineBudget(categories: ReadonlyArray<string>, everyName = false): number {
  return Math.min(MAX_TICK_LINES, neededTickLines(categories, everyName));
}

const neededTickLines = (categories: ReadonlyArray<string>, everyName: boolean): number => {
  const lines = Math.max(1, ...categories.map((category) => wrapTickLabel(category).length));
  return everyName && categories.length > 1 ? Math.max(2, lines) : lines;
};

/**
 * The x-axis area sized to the tallest wrapped tick, instead of a fixed 112px that a chart
 * of short dates spent on nothing.
 */
export function tickAreaHeight(categories: ReadonlyArray<string>, everyName = false): number {
  const lines = neededTickLines(categories, everyName);
  return Math.min(MAX_TICK_AREA_PX, TICK_PADDING_PX + lines * TICK_LINE_HEIGHT_PX);
}

/** The plot plus its axis area: what the screen chart is actually tall. */
export function chartHeight(categories: ReadonlyArray<string>, everyName = false): number {
  return PLOT_HEIGHT_PX + tickAreaHeight(categories, everyName);
}

// ponytail: the average width of one 12px tick character, not a measurement; measure with
// Recharts' getStringSize if a tick is ever seen running into its neighbour.
const TICK_CHAR_PX = 7;

/**
 * A category tick wrapped to the width its band has, at most `maxLines` lines: a word wider
 * than the band, or a name longer than the lines, ends in an ellipsis. At 1280px a band holds
 * the 18 characters `wrapTickLabel` wraps at, so a wide chart prints exactly what it did.
 */
export function fitTickLabel(value: string, bandPx: number, maxLines: number): string[] {
  const max = Math.max(3, Math.min(18, Math.floor(bandPx / TICK_CHAR_PX)));
  const cut = (text: string) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
  const lines = wrapTickLabel(value, max).map(cut);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  const last = kept[maxLines - 1] ?? '';
  kept[maxLines - 1] = last.endsWith('…') ? last : `${last.slice(0, max - 1)}…`;
  return kept;
}

const HORIZONTAL_VALUE_AXIS_PX = 40;

/**
 * A chart laid on its side grows with its rows instead: each row as tall as its bars side by
 * side, never less than two lines of category name and a marker.
 */
export function horizontalChartHeight(rows: number, barsPerRow: number): number {
  return HORIZONTAL_VALUE_AXIS_PX + rows * Math.max(48, barsPerRow * 18 + 12);
}
