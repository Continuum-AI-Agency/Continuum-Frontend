'use client';
import {
  useTranslations as useBetaTranslations,
  useLocale as useNumberLocale,
  useLocale as usePacingLocale,
} from 'next-intl';

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
  const numberLocale = useNumberLocale();

  const betaUiText = useBetaTranslations('dashboard');
  const pacingLocale = usePacingLocale();

  const { currency } = headline;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p
        className="font-semibold text-2xl tabular-nums tracking-tight"
        data-currency={currency ?? ''}
        data-testid="home-tile-pacing-headline"
        data-value={String(headline.spent)}
      >
        {formatMoney(headline.spent, currency, numberLocale)}{' '}
        <span className="font-normal text-muted-foreground text-xs">
          {betaUiText('beta_2705d83fa7bc')}
        </span>
      </p>
      <PlanBar group={headline} />
      <p className="text-muted-foreground text-xs leading-snug">
        {betaUiText('beta_28391d3bc64e')} {formatMoney(headline.plan, currency, numberLocale)}{' '}
        {betaUiText('beta_64879f7d6b96')}
        {headline.through
          ? betaUiText('beta_a898121d4496', {
              value0: String(formatMoney(headline.expected, currency, numberLocale)),
              value1: String(dayLabel(headline.through, pacingLocale)),
            })
          : ''}
      </p>
      <p className={cn('font-medium text-xs', PACE_TONE[headline.pace])}>
        {gapLabel(headline.gap, headline.gapPct, currency, betaUiText, pacingLocale)}
      </p>
      {size !== 's'
        ? others.map((group) => (
            <p
              className="truncate text-muted-foreground text-xs"
              data-testid="home-pacing-other-currency"
              key={group.currency ?? 'none'}
            >
              {betaUiText('beta_3edc274f12ee')}{' '}
              {formatMoney(group.spent, group.currency, numberLocale)}{' '}
              {betaUiText('beta_28391d3bc64e')}{' '}
              {formatMoney(group.plan, group.currency, numberLocale)}{' '}
              {betaUiText('beta_a096c030358a')}{' '}
              {gapLabel(group.gap, group.gapPct, group.currency, betaUiText, pacingLocale)}
            </p>
          ))
        : null}
    </div>
  );
}

export default function PacingTile({ ctx, tile }: HomeTileProps) {
  const betaUiText = useBetaTranslations('dashboard');
  const pacingLocale = usePacingLocale();

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
          <p className="text-muted-foreground text-xs">{betaUiText('beta_3c6ab20dee2d')}</p>
          <Button onClick={reads.retry} size="sm" type="button" variant="outline">
            {betaUiText('beta_942087cc2d41')}
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
            {betaUiText('beta_9ec303b5dbb2')}
          </Link>
        </TileMissing>
      </HomeTileFrame>
    );
  }

  const [, ...others] = view.groups;
  return (
    <HomeTileFrame
      badge={betaUiText('beta_f3a3de234dc8', {
        value0: view.headline.portfolios,
      })}
      expanded={<Module view={view} />}
      expandedDescription={betaUiText('homePacingDescription')}
      state="ready"
      tile={tile}
    >
      <ReadyBody headline={view.headline} others={others} size={tile.size} />
    </HomeTileFrame>
  );
}
