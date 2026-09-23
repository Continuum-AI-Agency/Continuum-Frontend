// The one chart the portfolio hero opens on, in place of three static tiles.
//
// THE RULE, and it is the whole module: the chart is drawn from the SAME figures the hero's
// sentence names. Never a second reading of the data, never a scale invented to make a bar look
// better, and never a shape whose arithmetic the candidate cannot actually supply. Where the
// figures are not there, this returns null and the hero keeps the sentence alone — an honest
// absence beats an invented picture.
//
// Two charts are reachable, and the distinction matters:
//
//   `interval`  — the candidate's OWN argument, when it is a pause. "This cost this much and
//                 returned nothing; the interval does not reach the target." That is the
//                 recommendation's arithmetic, drawn.
//
//   `rates`     — the portfolio's own cost per result against its target, over the window the
//                 tiles already covered. This is NOT the recommendation's arithmetic and is not
//                 presented as it: it is the growth read the three tiles used to show, drawn as
//                 a line instead of frozen into three numbers. Strictly more of the same data,
//                 never different data.
//
// A `budget` candidate carries a money figure and a results-gained figure, and no from/to cost
// split — so there is no honest `transfer` to draw for it. It gets the growth chart, and the
// recommendation keeps its sentence. Inventing a from/to pair to fill the shape is exactly the
// failure this comment exists to prevent.

import {
  type AccountChart,
  type ArguingChart,
  type BriefCandidate,
  chartArgues,
} from '@continuum/contracts';
import type { RecapDay } from './recapModel';

/** Cost per result for one day; null when the day bought nothing to divide by. */
function costOf(day: RecapDay): number | null {
  if (!(day.results > 0)) return null;
  return Math.round((day.spend / day.results) * 100) / 100;
}

/**
 * The pause candidate's own interval: what it spent, against the line it had to beat.
 *
 * Only reachable when the candidate says it gained nothing — which is what makes the interval
 * unbounded above and is the entire argument for pausing. A pause candidate that DID produce
 * results is a different recommendation and does not get this chart.
 */
function pauseInterval(
  candidate: BriefCandidate,
  target: number | null,
  resultLabel: string,
): AccountChart | null {
  if (candidate.module !== 'pause') return null;
  if (candidate.results_per_day != null && candidate.results_per_day > 0) return null;
  if (!(candidate.impact_per_day > 0)) return null;
  return {
    shape: 'interval',
    unit: 'currency',
    // The axis is a cost per result, and says so rather than leaving the view to work it
    // out. With zero results the floor is what a single result would ALREADY have cost —
    // the only figure the spend proves, and the one the target is comparable to. Same words
    // as the growth read's own axis, because it is the same quantity.
    value_label: `Cost per ${resultLabel.toLowerCase()}`,
    // No results means no point estimate exists. Saying so is the point.
    estimate: null,
    low: candidate.impact_per_day,
    high: candidate.impact_per_day * 2,
    reference: target,
    reference_label: target != null ? 'target' : null,
    at_stake_per_day: candidate.impact_per_day,
    no_results: true,
  };
}

/**
 * The growth read, drawn: cost per result across the window against the target.
 *
 * `b` is the target repeated, which the renderer draws as the line the series is measured
 * against. Days that bought nothing carry `a: null`-equivalent handling by being dropped —
 * a zero would assert the day was free, which is the opposite of what happened.
 */
function growthRates(
  series: RecapDay[],
  target: number | null,
  resultLabel: string,
  gapPerDay: number | null,
): AccountChart | null {
  const points = series
    .map((day) => ({ t: day.date, cost: costOf(day) }))
    .filter((point): point is { t: string; cost: number } => point.cost != null)
    .map((point) => ({ t: point.t, a: point.cost, b: target }));
  // Two points is the minimum a line can honestly be drawn from.
  if (points.length < 2) return null;
  return {
    shape: 'rates',
    unit: 'currency',
    points,
    a_label: `Cost per ${resultLabel.toLowerCase()}`,
    b_label: target != null ? 'Target' : 'No target set',
    projected_from: null,
    gap_per_day: gapPerDay,
  };
}

/**
 * The hero's chart, or null.
 *
 * Order is deliberate: the candidate's own argument wins when it can be drawn, and the growth
 * read is the fallback rather than the other way round. A reader looking at a pause card should
 * see the pause's arithmetic, not the portfolio's average.
 *
 * And the last word belongs to `chartArgues`: the news card draws a chart only when the chart
 * ARGUES — a trend, or an interval — because a drawing of arithmetic the sentence already made
 * is decoration, and it is paid for out of the space the justification needed. The gate sits
 * here, at the one place the hero's chart is chosen, rather than inside the renderer: the same
 * renderer draws all seven shapes for the surfaces that list many candidates at once, where the
 * picture is how a reader tells two of them apart.
 */
export function heroChart(args: {
  candidate: BriefCandidate | null;
  series: RecapDay[];
  target: number | null;
  /** The objective's own word, so the axis never says "results" on a conversations account. */
  resultLabel: string;
}): ArguingChart | null {
  const { candidate, series, target, resultLabel } = args;
  const own = candidate ? pauseInterval(candidate, target, resultLabel) : null;
  const drawn = own ?? growthRates(series, target, resultLabel, candidate?.impact_per_day ?? null);
  return chartArgues(drawn) ? drawn : null;
}

/** One line under the chart saying which of the two a reader is looking at. */
export function heroChartReading(chart: AccountChart | null): string | null {
  if (!chart) return null;
  if (chart.shape === 'interval') {
    return 'what it spent, against the line it had to beat — the whole interval sits short of it';
  }
  if (chart.shape === 'rates') {
    return 'cost per result across the window, against the target';
  }
  return null;
}
