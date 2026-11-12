'use client';
import { useTranslations as useBetaTranslations } from 'next-intl';

// The expanded Opportunities: every portfolio with a decision waiting, most first. Opening one
// mounts the Optimizer's own queue for it (OptimizerActionsPortfolioGroup, the Actions page's
// group): its decisions with their evidence and money per day, and the approve and dismiss the
// Optimizer already wires. Only the open portfolio reads its queue, so the module costs one
// portfolio's reads at a time. Platform cards (Google, TikTok) ride in as on the Actions page.

import type { AccountCandidate, HomeOpportunitiesData, PlatformId } from '@continuum/contracts';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { boardPaletteClass } from '@/components/paid-media/optimizer/sections/board/palette';
import { OptimizerActionsPortfolioGroup } from '@/components/paid-media/optimizer/sections/OptimizerActionsPortfolioGroup';
import {
  type PlatformCardsState,
  useOptimizerPlatformCards,
} from '@/components/paid-media/optimizer/useOptimizerData';
import { bareAccountId } from '@/lib/paid-media/accountId';
import { cn } from '@/lib/utils';
import { OppStack } from './OppStack';
import {
  OPPS_GOAL_UNITS_NOTE,
  OPTIMIZER_LINKS,
  portfolioDecisionsHref,
  type WaitingPortfolio,
  waitingLine,
} from './oppsModel';
import { ROW_LINK } from './tileParts';

const NO_CARDS: AccountCandidate[] = [];

/** The open portfolio's pending cards on one platform; [] until that read answers. */
function cardsFor(state: PlatformCardsState, portfolioId: string): AccountCandidate[] {
  if (state.status !== 'ready') return NO_CARDS;
  return state.cards.filter((card) => card.portfolio_ids.includes(portfolioId));
}

function OpenQueue({ brandId, waiting }: { brandId: string; waiting: WaitingPortfolio }) {
  const { portfolio } = waiting;
  const on = (platform: PlatformId) => portfolio.platforms.includes(platform);
  // A platform the portfolio is not on is never read: an empty brand id disables the query.
  const google = useOptimizerPlatformCards(on('google_ads') ? brandId : '', 'google_ads');
  const tiktok = useOptimizerPlatformCards(on('tiktok_ads') ? brandId : '', 'tiktok_ads');
  const platformCards = useMemo(
    () => [...cardsFor(google, portfolio.id), ...cardsFor(tiktok, portfolio.id)],
    [google, tiktok, portfolio.id],
  );
  return (
    <OptimizerActionsPortfolioGroup
      adAccountId={portfolio.ad_account_id ? bareAccountId(portfolio.ad_account_id) : ''}
      brandId={brandId}
      platformCards={platformCards}
      portfolio={portfolio}
    />
  );
}

export default function OppsModule({
  brandId,
  portfolios,
  stack,
}: {
  brandId: string;
  portfolios: WaitingPortfolio[];
  /** The Backend's Opportunity stack; null until it is deployed or when it holds nothing. */
  stack: HomeOpportunitiesData | null;
}) {
  const betaUiText = useBetaTranslations('dashboard');

  const [openId, setOpenId] = useState<string | null>(portfolios[0]?.id ?? null);

  const priced = stack && stack.opportunities.length > 0 ? stack : null;

  if (portfolios.length === 0) {
    return (
      <div className="space-y-4 text-sm" data-testid="home-opps-module">
        {priced ? <OppStack stack={priced} /> : null}
        <p>{betaUiText('beta_e5b7556ea7de')}</p>
        <Link className={cn(ROW_LINK, 'text-xs')} href={OPTIMIZER_LINKS.actions}>
          {betaUiText('beta_10044b235272')}
        </Link>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', boardPaletteClass)} data-testid="home-opps-module">
      {priced ? (
        <OppStack stack={priced} />
      ) : (
        <p className="text-muted-foreground text-xs" data-testid="home-opps-goal-units">
          {OPPS_GOAL_UNITS_NOTE}
        </p>
      )}
      <ul className="space-y-3">
        {portfolios.map((waiting) => {
          const open = waiting.id === openId;
          return (
            <li className="rounded-lg border" data-testid="home-opps-portfolio" key={waiting.id}>
              <div className="flex min-w-0 items-center justify-between gap-2 p-3">
                <button
                  aria-expanded={open}
                  className="hit-area flex min-w-0 items-center gap-1.5 text-left font-medium text-sm"
                  onClick={() => setOpenId(open ? null : waiting.id)}
                  type="button"
                >
                  {open ? (
                    <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0" />
                  ) : (
                    <ChevronRightIcon aria-hidden="true" className="size-4 shrink-0" />
                  )}
                  <span className="truncate">{waiting.name}</span>
                </button>
                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                  {waitingLine(waiting)}
                </span>
              </div>
              {open ? (
                <div className="space-y-2 border-t p-3">
                  <OpenQueue brandId={brandId} waiting={waiting} />
                  <Link
                    className={cn(ROW_LINK, 'text-xs')}
                    href={portfolioDecisionsHref(waiting.id)}
                  >
                    {betaUiText('beta_ed077f3d8125')} {waiting.name}{' '}
                    {betaUiText('beta_104ba91c867e')}
                  </Link>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
