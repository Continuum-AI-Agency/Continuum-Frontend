'use client';
import {
  useTranslations as useBetaTranslations,
  useTranslations as useExtraTranslations,
} from 'next-intl';

// The setup tile, on a brand with nothing connected: how many setup steps are done, the next one
// behind the mode's button ("Start", linking to the page where that step is done), and what the
// Home already learned from onboarding (the goal its reading leads with). The expanded module is
// the first-run setup itself.
//
// Headline: `data-value` = setup steps done, `data-total` = steps counted; the direct read is in
// setupModel.ts's header (the bench anchor).

import Link from 'next/link';
import { lazy } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import { GoalLearned } from './GoalLearned';
import { SETUP_MISSING, setupTileView } from './setupModel';

const Module = lazy(() => import('./Module'));

export default function SetupTile({ ctx, tile }: HomeTileProps) {
  const extraUiText = useExtraTranslations('dashboard');

  const betaUiText = useBetaTranslations('dashboard');

  const { setup } = ctx;
  const view = setupTileView(setup);
  // `!setup` repeats what the view already says, for the type of the expanded module's prop.
  if (view.state === 'missing' || !setup) {
    return (
      <HomeTileFrame state="missing" tile={tile}>
        <TileMissing>{SETUP_MISSING}</TileMissing>
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
          ? betaUiText('beta_5c92b0ae0f97')
          : betaUiText('beta_11e34c29bd73', {
              value0: String(view.remaining.length),
            })
      }
      expanded={
        <Module
          brandBookRefreshedAt={ctx.brandBookRefreshedAt}
          goal={ctx.reading.goal}
          setup={setup}
        />
      }
      expandedDescription={extraUiText('home_9c285e3d74ee')}
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
          {view.done} {betaUiText('beta_28391d3bc64e')} {view.total}{' '}
          <span className="font-normal text-muted-foreground text-xs">
            {betaUiText('beta_96866e147861')}
          </span>
        </p>
        <div
          aria-label={betaUiText('beta_13e773017dc9', {
            value0: String(view.done),
            value1: String(view.total),
          })}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
          role="img"
        >
          <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
        </div>
        {next ? (
          <div className="flex min-w-0 items-center gap-2" data-testid="home-setup-next">
            <span className="min-w-0 flex-1 truncate text-xs">{next.label}</span>
            <Link
              className={cn(
                buttonVariants({ size: 'xs', variant: 'default' }),
                'hit-area shrink-0',
              )}
              href={next.href}
            >
              {betaUiText('homeVerbLabel', { mode: ctx.board.mode })}
            </Link>
          </div>
        ) : null}
        {tile.size === 'l' && later.length > 0 ? (
          <ul className="hit-area-column space-y-1" data-testid="home-setup-steps">
            {later.map((step) => (
              <li className="flex min-w-0 items-center gap-2" key={step.id}>
                <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
                  {step.label}
                </span>
                <Link
                  className={cn(
                    buttonVariants({ size: 'xs', variant: 'outline' }),
                    'hit-area shrink-0',
                  )}
                  data-testid="home-setup-step-link"
                  href={step.href}
                >
                  {step.cta}
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
