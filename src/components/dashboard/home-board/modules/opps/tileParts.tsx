'use client';

// Small pieces the Opportunities, Overnight and checklist tiles draw alike.

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import type { WaitingPortfolio } from './oppsModel';

/** A column of one-line text links (the old Home's rule). Each link's `hit-area` pad grows toward
 *  the 24 px floor and the column caps that growth at the gap the rows share, so two rows' pads
 *  never meet; gap-3 plus each link's py-0.5 keeps the row pitch at 24 px. */
export const ROW_LINK_LIST =
  'hit-area-column flex flex-col gap-3 [--hit-area-gap:calc(var(--spacing)*3)]';
export const ROW_LINK = 'hit-area py-0.5 underline-offset-2 hover:underline';

/** oppsModel's waitingLine in the UI language: "9 recommendations · 2 budget moves". */
export function useWaitingLine() {
  const uiText = useTranslations('dashboard');
  return (portfolio: Pick<WaitingPortfolio, 'recommendations' | 'budgetMoves'>) =>
    [
      portfolio.recommendations > 0
        ? uiText('count_plural_one_recommendation_other_recomme_510798b', {
            count: portfolio.recommendations,
          })
        : null,
      portfolio.budgetMoves > 0
        ? uiText('count_plural_one_budget_move_other_budget_mov_6592963', {
            count: portfolio.budgetMoves,
          })
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
}

/** A read that failed: what the tile cannot say, and a Retry. */
export function TileReadError({ children, onRetry }: { children: ReactNode; onRetry: () => void }) {
  const uiText = useTranslations('dashboard');
  return (
    <div className="flex flex-col items-start gap-2" data-testid="home-tile-error" role="alert">
      <p className="text-muted-foreground text-xs leading-snug">{children}</p>
      <Button onClick={onRetry} size="xs" type="button" variant="outline">
        {uiText('retry_942087c')}
      </Button>
    </div>
  );
}
