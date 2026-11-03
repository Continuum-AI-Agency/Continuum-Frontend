'use client';

// H06 Budget pacing: what the brand's running budget plans have spent so far, against the plan and
// against what the plan expected by the day the spend covers. Only Optimizer portfolios with a
// flight have a plan; without one the tile says so and links to where a plan is set. Money is per
// currency, never added across; the headline is the currency most running plans are in.
//
// Headline: `data-value` = spend to date of the lead currency's running flights (the engine's
// figure, cents); the direct read is in pacingModel.ts's header (the bench anchor).

import Link from 'next/link';
import { lazy } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/home/format';
import { cn } from '@/lib/utils';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import { PlanBar } from './PlanBar';
import { dayLabel, gapLabel, PACE_TONE } from './pacingFormat';
import { optimizerHref, type PacingCurrencyGroup, pacingView } from './pacingModel';
import { usePacingReads } from './usePacingReads';

const Module = lazy(() => import('./Module'));

const EXPANDED_DESCRIPTION =
  'Spend to date against each portfolio’s budget plan, from the Optimizer’s latest daily cycle.';

function ReadyBody({
  headline,
  others,
  size,
}: {
  headline: PacingCurrencyGroup;
  others: PacingCurrencyGroup[];
  size: HomeTileProps['tile']['size'];
}) {
  const { currency } = headline;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p
        className="font-semibold text-2xl tabular-nums tracking-tight"
        data-currency={currency ?? ''}
        data-testid="home-tile-pacing-headline"
        data-value={String(headline.spent)}
      >
        {formatMoney(headline.spent, currency)}{' '}
        <span className="font-normal text-muted-foreground text-xs">spent</span>
      </p>
      <PlanBar group={headline} />
      <p className="text-muted-foreground text-xs leading-snug">
        of {formatMoney(headline.plan, currency)} plan
        {headline.through
          ? ` · ${formatMoney(headline.expected, currency)} expected by ${dayLabel(headline.through)}`
          : ''}
      </p>
      <p className={cn('font-medium text-xs', PACE_TONE[headline.pace])}>
        {gapLabel(headline.gap, headline.gapPct, currency)}
      </p>
      {size !== 's'
        ? others.map((group) => (
            <p
              className="truncate text-muted-foreground text-xs"
              data-testid="home-pacing-other-currency"
              key={group.currency ?? 'none'}
            >
              Also {formatMoney(group.spent, group.currency)} of{' '}
              {formatMoney(group.plan, group.currency)} plan ·{' '}
              {gapLabel(group.gap, group.gapPct, group.currency)}
            </p>
          ))
        : null}
    </div>
  );
}

export default function PacingTile({ ctx, tile }: HomeTileProps) {
  const reads = usePacingReads(ctx.brandId);
  const view = pacingView({
    portfolios: reads.portfolios,
    runs: reads.runs,
    accounts: ctx.adAccounts,
    today: reads.today,
  });

  if (view.state === 'loading') {
    return (
      <HomeTileFrame state="loading" tile={tile}>
        <div className="space-y-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-3 w-40" />
        </div>
      </HomeTileFrame>
    );
  }
  if (view.state === 'error') {
    return (
      <HomeTileFrame state="error" tile={tile}>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-muted-foreground text-xs">
            The Optimizer’s budget plans could not be read.
          </p>
          <Button onClick={reads.retry} size="sm" type="button" variant="outline">
            Retry
          </Button>
        </div>
      </HomeTileFrame>
    );
  }
  if (view.state === 'missing') {
    return (
      <HomeTileFrame state="missing" tile={tile}>
        <TileMissing>
          {view.reason}{' '}
          <Link className="hit-area underline underline-offset-2" href={optimizerHref(null)}>
            Open the Optimizer
          </Link>
        </TileMissing>
      </HomeTileFrame>
    );
  }

  const [, ...others] = view.groups;
  return (
    <HomeTileFrame
      badge={`${view.headline.portfolios} ${view.headline.portfolios === 1 ? 'plan' : 'plans'} running`}
      expanded={<Module view={view} />}
      expandedDescription={EXPANDED_DESCRIPTION}
      state="ready"
      tile={tile}
    >
      <ReadyBody headline={view.headline} others={others} size={tile.size} />
    </HomeTileFrame>
  );
}
