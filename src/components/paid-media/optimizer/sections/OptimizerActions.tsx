'use client';

// Actions sub-view — the account-wide approvals queue. Pending engine
// recommendations are grouped per portfolio (approve / reject), and approved
// fatigue renewals surface as tracked tasks (mark done / dismiss). Mirrors the
// Actions tab of the reference-ui-preview spec.

import type { PortfolioListItem, RenewalTask } from '@continuum/contracts';
import { CheckCircle2Icon } from 'lucide-react';

import { EmptyState } from '@/components/shared/state/EmptyState';
import { AdLevelPreviewNotice } from './AdLevelPreviewNotice';
import { OptimizerActionsPortfolioGroup } from './OptimizerActionsPortfolioGroup';
import { RenewalTaskRow } from './RenewalTaskRow';

type OptimizerActionsProps = {
  brandId: string;
  adAccountId: string;
  portfolios: PortfolioListItem[];
  renewals: RenewalTask[];
};

export function OptimizerActions({
  brandId,
  adAccountId,
  portfolios,
  renewals,
}: OptimizerActionsProps) {
  const portfoliosWithPending = portfolios.filter(
    (portfolio) => portfolio.pending_recommendations > 0,
  );

  const hasWork = portfoliosWithPending.length > 0 || renewals.length > 0;

  if (!hasWork) {
    // The notice STAYS on the empty state. "All caught up" is exactly where a reader is most
    // likely to conclude the account is handled — and ad-level actions are the ones that are not.
    return (
      <div className="space-y-4">
        <AdLevelPreviewNotice />
        <EmptyState
          headline="You’re all caught up"
          media={<CheckCircle2Icon aria-hidden="true" />}
          description="No pending recommendations or open renewal tasks. New actions appear here after the next optimization cycle."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdLevelPreviewNotice />
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
