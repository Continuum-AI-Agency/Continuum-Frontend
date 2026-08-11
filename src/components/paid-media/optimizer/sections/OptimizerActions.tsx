'use client';

// Actions sub-view — the account-wide approvals queue. Each portfolio with pending work
// renders its own unified queue (budget moves + recommendations) that approves AND executes
// through the real Meta write path; approved fatigue renewals surface as tracked tasks. The
// standing "ad-level is preview" banner is gone: ad-level rows now carry a per-row danger
// tooltip inside the queue, so the limit shows exactly where it applies.

import type { PortfolioListItem, RenewalTask } from '@continuum/contracts';
import { CheckCircle2Icon } from 'lucide-react';

import { EmptyState } from '@/components/shared/state/EmptyState';
import { Button } from '@/components/ui/button';
import { nextCycleLabel, soonestNextCycle } from '../format';
import { hasPendingWork } from '../reportModel';
import { OptimizerActionsPortfolioGroup } from './OptimizerActionsPortfolioGroup';
import { RenewalTaskRow } from './RenewalTaskRow';

type OptimizerActionsProps = {
  brandId: string;
  adAccountId: string;
  portfolios: PortfolioListItem[];
  renewals: RenewalTask[];
  onBrowsePortfolios: () => void;
};

export function OptimizerActions({
  brandId,
  adAccountId,
  portfolios,
  renewals,
  onBrowsePortfolios,
}: OptimizerActionsProps) {
  // Budget moves are cycle_items, not recommendations — a portfolio with money work and no
  // fired trigger belongs here just as much as one with a pause to approve.
  const portfoliosWithPending = portfolios.filter(hasPendingWork);

  const hasWork = portfoliosWithPending.length > 0 || renewals.length > 0;

  if (!hasWork) {
    // This state used to be a dead end: headline + description, no buttons, no schedule. A user
    // with nothing to approve had no move except to leave the tab. The schedule is already on the
    // portfolio row, and the portfolios view is one click away, so both belong here.
    const nextCycle = nextCycleLabel(soonestNextCycle(portfolios));

    return (
      <div className="space-y-4">
        <EmptyState
          action={
            <Button onClick={onBrowsePortfolios} size="sm" type="button">
              See portfolios
            </Button>
          }
          description={
            portfolios.length === 0
              ? 'No portfolios on this ad account yet. Create one and the optimizer starts scoring it nightly.'
              : nextCycle
                ? `Every ad set in your ${portfolios.length === 1 ? 'portfolio is' : 'portfolios are'} where the optimizer wants it. The next cycle scores ${nextCycle} — anything it wants to change lands here for approval.`
                : `Every ad set in your ${portfolios.length === 1 ? 'portfolio is' : 'portfolios are'} where the optimizer wants it. Anything a future cycle wants to change lands here for approval.`
          }
          headline="Nothing needs your decision"
          media={<CheckCircle2Icon aria-hidden="true" />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {portfoliosWithPending.map((portfolio) => (
        <OptimizerActionsPortfolioGroup
          key={portfolio.id}
          brandId={brandId}
          adAccountId={adAccountId}
          portfolio={portfolio}
        />
      ))}

      {renewals.length > 0 ? (
        <div>
          <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Approved renewals · tasks ({renewals.length})
          </h3>
          <div className="space-y-2">
            {renewals.map((task) => (
              <RenewalTaskRow key={task.id} brandId={brandId} task={task} />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Approving a fatigue renewal opens a tracked task — the engine never auto-refreshes a
            creative. It leaves the pending feed and lands here until the team actions it.
          </p>
        </div>
      ) : null}
    </div>
  );
}
