'use client';

// The setup tile, on a brand with nothing connected: how many setup steps are done, the next one
// behind the mode's button ("Start", linking to the page where that step is done), and what the
// Home already learned from onboarding (the goal its reading leads with). The expanded module is
// the first-run setup itself.
//
// Headline: `data-value` = setup steps done, `data-total` = steps counted; the direct read is in
// setupModel.ts's header (the bench anchor).

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { lazy } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { localizeDashboardCopy } from '@/i18n/dashboardCopy';
import { cn } from '@/lib/utils';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import { GoalLearned } from './GoalLearned';
import { setupTileView } from './setupModel';

const Module = lazy(() => import('./Module'));

export default function SetupTile({ ctx, tile }: HomeTileProps) {
  const uiText = useTranslations('dashboard');
  const { setup } = ctx;
  const view = setupTileView(setup);
  // `!setup` repeats what the view already says, for the type of the expanded module's prop.
  if (view.state === 'missing' || !setup) {
    return (
      <HomeTileFrame state="missing" tile={tile}>
        <TileMissing>{uiText('this_brand_s_setup_steps_could_not_be_read_1b781a5')}</TileMissing>
      </HomeTileFrame>
    );
  }

  const { next } = view;
  const later = view.remaining.filter((step) => step.id !== next?.id);
  const share = view.total > 0 ? (view.done / view.total) * 100 : 0;
  return (
    <HomeTileFrame
      badge={
        view.remaining.length === 0
          ? uiText('setup_done_5c92b0a')
          : uiText('count_left_796ea0b', { count: view.remaining.length })
      }
      expanded={
        <Module
          brandBookRefreshedAt={ctx.brandBookRefreshedAt}
          goal={ctx.reading.goal}
          setup={setup}
        />
      }
      expandedDescription={uiText('connect_an_account_and_finish_the_brand_book__9c285e3')}
      state="ready"
      tile={tile}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <p
          className="font-semibold text-2xl tabular-nums tracking-tight"
          data-testid="home-tile-setup-headline"
          data-total={view.total}
          data-value={view.done}
        >
          {uiText.rich('done_of_total_muted_setup_steps_muted_5fc2359', {
            done: view.done,
            total: view.total,
            muted: (chunks) => (
              <span className="font-normal text-muted-foreground text-xs">{chunks}</span>
            ),
          })}
        </p>
        <div
          aria-label={uiText('done_of_total_setup_steps_done_230a764', {
            done: view.done,
            total: view.total,
          })}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="img"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
        </div>
        {next ? (
          <div className="flex min-w-0 items-center gap-2" data-testid="home-setup-next">
            <span className="min-w-0 flex-1 truncate text-xs">
              {localizeDashboardCopy(next.label, uiText)}
            </span>
            <Link
              className={cn(
                buttonVariants({ size: 'xs', variant: 'default' }),
                'hit-area shrink-0',
              )}
              href={next.href}
            >
              {ctx.board.verb.label}
            </Link>
          </div>
        ) : null}
        {tile.size === 'l' && later.length > 0 ? (
          <ul className="hit-area-column space-y-1" data-testid="home-setup-steps">
            {later.map((step) => (
              <li className="flex min-w-0 items-center gap-2" key={step.id}>
                <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
                  {localizeDashboardCopy(step.label, uiText)}
                </span>
                <Link
                  className={cn(
                    buttonVariants({ size: 'xs', variant: 'outline' }),
                    'hit-area shrink-0',
                  )}
                  data-testid="home-setup-step-link"
                  href={step.href}
                >
                  {localizeDashboardCopy(step.cta, uiText)}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        {tile.size !== 's' ? <GoalLearned goal={ctx.reading.goal} /> : null}
      </div>
    </HomeTileFrame>
  );
}
