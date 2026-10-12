// ---------------------------------------------------------------------------
// Pacing — decides the TOTAL daily budget to feed the reallocation, so the
// portfolio hits its planned period budget despite Meta over/under-delivering.
//   ideal daily      = periodBudget / periodDays
//   remaining budget = periodBudget - actualSpendToDate
//   new daily total  = remaining / remaining days   (linear catch-up)
// The mode (efficiency/balanced/scale) decides how this number is USED.
//
// The result carries the flight STATE it was computed from (budget, days, day index,
// spend to date). It used to return only the verdict, and the cycle persisted that verdict
// verbatim — so the dashboard could read "underpacing" off a run but never "spent 41% of
// the budget with 52% of the flight elapsed", because the budget and the spend were never
// on the same row. Carrying the inputs is what makes the persisted row self-describing.
// ---------------------------------------------------------------------------

import { formatMoney } from '@continuum/contracts';
import type { PacingResult, PacingState } from './types';

/** `currency` is the ad account's, for the daily total the note prints; null prints bare. */
export function computePacing(p: PacingState, currency: string | null = null): PacingResult {
  const idealDaily = p.periodBudget / Math.max(1, p.periodDays);
  // spend that "should" have happened before today
  const idealCumulative = idealDaily * Math.max(0, p.dayIndex - 1);

  const remainingBudget = Math.max(0, p.periodBudget - p.actualSpendToDate);
  const remainingDays = Math.max(1, p.periodDays - (p.dayIndex - 1));
  const dailyTotal = remainingBudget / remainingDays;

  // A verdict compares spend to date against what the plan expected by now. On day 1 the
  // plan expected nothing, so the ratio is 1 by construction and says nothing about
  // delivery: that is `unknown`, not `on_track`.
  const measurable = idealCumulative > 0;
  const pacingRatio = measurable ? p.actualSpendToDate / idealCumulative : 1;
  let status: PacingResult['status'] = 'unknown';
  if (measurable) {
    status = pacingRatio > 1.05 ? 'overpacing' : pacingRatio < 0.95 ? 'underpacing' : 'on_track';
  }

  const note =
    status === 'unknown'
      ? `Day ${p.dayIndex} of ${p.periodDays}: nothing was due before today, so there is no pacing verdict yet; daily set to ${formatMoney(dailyTotal, currency)} to spend the plan.`
      : status === 'on_track'
        ? `On track (${(pacingRatio * 100).toFixed(0)}% of ideal cumulative).`
        : status === 'underpacing'
          ? `Underpacing (${(pacingRatio * 100).toFixed(0)}%): daily raised to ${formatMoney(dailyTotal, currency)} to catch up.`
          : `Overpacing (${(pacingRatio * 100).toFixed(0)}%): daily lowered to ${formatMoney(dailyTotal, currency)} to stay on plan.`;

  return {
    dailyTotal,
    idealCumulative,
    pacingRatio,
    status,
    note,
    source: 'pacing',
    periodBudget: p.periodBudget,
    periodDays: p.periodDays,
    dayIndex: p.dayIndex,
    actualSpendToDate: p.actualSpendToDate,
  };
}
