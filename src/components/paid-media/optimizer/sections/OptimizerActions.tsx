'use client';
import { useTranslations } from 'next-intl';

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
import { portfolioPlatforms } from './platforms/platformTabsModel';
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
  const uiText = useTranslations('scale');
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
    const nextCycle = nextCycleLabel(soonestNextCycle(portfolios), undefined, uiText);

    return (
      <div className="space-y-4">
        <EmptyState
          action={
            <Button onClick={onBrowsePortfolios} size="sm" type="button">
              {uiText('see_portfolios_06ede1e')}
            </Button>
          }
          description={
            portfolios.length === 0
              ? uiText('no_portfolios_on_this_ad_account_yet_create_o_0f59ac0')
              : nextCycle
                ? uiText('template_103ec6b8f098', { count: portfolios.length, next: nextCycle })
                : uiText('template_f0a073f61bcf', { count: portfolios.length })
          }
          headline={uiText('activityNoDecisions')}
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
            headerLead={<PlatformChips platforms={portfolioPlatforms(portfolio.platforms)} />}
            platformCards={platformCards.get(portfolio.id) ?? NO_CARDS}
            portfolio={portfolio}
          />
        </div>
      ))}

      {renewals.length > 0 ? (
        <section>
          <h3 className={`${typeScale.label} mb-1 font-semibold text-muted-foreground`}>
            {uiText.rich('sentence_e23e2193b9ee', {
              v0: () => <span className="font-mono tabular-nums">{renewals.length}</span>,
            })}
          </h3>
          <ul className="divide-y divide-border/60 border-border/60 border-y">
            {renewals.map((task) => (
              <RenewalTaskRow key={task.id} brandId={brandId} task={task} />
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            {uiText('approving_a_fatigue_renewal_opens_a_tracked_t_936f1c9')}
          </p>
        </section>
      ) : null}
    </div>
  );
}
