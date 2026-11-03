// The words the pacing tile and its module share: a day as the Optimizer names it ("Nov 2") and
// the gap against what the plan expected, in words — never a bare minus sign.
import type { FlightPacingStatus } from '@/components/paid-media/optimizer/charts/flightPacingModel';
import { formatMoney } from '@/lib/home/format';

const DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function dayLabel(day: string): string {
  return DAY.format(new Date(`${day}T00:00:00Z`));
}

/** "$4,459 MXN behind (74%)", "$5 USD ahead (3%)"; "Nothing expected yet" on day one. */
export function gapLabel(gap: number, gapPct: number | null, currency: string | null): string {
  if (gapPct === null) return 'Nothing expected yet';
  if (gap === 0) return 'Exactly on plan';
  const side = gap > 0 ? 'ahead' : 'behind';
  return `${formatMoney(Math.abs(gap), currency)} ${side} (${Math.abs(gapPct)}%)`;
}

export const PACE_TONE: Record<FlightPacingStatus, string> = {
  on_track: 'text-emerald-600 dark:text-emerald-400',
  underpacing: 'text-amber-600 dark:text-amber-400',
  overpacing: 'text-amber-600 dark:text-amber-400',
};
