'use client';

// The chips a stale portfolio wears wherever it is listed: "last cycle 49 days ago" and
// "roster gone since Aug 6 · 12 of 12 ad sets". One component, so the Overview card, the
// Portfolios list, the Actions queue header and the portfolio page all say it in the same
// words and the same register as the row's other state chips. Renders nothing when the
// read carries no staleness — including every row from the RPC before the migration.

import type { PortfolioListItem } from '@continuum/contracts';
import { StatusChip } from '../components/StatusChip';
import { rosterLine, rosterTone, staleLine } from './portfolioStaleness';

type StalenessChipsProps = {
  portfolio: Pick<
    PortfolioListItem,
    | 'stale_for_days'
    | 'last_actual_cycle_at'
    | 'roster_state'
    | 'roster_absent_since'
    | 'roster_missing_count'
    | 'adset_count'
  >;
};

const STALE_HINT =
  'The scheduler keeps claiming this portfolio, but no cycle has landed on it in at least two intervals.';
const ROSTER_HINT = 'These enrolled ad sets are no longer on Meta, so no cycle can score them.';

export function StalenessChips({ portfolio }: StalenessChipsProps) {
  const stale = staleLine(portfolio);
  const roster = rosterLine(portfolio);
  const tone = rosterTone(portfolio);
  if (!stale && !roster) return null;
  return (
    <>
      {stale ? (
        <StatusChip hint={STALE_HINT} testId="stale-chip" tone="warning">
          {stale}
        </StatusChip>
      ) : null}
      {roster && tone ? (
        <StatusChip hint={ROSTER_HINT} testId="roster-chip" tone={tone}>
          {roster}
        </StatusChip>
      ) : null}
    </>
  );
}
