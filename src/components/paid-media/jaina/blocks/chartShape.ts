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

/** Charts whose rows are entities (bars, slices) rather than moments in time. */
const ROWS_ARE_ENTITIES: ReadonlySet<string> = new Set(['bar', 'stacked_bar', 'pie', 'doughnut']);

export type ChartShape = {
  points: number;
  entities: number;
  earnsChart: boolean;
};

type ShapeInput = Pick<ChartBlockV2, 'chart_type' | 'data' | 'chart_config'>;

/**
 * Points are the rows. Entities are the rows of a categorical chart (one bar or slice per
 * entity) and the series of a temporal one (one line per entity).
 */
export function chartShapeOf(block: ShapeInput): ChartShape {
  const points = block.data.length;
  const series = Object.keys(block.chart_config).length;
  const entities = ROWS_ARE_ENTITIES.has(block.chart_type) ? points : series;
  return {
    points,
    entities,
    earnsChart: points >= CHART_MIN_POINTS || entities >= CHART_MIN_ENTITIES,
  };
}

/** A category label split into lines of at most 18 characters, on word boundaries. */
export function wrapTickLabel(value: string): string[] {
  return value.split(/\s+/).reduce<string[]>((lines, word) => {
    const previous = lines.at(-1);
    if (!previous || `${previous} ${word}`.length > 18) lines.push(word);
    else lines[lines.length - 1] = `${previous} ${word}`;
    return lines;
  }, []);
}

const PLOT_HEIGHT_PX = 240;
const TICK_LINE_HEIGHT_PX = 15;
const TICK_PADDING_PX = 16;
export const MAX_TICK_AREA_PX = 112;

/**
 * The x-axis area sized to the tallest wrapped tick, instead of a fixed 112px that a chart
 * of short dates spent on nothing.
 */
export function tickAreaHeight(categories: ReadonlyArray<string>): number {
  const lines = Math.max(1, ...categories.map((category) => wrapTickLabel(category).length));
  return Math.min(MAX_TICK_AREA_PX, TICK_PADDING_PX + lines * TICK_LINE_HEIGHT_PX);
}

/** The plot plus its axis area: what the screen chart is actually tall. */
export function chartHeight(categories: ReadonlyArray<string>): number {
  return PLOT_HEIGHT_PX + tickAreaHeight(categories);
}
