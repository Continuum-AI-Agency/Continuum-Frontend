'use client';

// H06 Budget pacing: what the brand's running budget plans have spent so far, against the plan and
// against what the plan expected by the day the spend covers. Only Optimizer portfolios with a
// flight have a plan; without one the tile says so and links to where a plan is set. Money is per
// currency, never added across; the headline is the currency most running plans are in.
//
// Headline: `data-value` = spend to date of the lead currency's running flights (the engine's
// figure, cents); the direct read is in pacingModel.ts's header (the bench anchor).

import Link from 'next/link';
import { useTranslations } from 'next-intl';
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

function ReadyBody({
  headline,
  others,
  size,
}: {
  headline: PacingCurrencyGroup;
  others: PacingCurrencyGroup[];
  size: HomeTileProps['tile']['size'];
}) {
  const uiText = useTranslations('dashboard');
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
        <span className="font-normal text-muted-foreground text-xs">{uiText('spent_2705d83')}</span>
      </p>
      <PlanBar group={headline} />
      <p className="text-muted-foreground text-xs leading-snug">
        {headline.through
          ? uiText('of_plan_plan_expected_expected_by_day_97ad0d7', {
              plan: formatMoney(headline.plan, currency),
              expected: formatMoney(headline.expected, currency),
              day: dayLabel(headline.through),
            })
          : uiText('of_plan_plan_7c0b019', { plan: formatMoney(headline.plan, currency) })}
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
              {uiText('also_spent_of_plan_plan_gap_a76de72', {
                spent: formatMoney(group.spent, group.currency),
                plan: formatMoney(group.plan, group.currency),
                gap: gapLabel(group.gap, group.gapPct, group.currency),
              })}
            </p>
          ))
        : null}
    </div>
  );
}

export default function PacingTile({ ctx, tile }: HomeTileProps) {
  const uiText = useTranslations('dashboard');
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
            {uiText('the_optimizer_s_budget_plans_could_not_be_rea_3c6ab20')}
          </p>
          <Button onClick={reads.retry} size="sm" type="button" variant="outline">
            {uiText('retry_942087c')}
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
            {uiText('open_the_optimizer_9ec303b')}
          </Link>
        </TileMissing>
      </HomeTileFrame>
    );
  }

  const [, ...others] = view.groups;
  return (
    <HomeTileFrame
      badge={uiText('count_plural_one_plan_running_other_plans_run_d8e3be6', {
        count: view.headline.portfolios,
      })}
      expanded={<Module view={view} />}
      expandedDescription={uiText('spend_to_date_against_each_portfolio_s_budget_3530762')}
      state="ready"
      tile={tile}
    >
      <ReadyBody headline={view.headline} others={others} size={tile.size} />
    </HomeTileFrame>
  );
}
