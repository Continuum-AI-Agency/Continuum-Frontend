// The Delivery headroom view's figures (Meta twin of the auction share): what it costs to reach
// a thousand people (CPM) against what a result costs, one point per branch or campaign, from
// the same rows as the Branches view. A point low on both axes has room to take budget: it
// reaches people cheaply and turns them into results cheaply. The view names the cheapest to
// reach and the best at converting, which are often not the same branch.

import { metaHeadroomEmptySentence, metaHeadroomSentence } from '@continuum/contracts';
import { formatCurrency } from '@/components/paid-media/optimizer/format';
import { MIN_CALLABLE_RESULTS, type MixModel, type MixRow } from './branchesModel';
import { formatMoneyRange } from './metaLensModel';

/** A row below this share of the spend is too small to read as a point of its own. */
const MIN_POINT_SPEND_SHARE = 0.01;
/** More points than this stop being readable at a board module's width. */
const MAX_POINTS = 10;

export type HeadroomPoint = MixRow & { cpm: number; costPerResult: number };

export type HeadroomModel = {
  points: HeadroomPoint[];
  /** Rows that spent but have no result (or no impressions) to place: named under the chart. */
  unplaced: MixRow[];
  /** Rows left off the chart: too small, past MAX_POINTS, or folding unnamed campaigns. */
  smallCount: number;
  cheapest: HeadroomPoint | null;
  best: HeadroomPoint | null;
  cpmRange: { lo: number; hi: number } | null;
  takeaway: string;
};

function isPoint(row: MixRow): row is HeadroomPoint {
  return row.cpm != null && row.costPerResult != null;
}

function lowest(points: readonly HeadroomPoint[], value: (point: HeadroomPoint) => number) {
  return points.reduce<HeadroomPoint | null>(
    (low, point) => (low == null || value(point) < value(low) ? point : low),
    null,
  );
}

export function buildHeadroom(mix: MixModel, currency: string | null): HeadroomModel {
  const large = mix.rows.filter((row) => !row.folded && row.spendShare >= MIN_POINT_SPEND_SHARE);
  const placed = large.filter(isPoint).sort((a, b) => b.spend - a.spend);
  const points = placed.slice(0, MAX_POINTS);
  const unplaced = large.filter((row) => !isPoint(row));
  const smallCount = mix.rows.length - large.length + (placed.length - points.length);
  const callable = points.filter((point) => (point.results ?? 0) >= MIN_CALLABLE_RESULTS);
  const pool = callable.length > 0 ? callable : points;
  const cheapest = lowest(pool, (point) => point.cpm);
  const best = lowest(pool, (point) => point.costPerResult);
  const cpms = points.map((point) => point.cpm);
  const cpmRange = cpms.length > 0 ? { lo: Math.min(...cpms), hi: Math.max(...cpms) } : null;
  return {
    points,
    unplaced,
    smallCount,
    cheapest,
    best,
    cpmRange,
    takeaway: takeawayOf(mix, cheapest, best, currency),
  };
}

function takeawayOf(
  mix: MixModel,
  cheapest: HeadroomPoint | null,
  best: HeadroomPoint | null,
  currency: string | null,
): string {
  const result = mix.result?.kind ?? null;
  if (!cheapest || !best) return metaHeadroomEmptySentence(result);
  return metaHeadroomSentence(
    result,
    { label: cheapest.label, cpm: formatCurrency(cheapest.cpm, currency) },
    { label: best.label, cost: formatCurrency(best.costPerResult, currency) },
  );
}

/** The figure a small Headroom view leads with: the CPM spread across the points. */
export function headroomHeadline(
  model: HeadroomModel,
  mix: MixModel,
  currency: string | null,
): { figure: string; caption: string } | null {
  if (!model.cpmRange) return null;
  const noun = mix.by === 'branch' ? 'branch' : 'campaign';
  const { lo, hi } = model.cpmRange;
  return {
    figure: lo === hi ? formatCurrency(lo, currency) : formatMoneyRange(lo, hi, currency),
    caption: model.cheapest
      ? `CPM by ${noun} · ${model.cheapest.label} is the cheapest to reach`
      : `CPM by ${noun}`,
  };
}

export type Scale = { min: number; max: number; ticks: number[] };

/** Round ticks over a padded domain that holds every value (and the goal). */
export function niceScale(values: readonly number[], count = 4, pad = 0.08): Scale {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return { min: 0, max: 1, ticks: [0, 1] };
  let lo = Math.min(...finite);
  let hi = Math.max(...finite);
  if (lo === hi) {
    lo = lo * 0.9;
    hi = hi * 1.1 || 1;
  }
  const span = hi - lo;
  lo = Math.max(0, lo - span * pad);
  hi = hi + span * pad;
  const raw = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * magnitude;
  const ticks: number[] = [];
  for (let tick = Math.ceil(lo / step) * step; tick <= hi + 1e-9; tick += step) {
    ticks.push(Number(tick.toFixed(6)));
  }
  return { min: lo, max: hi, ticks };
}

/** A label's box on the chart, in pixels. */
type LabelBox = { x0: number; x1: number; y0: number; y1: number };
export type PlacedLabel = { x: number; y: number; anchor: 'start' | 'end' };

/** Roughly 12px semibold sans: wide enough that two labels judged apart never touch. */
const charWidth = 7;

function boxOf(label: PlacedLabel, text: string): LabelBox {
  const w = text.length * charWidth + 4;
  const x0 = label.anchor === 'end' ? label.x - w : label.x;
  return { x0, x1: x0 + w, y0: label.y - 11, y1: label.y + 3 };
}

const overlaps = (a: LabelBox, b: LabelBox) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const circleBox = (circle: { cx: number; cy: number; r: number }): LabelBox => ({
  x0: circle.cx - circle.r - 3,
  x1: circle.cx + circle.r + 3,
  y0: circle.cy - circle.r - 3,
  y1: circle.cy + circle.r + 3,
});

/**
 * Where the goal line's label and each point's label go: the first spot, in reading order of
 * preference, that stays inside the chart and clears every point and every label placed before
 * it. The goal label tries the line's right end, then its left end, above and then below the
 * line; a point label tries its right, its left, then above and below.
 */
export function placeScatterLabels(args: {
  circles: readonly { cx: number; cy: number; r: number; text: string }[];
  goal: { y: number; text: string } | null;
  left: number;
  right: number;
}): { goal: PlacedLabel | null; points: PlacedLabel[] } {
  const { circles, left, right } = args;
  const taken: LabelBox[] = circles.map(circleBox);
  const inside = (box: LabelBox) => box.x0 >= left - 2 && box.x1 <= right + 2;
  const pick = (candidates: PlacedLabel[], text: string, own?: LabelBox): PlacedLabel => {
    const fitting = candidates.filter((candidate) => inside(boxOf(candidate, text)));
    const free = fitting.find((candidate) => {
      const box = boxOf(candidate, text);
      return !taken.some((other) => other !== own && overlaps(box, other));
    });
    const chosen = free ?? fitting[0] ?? (candidates[0] as PlacedLabel);
    taken.push(boxOf(chosen, text));
    return chosen;
  };
  const goal = args.goal
    ? pick(
        [
          { x: right, y: args.goal.y - 6, anchor: 'end' },
          { x: left + 4, y: args.goal.y - 6, anchor: 'start' },
          { x: right, y: args.goal.y + 15, anchor: 'end' },
          { x: left + 4, y: args.goal.y + 15, anchor: 'start' },
        ],
        args.goal.text,
      )
    : null;
  const points = circles.map((circle, index) =>
    pick(
      [
        { x: circle.cx + circle.r + 6, y: circle.cy + 4, anchor: 'start' },
        { x: circle.cx - circle.r - 6, y: circle.cy + 4, anchor: 'end' },
        { x: circle.cx + circle.r + 2, y: circle.cy - circle.r - 4, anchor: 'start' },
        { x: circle.cx + circle.r + 2, y: circle.cy + circle.r + 13, anchor: 'start' },
        { x: circle.cx - circle.r - 2, y: circle.cy - circle.r - 4, anchor: 'end' },
        { x: circle.cx - circle.r - 2, y: circle.cy + circle.r + 13, anchor: 'end' },
      ],
      circle.text,
      taken[index],
    ),
  );
  return { goal, points };
}
