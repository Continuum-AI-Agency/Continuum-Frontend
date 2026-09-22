// The chart IS the formula.
//
// Every one of the twenty-five detectors ends in an arithmetic sentence, and a card that
// shows the sentence without showing the comparison behind it is asking to be believed.
// So each candidate carries a chart built from EXACTLY the figures its `impact_basis`
// names — not a second reading of the data, not a model's idea of a good illustration.
// The picture cannot disagree with the number, because it is drawn from the number.
//
// Twenty-five formulas, seven shapes. The shape follows the arithmetic, so the mapping is
// a fact about the maths rather than a design preference:
//
//   transfer   a ratio of two costs times a movable amount   M × (1 − CPA_b / CPA_a)
//   threshold  a sum against a line                          Σ conv ≥ 50
//   share      a share against a reference band              share_stage vs band
//   rates      two series and the gap between them           new/week vs dying/week
//   interval   an estimate with its uncertainty, vs a line   CPA ± CI vs target
//   headroom   a value against its ceiling                   frequency vs ceiling
//   quadrant   two metrics crossed                           CTR vs CVR

import { z } from 'zod';
// Type-only on purpose: `account-strategy` imports this module's schema at RUNTIME, so a
// runtime import back would be a cycle — and a cycle leaves one of the two uninitialised.
import type { AccountDetector, CandidateHeadline } from './account-strategy';

const money = z.number();
const label = z.string().min(1).max(60);

/**
 * Money moving from an expensive side to a cheaper one.
 *
 * Draws both costs as columns, the movable amount as the flow between them, and the saving
 * as the part of the source column the destination does not need. Reading it out loud gives
 * the formula back: this costs X, that costs Y, we can move M, so we keep the difference.
 */
export const transferChartSchema = z.object({
  shape: z.literal('transfer'),
  unit: z.enum(['currency', 'count']).default('currency'),
  from: z.object({ label, cost_per_result: money, spend_per_day: money }),
  to: z.object({ label, cost_per_result: money, spend_per_day: money }),
  movable_per_day: money,
  saving_per_day: money,
});

/** Columns against a line, plus the combined column that clears it. */
export const thresholdChartSchema = z.object({
  shape: z.literal('threshold'),
  unit: z.enum(['currency', 'count']).default('count'),
  bars: z.array(z.object({ label, value: z.number() })).min(1),
  threshold: z.number(),
  threshold_label: label,
  /** The bar the bars become once combined — absent when combining is not the action. */
  combined: z.object({ label, value: z.number() }).nullable().default(null),
});

/** How a whole is split, against the band it should sit in. */
export const shareChartSchema = z.object({
  shape: z.literal('share'),
  /** Fractions of 1, in the order they should be drawn. */
  slices: z.array(z.object({ label, share: z.number().min(0).max(1), value: money })).min(1),
  /** The slice the recommendation is about. */
  focus_label: label,
  band: z.object({ low: z.number().min(0).max(1), high: z.number().min(0).max(1) }).nullable(),
  band_label: label.nullable().default(null),
});

/** Two series over the same days, and the gap that is the point. */
export const ratesChartSchema = z.object({
  shape: z.literal('rates'),
  unit: z.enum(['currency', 'count', 'ratio']).default('count'),
  points: z.array(z.object({ t: z.string(), a: z.number(), b: z.number().nullable() })).min(2),
  a_label: label,
  b_label: label,
  /** Drawn as a dashed continuation — a projection is never the same line as a fact. */
  projected_from: z.string().nullable().default(null),
  /** What the gap is worth per day, when the gap has a price. */
  gap_per_day: money.nullable().default(null),
});

/** An estimate with its uncertainty, against the line it has to beat. */
export const intervalChartSchema = z.object({
  shape: z.literal('interval'),
  unit: z.enum(['currency', 'count']).default('currency'),
  /**
   * What the value axis measures, in the detector's own words — "Cost per lead",
   * "Spend with nothing to show for it".
   *
   * The axis is otherwise anonymous: `unit` says money-or-count and `reference_label` names
   * the LINE, neither of which says what the numbers along the axis are. A view with no name
   * for its value axis either prints nothing or makes one up, and a made-up axis name is the
   * first thing to contradict the data when a detector changes its metric. So the producer
   * says it here, once, next to the figures it is describing.
   *
   * Optional rather than defaulted, because two detectors already ship this shape without it.
   * Absent means "this producer did not name its axis" — a fact the view can act on — where a
   * default string would be exactly the invented label this field exists to prevent.
   */
  value_label: label.nullish(),
  estimate: z.number().nullable(),
  low: z.number(),
  high: z.number(),
  reference: z.number().nullable(),
  reference_label: label.nullable().default(null),
  /** "$120/day at stake" — the money the interval is deciding about. */
  at_stake_per_day: money.nullable().default(null),
  /** Set when the estimate is unbounded because the denominator is zero conversions. */
  no_results: z.boolean().default(false),
});

/** A value against its ceiling, and the room that is left. */
export const headroomChartSchema = z.object({
  shape: z.literal('headroom'),
  unit: z.enum(['currency', 'count', 'ratio']).default('ratio'),
  gauges: z
    .array(z.object({ label, value: z.number(), ceiling: z.number(), good_when_low: z.boolean() }))
    .min(1),
  /** The move the headroom permits, when there is one. */
  step_per_day: money.nullable().default(null),
});

/** Two metrics crossed, with the lines that name the four corners. */
export const quadrantChartSchema = z.object({
  shape: z.literal('quadrant'),
  x_label: label,
  y_label: label,
  x_split: z.number(),
  y_split: z.number(),
  points: z
    .array(
      z.object({ label, x: z.number(), y: z.number(), weight: money.nullable().default(null) }),
    )
    .min(1),
  /** The corner the recommendation is about, e.g. "high clicks, low conversion". */
  focus_corner: z.enum(['xy_high', 'x_high_y_low', 'x_low_y_high', 'xy_low']),
});

export const accountChartSchema = z.discriminatedUnion('shape', [
  transferChartSchema,
  thresholdChartSchema,
  shareChartSchema,
  ratesChartSchema,
  intervalChartSchema,
  headroomChartSchema,
  quadrantChartSchema,
]);
export type AccountChart = z.infer<typeof accountChartSchema>;
export type AccountChartShape = AccountChart['shape'];

/**
 * Which shape each detector's arithmetic takes.
 *
 * Five detectors share `transfer` because they share one formula on different axes —
 * portfolios, placements, formats, regions, optimisation events — and drawing them the
 * same way is the honest consequence of computing them the same way.
 */
export const CHART_SHAPE_BY_DETECTOR: Record<AccountDetector, AccountChartShape> = {
  portfolio_reallocation: 'transfer',
  placement_mix: 'transfer',
  format_gap: 'transfer',
  market_allocation: 'transfer',
  optimization_event: 'transfer',

  structure_consolidation: 'threshold',
  bid_strategy: 'threshold',

  funnel_coverage: 'share',
  testing_discipline: 'share',
  new_vs_returning: 'share',
  platform_diversification: 'share',
  angle_concentration: 'share',

  creative_supply: 'rates',
  account_pacing: 'rates',
  decision_window: 'rates',
  auction_pressure: 'rates',
  account_saturation: 'rates',
  seasonality: 'rates',
  audience_overlap: 'rates',

  dead_tail: 'interval',
  measurement_integrity: 'interval',

  scale_readiness: 'headroom',
  guardrail_bottleneck: 'headroom',

  post_click: 'quadrant',
  target_economics: 'quadrant',
};

/** One line saying what the reader is looking at, per shape. */
export const CHART_SHAPE_READING: Record<AccountChartShape, string> = {
  transfer: 'what it costs here, what it costs there, and what the move keeps',
  threshold: 'each one is short of the line; together they clear it',
  share: 'how the whole is split, against where it should sit',
  rates: 'two rates over the same days, and the gap between them',
  interval: 'the estimate with its uncertainty, against the line it has to beat',
  headroom: 'where it stands against its ceiling, and what the room allows',
  quadrant: 'two metrics crossed, and the corner this falls in',
};

export const chartShapeFor = (detector: AccountDetector): AccountChartShape =>
  CHART_SHAPE_BY_DETECTOR[detector];

/**
 * Does this chart draw the figure the card claims?
 *
 * The one invariant worth enforcing: a `transfer` whose saving does not follow from its own
 * costs and movable amount is a picture contradicting its sentence. Checked at the boundary
 * rather than trusted, because the two are produced together and drift together.
 */
export function chartAgreesWithImpact(chart: AccountChart, impactPerDay: number): boolean {
  if (chart.shape !== 'transfer') return true;
  const { from, to, movable_per_day: moved } = chart;
  if (!(moved > 0) || !(from.cost_per_result > 0) || !(to.cost_per_result > 0)) return false;
  const implied = moved * (1 - to.cost_per_result / from.cost_per_result);
  const tolerance = Math.max(0.02 * Math.abs(implied), 0.5);
  return (
    Math.abs(implied - chart.saving_per_day) <= tolerance &&
    Math.abs(chart.saving_per_day - impactPerDay) <= tolerance
  );
}

/**
 * Does this chart ARGUE, or is it the arithmetic the sentence already made?
 *
 * A trend and an interval each say something the sentence cannot: how a figure has been
 * moving across a window, and how much of the estimate is uncertainty. A reader gets a fact
 * out of them that is not in the words.
 *
 * The other five draw the arithmetic itself. "This costs X, that costs Y, move M, keep the
 * difference" is a complete argument as a sentence; a picture of it is the same claim again
 * in a shape, and a surface that opens on ONE recommendation — the portfolio's news card —
 * pays for that decoration in the space the justification needed. So the news card draws a
 * chart only when the chart argues, and stays with the sentence when it does not.
 *
 * Surfaces that list MANY candidates side by side (the account read, a Jaina card) are a
 * different question and keep drawing every shape: there the picture is how a reader tells
 * two candidates apart at a glance. This predicate is the rule, not the enforcement — it
 * names which shapes argue so the one surface that cares can ask.
 */
export const ARGUING_SHAPES = ['rates', 'interval'] as const satisfies readonly AccountChartShape[];

/** A chart that argues — the only two shapes a one-recommendation surface may draw. */
export type ArguingChart = Extract<AccountChart, { shape: (typeof ARGUING_SHAPES)[number] }>;

/**
 * A type guard on purpose: a surface that gates on this gets `ArguingChart` back, so the
 * rule is carried by its return type rather than by a runtime check someone can quietly
 * delete. Take the gate out of `heroChart` and the Frontend stops compiling.
 */
export const chartArgues = (chart: AccountChart | null | undefined): chart is ArguingChart =>
  chart != null && (ARGUING_SHAPES as readonly AccountChartShape[]).includes(chart.shape);

/** Every detector has a shape; the test that proves it imports the enum itself. */
export const CHART_SHAPES: readonly AccountChartShape[] = [
  'transfer',
  'threshold',
  'share',
  'rates',
  'interval',
  'headroom',
  'quadrant',
] as const;

// ---------------------------------------------------------------------------
// Does the picture argue the same thing the words do?
//
// `chartArgues` above decides WHETHER a chart earns its space. It says nothing about whether
// the chart argues the CARD'S argument, and that is the gap this section closes. A card
// leading with "57% below the median rate" beside a drawing of spend over time is two true
// statements that do not meet: the reader is handed a figure and a picture and left to work
// out that they are about different quantities. Measured on the live Easy Fit account,
// `dead_tail` ships exactly that — it leads with 69.75 a day buying nothing and draws an
// interval of 188.19 to 376.38 against a target of 35, three different quantities in one card.
//
// THE TIE IS `from`/`to`. A headline's `value` is a summary — "57%", "33% cheaper" — computed
// from two sides, and a summary is not a thing a chart can place. The SIDES are: `from` and
// `to` are declared in the chart's own terms, which is why `portfolio_reallocation`'s
// 60.85 → 40.56 are literally the two bars of its transfer. So a headline that declares its
// pair can be checked against the drawing, and one that declares no pair has nothing tying it
// to the drawing at all.
// ---------------------------------------------------------------------------

/**
 * Every value a shape PLACES — a bar's height, a point, a line, an end of a band.
 *
 * What is deliberately absent is the whole point: `at_stake_per_day`, `gap_per_day`,
 * `saving_per_day`, `movable_per_day` and `step_per_day` are annotations a producer hangs on
 * a chart whose axis measures something else. No renderer draws them, and treating them as
 * marks is precisely the hole a mismatch hides in — `dead_tail` carries its headline figure in
 * `at_stake_per_day` and draws a band that never reaches it.
 *
 * Shares are emitted as percentages because that is the unit a `share` headline speaks in; the
 * slice values are emitted too, because the widths are drawn from them.
 */
export function chartMarks(chart: AccountChart): number[] {
  switch (chart.shape) {
    case 'transfer':
      return [chart.from.cost_per_result, chart.to.cost_per_result];
    case 'threshold':
      return [
        chart.threshold,
        ...chart.bars.map((bar) => bar.value),
        ...(chart.combined ? [chart.combined.value] : []),
      ];
    case 'share':
      return [
        ...chart.slices.flatMap((slice) => [slice.share * 100, slice.value]),
        ...(chart.band ? [chart.band.low * 100, chart.band.high * 100] : []),
      ];
    case 'rates':
      return chart.points.flatMap((point) => (point.b == null ? [point.a] : [point.a, point.b]));
    case 'interval':
      return [
        chart.low,
        chart.high,
        ...(chart.estimate != null ? [chart.estimate] : []),
        ...(chart.reference != null ? [chart.reference] : []),
      ];
    case 'headroom':
      return chart.gauges.flatMap((gauge) => [gauge.value, gauge.ceiling]);
    case 'quadrant':
      return [chart.x_split, chart.y_split, ...chart.points.flatMap((point) => [point.x, point.y])];
  }
}

/**
 * The tolerance a figure is recognised at.
 *
 * Headline values are rounded for display and chart values are rounded to cents, so exact
 * equality would fail on arithmetic that agrees perfectly. A hundredth of the figure, with a
 * floor of a hundredth, is tight enough that two genuinely different quantities never collide
 * and loose enough that 26.65 and 26.6512 are the same number.
 */
function reaches(marks: readonly number[], value: number): boolean {
  const tolerance = Math.max(Math.abs(value) * 0.01, 0.01);
  return marks.some((mark) => Math.abs(mark - value) <= tolerance);
}

/**
 * Is the headline drawn on THESE marks?
 *
 * Three cases, and they are a statement about how much the card can PROVE, not a fallback
 * chain:
 *
 *   both sides declared — the strong case. Both must be marks. This is every `efficiency`
 *                         and every paired `drift` headline, and it is the case that holds:
 *                         `portfolio_reallocation` 60.85 → 40.56 are its two bars, and
 *                         `post_click` 11.43 → 26.65 are a point's y and the median line.
 *   one side declared   — that side must be a mark. The `share` detectors live here: their
 *                         `to` is the band edge the slice is read against.
 *   neither declared    — nothing ties the two together, so the value itself has to be on the
 *                         drawing. Across the twenty-five detectors this is where every real
 *                         mismatch sits, which is the finding rather than a coincidence: a
 *                         headline with no pair was never checked against its own picture.
 *
 * Takes marks rather than a chart because an `AccountChart` is not the only thing a card
 * draws beside its figure. The optimizer's justification block draws the engine's confidence
 * interval on cost per result, from its own structure, and it had exactly the same disease —
 * so it asks the same question through this function rather than through a second rule that
 * would drift from this one.
 *
 * A card with no headline agrees vacuously: there is no second claim to contradict. Returning
 * true there is not leniency, it is the absence of a disagreement.
 */
export function headlineIsDrawnOn(
  headline: CandidateHeadline | null | undefined,
  marks: readonly number[],
): boolean {
  if (!headline) return true;
  if (headline.from != null && headline.to != null) {
    return reaches(marks, headline.from) && reaches(marks, headline.to);
  }
  if (headline.from != null) return reaches(marks, headline.from);
  if (headline.to != null) return reaches(marks, headline.to);
  return reaches(marks, headline.value);
}

/** Does the chart draw the figures the headline is computed from? */
export function headlineAgreesWithChart(
  headline: CandidateHeadline | null | undefined,
  chart: AccountChart | null | undefined,
): boolean {
  if (!headline || !chart) return true;
  return headlineIsDrawnOn(headline, chartMarks(chart));
}
