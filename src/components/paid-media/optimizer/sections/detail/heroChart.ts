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
//                 returned nothing", or — when it bought something — the engine's measured
//                 interval on its cost per result against the target. Which of the two is a
//                 FACT read from the candidate or the cycle row; a null result count is
//                 unknown, never zero, and an unknown draws no interval at all.
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

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Cost per result for one day; null when the day bought nothing to divide by. */
function costOf(day: RecapDay): number | null {
  if (!(day.results > 0)) return null;
  return Math.round((day.spend / day.results) * 100) / 100;
}

/**
 * What the cycle measured on one ad set: the engine's confidence interval on its cost per
 * result (`latest_items[].diagnostics.ci`). Every field is null when it was not measured —
 * and null is "nobody said", never zero.
 */
export type AdSetMeasure = {
  /** Results over the engine's window; 0 is a measured zero, null is unknown. */
  results: number | null;
  costPerResult: number | null;
  low: number | null;
  high: number | null;
};

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * The engine's interval, read without its sentinels. A zero-event row comes back as
 * `{ cpa: 0, lo: 0, hi: null, events: 0 }`: the zero events are a measurement, the zero cost
 * is not — a window that bought nothing has no cost per result to report.
 */
export function measureOf(
  ci: { cpa?: number; lo?: number; hi?: number | null; events?: number } | null | undefined,
): AdSetMeasure | null {
  if (!ci) return null;
  const results = finite(ci.events) && ci.events >= 0 ? ci.events : null;
  const bought = results !== 0;
  const costPerResult = bought && finite(ci.cpa) && ci.cpa > 0 ? ci.cpa : null;
  const bounded = bought && finite(ci.lo) && finite(ci.hi) && ci.hi > ci.lo;
  return {
    results,
    costPerResult,
    low: bounded ? (ci.lo as number) : null,
    high: bounded ? (ci.hi as number) : null,
  };
}

/**
 * Did the ad set buy anything? true, false, or null for "nothing says".
 *
 * The candidate's own `results_per_day` answers first; the measure answers when it is null.
 * A priced cost per result proves a denominator. When the two DISAGREE the answer is null:
 * a card has no business choosing which of two contradicting facts to draw.
 */
export function boughtAnything(
  candidate: Pick<BriefCandidate, 'results_per_day'>,
  measured: AdSetMeasure | null | undefined,
): boolean | null {
  const fromCandidate = candidate.results_per_day != null ? candidate.results_per_day > 0 : null;
  const fromMeasure =
    measured?.results != null
      ? measured.results > 0
      : measured?.costPerResult != null
        ? true
        : null;
  if (fromCandidate != null && fromMeasure != null && fromCandidate !== fromMeasure) return null;
  return fromCandidate ?? fromMeasure;
}

/**
 * The pause candidate's own interval: what it spent, against the line it had to beat.
 *
 * Two arguments are drawable, and which one depends on a FACT, never on a missing field:
 *
 *   bought nothing   — the interval is unbounded above, and that is the entire case for
 *                      pausing. The floor is what one result would already have cost.
 *   bought something — the engine's own interval on the ad set's cost per result, with its
 *                      point estimate, against the target.
 *
 * When nothing says which (the candidate's results are null and the cycle measured nothing
 * on the ad set) this draws nothing: a "no results" picture of an ad set that bought eight
 * leads is the one outcome worse than no picture.
 */
function pauseInterval(
  candidate: BriefCandidate,
  measured: AdSetMeasure | null,
  target: number | null,
  resultLabel: string,
): AccountChart | null {
  if (candidate.module !== 'pause') return null;
  if (!(candidate.impact_per_day > 0)) return null;
  const bought = boughtAnything(candidate, measured);
  // The axis is a cost per result, and says so rather than leaving the view to work it out.
  // Same words as the growth read's own axis, because it is the same quantity.
  const valueLabel = `Cost per ${resultLabel.toLowerCase()}`;
  const reference = { reference: target, reference_label: target != null ? 'target' : null };
  if (bought === false) {
    return {
      shape: 'interval',
      unit: 'currency',
      value_label: valueLabel,
      // No results means no point estimate exists. Saying so is the point.
      estimate: null,
      low: candidate.impact_per_day,
      high: candidate.impact_per_day * 2,
      ...reference,
      at_stake_per_day: candidate.impact_per_day,
      no_results: true,
    };
  }
  if (
    bought === true &&
    measured?.costPerResult != null &&
    measured.low != null &&
    measured.high != null
  ) {
    return {
      shape: 'interval',
      unit: 'currency',
      value_label: valueLabel,
      estimate: round2(measured.costPerResult),
      low: round2(measured.low),
      high: round2(measured.high),
      ...reference,
      at_stake_per_day: candidate.impact_per_day,
      no_results: false,
    };
  }
  return null;
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
  /** What the cycle measured on the candidate's own ad set, when it measured anything. */
  measured?: AdSetMeasure | null;
  series: RecapDay[];
  target: number | null;
  /** The objective's own word, so the axis never says "results" on a conversations account. */
  resultLabel: string;
}): ArguingChart | null {
  const { candidate, series, target, resultLabel } = args;
  const own = candidate
    ? pauseInterval(candidate, args.measured ?? null, target, resultLabel)
    : null;
  const drawn = own ?? growthRates(series, target, resultLabel, candidate?.impact_per_day ?? null);
  return chartArgues(drawn) ? drawn : null;
}

/** One line under the chart saying which of the two a reader is looking at. */
export function heroChartReading(chart: AccountChart | null): string | null {
  if (!chart) return null;
  if (chart.shape === 'interval') {
    if (chart.no_results) {
      return 'what it spent, against the line it had to beat — the whole interval sits short of it';
    }
    const measured = 'its cost per result, with the interval the engine measured';
    if (chart.reference == null) return measured;
    if (chart.low > chart.reference)
      return `${measured} — the whole interval sits above the target`;
    if (chart.high < chart.reference)
      return `${measured} — the whole interval sits under the target`;
    return `${measured} — the interval reaches the target`;
  }
  if (chart.shape === 'rates') {
    return 'cost per result across the window, against the target';
  }
  return null;
}
