// What the cycle measured, read without its sentinels — the facts the news cards draw from.
//
// THE RULE, and it is the whole module: null is "nobody said", never zero. A zero-event row
// comes back from the engine as `{ cpa: 0, lo: 0, hi: null, events: 0 }`; the zero events are a
// measurement, the zero cost is not. A brief candidate's `results_per_day` is null on every
// pause it carries, and reading that null as zero once drew "no results to divide by" under a
// pause of an ad set that bought 8 leads. `measureOf` and `boughtAnything` are the two places
// that decide what a zero means, and every card visual asks them (see ./news/cardVisual).

import type { BriefCandidate } from '@continuum/contracts';
import type { RecapDay } from './recapModel';

/** Cost per result for one day; null when the day bought nothing to divide by. */
export function costOf(day: RecapDay): number | null {
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
