'use client';

// H04 Opportunities: how many decisions wait on the brand across its Optimizer portfolios, and
// where. One read — optimizer_list_portfolios, the Optimizer's own brand-scoped entry, which the
// Overnight and checklist tiles share. The decisions themselves open in the expanded module: the
// Optimizer's Actions queue, with its own approve and dismiss.
//
// The main button links to the Optimizer's Actions page rather than carrying the mode's verb: no
// verb the board names ("Create paused", "Send for approval", "Add to checklist") is a write the
// Optimizer makes on a waiting decision, and the queue's Approve lives inside each decision.
//
// A second read, the Backend's Opportunity stack (R1), adds the biggest opportunity's impact in the
// brand's goal. It only adds: without it (the route is not deployed yet) the tile is as above.

import { type HomeOpportunitiesData, homeOpportunitiesReadSchema } from '@continuum/contracts';
import Link from 'next/link';
import { lazy, useMemo } from 'react';
import { useOptimizerPortfolios } from '@/components/paid-media/optimizer/useOptimizerData';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import { readyDataOf } from '../../homeRead';
import type { HomeTileProps } from '../../types';
import { useHomeGoalRead } from '../../useHomeGoalRead';
import {
  OPPS_MISSING,
  OPTIMIZER_LINKS,
  oppsViewOf,
  portfolioDecisionsHref,
  waitingLine,
} from './oppsModel';
import { oppImpactLine, oppLeadOf } from './oppsStack';
import { ROW_LINK, ROW_LINK_LIST, TileReadError } from './tileParts';

const Module = lazy(() => import('./Module'));

const ROWS_AT_SIZE = { l: 4, m: 2, s: 0 } as const;

export default function OppsTile({ ctx, tile }: HomeTileProps) {
  const portfolios = useOptimizerPortfolios(ctx.brandId, null);
  const { hasAnswer, isError, refetch, brandPortfolios } = portfolios;
  const stack = readyDataOf(
    useHomeGoalRead<HomeOpportunitiesData>(ctx, {
      name: 'opportunities',
      schema: homeOpportunitiesReadSchema,
    }),
  );
  const lead = oppLeadOf(stack);
  const view = useMemo(
    () => (hasAnswer ? oppsViewOf(brandPortfolios) : null),
    [hasAnswer, brandPortfolios],
  );

  if (view == null) {
    return isError ? (
      <HomeTileFrame state="error" tile={tile}>
        <TileReadError onRetry={() => void refetch()}>
          The Optimizer's portfolios could not be read, so this tile cannot say what waits.
        </TileReadError>
      </HomeTileFrame>
    ) : (
      <HomeTileFrame state="loading" tile={tile}>
        <Skeleton className="h-16 w-full" />
      </HomeTileFrame>
    );
  }

  if (view.state === 'missing') {
    return (
      <HomeTileFrame state="missing" tile={tile}>
        <TileMissing>{OPPS_MISSING}</TileMissing>
        <Link className={cn(ROW_LINK, 'mt-2 inline-block text-xs')} href={OPTIMIZER_LINKS.create}>
          Create a portfolio
        </Link>
      </HomeTileFrame>
    );
  }

  const rows = view.portfolios.slice(0, ROWS_AT_SIZE[tile.size]);
  const [first] = view.portfolios;

  return (
    <HomeTileFrame
      badge={`${view.waiting} waiting`}
      expanded={<Module brandId={ctx.brandId} portfolios={view.portfolios} stack={stack} />}
      expandedDescription="The decisions waiting in each portfolio, with the Optimizer's own approve and dismiss."
      state="ready"
      tile={tile}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <p className="flex items-baseline gap-2">
          <span
            className="font-semibold text-3xl tabular-nums tracking-tight"
            data-testid="home-tile-opps-headline"
            data-value={view.waiting}
          >
            {view.waiting}
          </span>
          <span className="text-muted-foreground text-xs">
            {view.waiting === 1 ? 'decision waiting' : 'decisions waiting'}
          </span>
        </p>
        {lead ? (
          <p
            className="min-w-0 text-xs leading-snug"
            data-goal-units={lead.impact.goalUnits ?? undefined}
            data-money={lead.impact.moneyPerDay}
            data-testid="home-tile-opps-impact"
            data-unit={lead.impact.unit}
          >
            <span className="font-semibold tabular-nums">
              {oppImpactLine(lead, stack?.goal ?? null)}
            </span>
            <span className="text-muted-foreground"> · {lead.label}</span>
          </p>
        ) : null}
        {view.waiting === 0 ? (
          <p className="text-muted-foreground text-xs">Nothing waits for a decision right now.</p>
        ) : rows.length > 0 ? (
          <ul className={ROW_LINK_LIST} data-testid="home-tile-opps-portfolios">
            {rows.map((portfolio) => (
              <li
                className="flex min-w-0 items-baseline justify-between gap-2 text-xs"
                key={portfolio.id}
              >
                <Link
                  className={cn(ROW_LINK, 'min-w-0 truncate')}
                  href={portfolioDecisionsHref(portfolio.id)}
                >
                  {portfolio.name}
                </Link>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {waitingLine(portfolio)}
                </span>
              </li>
            ))}
          </ul>
        ) : first ? (
          <p className="truncate text-muted-foreground text-xs">
            {first.name}: {waitingLine(first)}
          </p>
        ) : null}
        <div>
          <Link
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
            data-testid="home-tile-opps-review"
            href={OPTIMIZER_LINKS.actions}
          >
            Review decisions
          </Link>
        </div>
      </div>
    </HomeTileFrame>
  );
}
