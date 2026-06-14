// ---------------------------------------------------------------------------
// Pacing — decides the TOTAL daily budget to feed the reallocation, so the
// portfolio hits its planned period budget despite Meta over/under-delivering.
//   ideal daily      = periodBudget / periodDays
//   remaining budget = periodBudget - actualSpendToDate
//   new daily total  = remaining / remaining days   (linear catch-up)
// The mode (efficiency/balanced/scale) decides how this number is USED.
// ---------------------------------------------------------------------------

import type { PacingResult, PacingState } from './types';

export function computePacing(p: PacingState): PacingResult {
  const idealDaily = p.periodBudget / Math.max(1, p.periodDays);
  // spend that "should" have happened before today
  const idealCumulative = idealDaily * Math.max(0, p.dayIndex - 1);

  const remainingBudget = Math.max(0, p.periodBudget - p.actualSpendToDate);
  const remainingDays = Math.max(1, p.periodDays - (p.dayIndex - 1));
  const dailyTotal = remainingBudget / remainingDays;

  const pacingRatio = idealCumulative > 0 ? p.actualSpendToDate / idealCumulative : 1;
  let status: PacingResult['status'] = 'on_track';
  if (pacingRatio > 1.05) status = 'overpacing';
  else if (pacingRatio < 0.95) status = 'underpacing';

  const note =
    status === 'on_track'
      ? `On track (${(pacingRatio * 100).toFixed(0)}% of ideal cumulative).`
      : status === 'underpacing'
        ? `Underpacing (${(pacingRatio * 100).toFixed(0)}%): daily raised to $${dailyTotal.toFixed(0)} to catch up.`
        : `Overpacing (${(pacingRatio * 100).toFixed(0)}%): daily lowered to $${dailyTotal.toFixed(0)} to stay on plan.`;

  return { dailyTotal, idealCumulative, pacingRatio, status, note };
}
