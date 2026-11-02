// The arithmetic behind the board's marks: where a cost sits against its goal, the diverging
// colour that says so, the bullet's scale, the ring's share and the trend line's geometry. Pure,
// so a mark and the figure written next to it are computed from the same numbers.
//
// A cost below its goal is good and reads in BOARD_COLOR.below; above it, BOARD_COLOR.above; near
// it, the mid tone. The colour paints marks only (an arc, a dot, a line): text stays in the
// foreground and muted tokens, so a figure never depends on telling two colours apart.

import { BOARD_COLOR } from './palette';

/** Which side of its goal a cost sits on. `none` is "no cost or no goal", never "fine". */
export type GoalSide = 'below' | 'at' | 'above' | 'none';

/** Within this share of the goal a cost reads as on it. */
export const AT_GOAL_TOLERANCE = 0.02;

function usable(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

export function goalSide(
  cost: number | null | undefined,
  goal: number | null | undefined,
): GoalSide {
  if (!usable(cost) || !usable(goal) || goal <= 0) return 'none';
  const ratio = cost / goal;
  if (Math.abs(ratio - 1) <= AT_GOAL_TOLERANCE) return 'at';
  return ratio < 1 ? 'below' : 'above';
}

/** Whole percent over (+) or under (−) the goal; null without both figures. */
export function pctAgainstGoal(
  cost: number | null | undefined,
  goal: number | null | undefined,
): number | null {
  if (!usable(cost) || !usable(goal) || goal <= 0) return null;
  return Math.round((cost / goal - 1) * 100);
}

/** "12% under goal", "33% over goal", "On goal". Empty without both figures. */
export function goalDistanceLabel(
  cost: number | null | undefined,
  goal: number | null | undefined,
): string {
  const side = goalSide(cost, goal);
  if (side === 'none') return '';
  if (side === 'at') return 'On goal';
  return `${Math.abs(pctAgainstGoal(cost, goal) ?? 0)}% ${side === 'below' ? 'under' : 'over'} goal`;
}

/**
 * The diverging colour for a cost against its goal. Halving the goal or doubling it is the full
 * colour; anything nearer mixes toward the mid tone, never under 45% so a small miss still reads
 * as its side. No goal paints the mid tone.
 */
export function divergingColor(
  cost: number | null | undefined,
  goal: number | null | undefined,
): string {
  const side = goalSide(cost, goal);
  if (side === 'none' || side === 'at') return BOARD_COLOR.mid;
  const strength = Math.min(1, Math.abs(Math.log2((cost as number) / (goal as number))));
  const pct = Math.round(45 + 55 * strength);
  const end = side === 'below' ? BOARD_COLOR.below : BOARD_COLOR.above;
  return `color-mix(in oklab, ${end} ${pct}%, ${BOARD_COLOR.mid})`;
}

/** Where a bullet's marks sit, in percent of its track. */
export type BulletScale = {
  /** The figure at the end of the track. */
  max: number;
  goalPct: number | null;
  valuePct: number | null;
  /** The value ran past the end of the track and is pinned there: the figure beside the bullet
   *  still says the true amount. */
  clipped: boolean;
};

/** The track ends 25% past the larger of the goal and the value, but never further than three
 *  goals: a cost at ten times its goal would otherwise squash the goal tick into the corner. */
export function bulletScale(
  value: number | null | undefined,
  goal: number | null | undefined,
): BulletScale {
  const v = usable(value) && value >= 0 ? value : null;
  const g = usable(goal) && goal > 0 ? goal : null;
  const top = Math.max(v ?? 0, g ?? 0);
  const ceiling = g != null ? g * 3 : Number.POSITIVE_INFINITY;
  const max = top > 0 ? Math.min(top * 1.25, ceiling) : 1;
  const pct = (x: number) => Math.min(100, Math.max(0, (x / max) * 100));
  return {
    max,
    goalPct: g == null ? null : pct(g),
    valuePct: v == null ? null : pct(v),
    clipped: v != null && v > max,
  };
}

/** The share of a ring to fill, 0–1. */
export function ringFraction(part: number | null | undefined, whole: number | null | undefined) {
  if (!usable(part) || !usable(whole) || whole <= 0 || part <= 0) return 0;
  return Math.min(1, part / whole);
}

export type TrendPoint = {
  /** The day the point closes, YYYY-MM-DD. */
  day: string;
  /** Null where the day has no figure (no result, or a read that missed it): a gap in the line. */
  value: number | null;
};

export type TrendGeometry = {
  /** SVG path of the line, broken at every gap. */
  line: string;
  /** The same line closed to the baseline, for the faint fill under it. */
  area: string;
  /** Y of the goal line; null without a goal. */
  goalY: number | null;
  last: { x: number; y: number; value: number } | null;
  /** The value range the drawing covers. */
  low: number;
  high: number;
};

/**
 * The line of a trend in a `width` × `height` box, with the goal inside the range so its line is
 * always drawn. The range pads 12% above and below; a flat series gets a range of its own so the
 * line sits in the middle rather than on an edge.
 */
export function trendGeometry(
  points: readonly TrendPoint[],
  goal: number | null | undefined,
  width: number,
  height: number,
): TrendGeometry {
  const values = points.flatMap((point) => (usable(point.value) ? [point.value] : []));
  const g = usable(goal) && goal > 0 ? goal : null;
  const all = g == null ? values : [...values, g];
  let low = all.length > 0 ? Math.min(...all) : 0;
  let high = all.length > 0 ? Math.max(...all) : 1;
  if (high === low) {
    low = Math.max(0, low - Math.abs(low || 1) * 0.5);
    high = high + Math.abs(high || 1) * 0.5;
  }
  const pad = (high - low) * 0.12;
  low = Math.max(0, low - pad);
  high += pad;
  const count = points.length;
  const x = (index: number) => (count <= 1 ? width / 2 : (index / (count - 1)) * width);
  const y = (value: number) => height - ((value - low) / (high - low)) * height;

  let line = '';
  let area = '';
  let run: { x: number; y: number }[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const first = run[0] as { x: number; y: number };
    const lastOfRun = run[run.length - 1] as { x: number; y: number };
    const segment = run
      .map((p, index) => `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join('');
    line += segment;
    area += `${segment}L${lastOfRun.x.toFixed(1)} ${height}L${first.x.toFixed(1)} ${height}Z`;
    run = [];
  };
  let last: TrendGeometry['last'] = null;
  points.forEach((point, index) => {
    if (!usable(point.value)) {
      flush();
      return;
    }
    const at = { x: x(index), y: y(point.value) };
    run.push(at);
    last = { ...at, value: point.value };
  });
  flush();
  return { line, area, goalY: g == null ? null : y(g), last, low, high };
}
