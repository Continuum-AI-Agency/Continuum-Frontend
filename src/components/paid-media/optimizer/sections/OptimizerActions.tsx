'use client';

// Actions sub-view — the account-wide approvals queue. Each portfolio with pending work
// renders its own unified queue (budget moves + recommendations) that approves AND executes
// through the real write path of the portfolio's platform; approved fatigue renewals surface as tracked tasks. The
// standing "ad-level is preview" banner is gone: ad-level rows now carry a per-row danger
// tooltip inside the queue, so the limit shows exactly where it applies.
//
// The list is the selected account's portfolios plus the brand's on Google and TikTok (the page
// shell merges them). Each portfolio's pending platform cards (optimizer_get_platform_cards)
// ride into its group, where they render with their own control, as on the platform's tab.

import type { AccountCandidate, PortfolioListItem, RenewalTask } from '@continuum/contracts';
import { CheckCircle2Icon } from 'lucide-react';
import { useMemo } from 'react';

import { EmptyState } from '@/components/shared/state/EmptyState';
import { Button } from '@/components/ui/button';
import { nextCycleLabel, soonestNextCycle } from '../format';
import { hasPendingWork } from '../reportModel';
import * as typeScale from '../typeScale';
import { type PlatformCardsState, useOptimizerPlatformCards } from '../useOptimizerData';
import { OptimizerActionsPortfolioGroup } from './OptimizerActionsPortfolioGroup';
import { PlatformChips } from './platforms/PlatformChip';
import { OPTIMIZER_PORTFOLIO_PLATFORMS } from './platforms/platformTabsModel';
import { RenewalTaskRow } from './RenewalTaskRow';

type OptimizerActionsProps = {
  brandId: string;
  adAccountId: string;
  portfolios: PortfolioListItem[];
  renewals: RenewalTask[];
  onBrowsePortfolios: () => void;
};

const NO_CARDS: AccountCandidate[] = [];

/** Portfolio id → its pending platform cards, from every platform read that answered. A read
 *  that has not (or failed) hands no cards, and its recommendations stay queue rows. */
function cardsByPortfolio(states: readonly PlatformCardsState[]): Map<string, AccountCandidate[]> {
  const byPortfolio = new Map<string, AccountCandidate[]>();
  for (const state of states) {
    if (state.status !== 'ready') continue;
    for (const card of state.cards) {
      for (const portfolioId of card.portfolio_ids) {
        byPortfolio.set(portfolioId, [...(byPortfolio.get(portfolioId) ?? []), card]);
      }
    }
  }
  return byPortfolio;
}

export function OptimizerActions({
  brandId,
  adAccountId,
  portfolios,
  renewals,
  onBrowsePortfolios,
}: OptimizerActionsProps) {
  const googleCards = useOptimizerPlatformCards(brandId, 'google_ads');
  const tiktokCards = useOptimizerPlatformCards(brandId, 'tiktok_ads');
  const platformCards = useMemo(
    () => cardsByPortfolio([googleCards, tiktokCards]),
    [googleCards, tiktokCards],
  );
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
    <div className="space-y-10">
      {portfoliosWithPending.map((portfolio) => (
        <div key={portfolio.id} data-testid="actions-portfolio">
          <OptimizerActionsPortfolioGroup
            brandId={brandId}
            adAccountId={adAccountId}
            headerLead={
              <PlatformChips
                platforms={
                  portfolio.platforms.length > 0 ? portfolio.platforms : OPTIMIZER_PORTFOLIO_PLATFORMS
                }
              />
            }
            platformCards={platformCards.get(portfolio.id) ?? NO_CARDS}
            portfolio={portfolio}
          />
        </div>
      ))}

      {renewals.length > 0 ? (
        <section>
          <h3 className={`${typeScale.label} mb-1 font-semibold text-muted-foreground`}>
            Approved renewals · tasks{' '}
            <span className="font-mono tabular-nums">{renewals.length}</span>
          </h3>
          <ul className="divide-y divide-border/60 border-border/60 border-y">
            {renewals.map((task) => (
              <RenewalTaskRow key={task.id} brandId={brandId} task={task} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            Approving a fatigue renewal opens a tracked task — the engine never auto-refreshes a
            creative. It leaves the pending feed and lands here until the team actions it.
          </p>
        </section>
      ) : null}
    </div>
  );
}
