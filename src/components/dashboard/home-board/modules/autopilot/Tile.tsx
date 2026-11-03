'use client';

// H07 Overnight: how many actions the Optimizer's feed recorded for the brand in the last 24 h,
// with what each one did and whether its own row proves it landed. Two reads, both the
// Optimizer's own and shared with its Activity page and the Opportunities tile:
// optimizer_list_portfolios (who may act) and the action feed (optimizer-status view=actions,
// 7-day window, paged back only as far as the 24 h reach).

import { lazy, useEffect, useMemo, useState } from 'react';
import {
  useOptimizerActions,
  useOptimizerPortfolios,
} from '@/components/paid-media/optimizer/useOptimizerData';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import { TileReadError } from '../opps/tileParts';
import { OvernightRowItem } from './OvernightRowItem';
import {
  accountRefsOf,
  actionsInWindow,
  hasActingPortfolio,
  needsOlderPage,
  OVERNIGHT_MISSING,
  overnightRowsOf,
  overnightSummary,
  portfolioRunsOf,
} from './overnightModel';

const Module = lazy(() => import('./Module'));

const ROWS_AT_SIZE = { l: 3, m: 1, s: 0 } as const;

export default function AutopilotTile({ ctx, tile }: HomeTileProps) {
  const [now] = useState(() => new Date());
  const portfolios = useOptimizerPortfolios(ctx.brandId, null);
  const actions = useOptimizerActions(ctx.brandId, 7);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = actions;
  const actionsAnswered = actions.isSuccess || actions.isRefetchError;
  const paging = actionsAnswered && needsOlderPage(actions.data, now, Boolean(hasNextPage));

  useEffect(() => {
    if (paging && !isFetchingNextPage) void fetchNextPage();
  }, [paging, isFetchingNextPage, fetchNextPage]);

  const inWindow = useMemo(() => actionsInWindow(actions.data, now), [actions.data, now]);
  const accounts = useMemo(() => accountRefsOf(ctx.adAccounts), [ctx.adAccounts]);
  const rows = useMemo(
    () => overnightRowsOf(inWindow, portfolios.brandPortfolios, accounts),
    [inWindow, portfolios.brandPortfolios, accounts],
  );

  const failed =
    (!portfolios.hasAnswer && portfolios.isError) || (!actionsAnswered && actions.isError);
  if (failed) {
    return (
      <HomeTileFrame state="error" tile={tile}>
        <TileReadError
          onRetry={() => {
            void portfolios.refetch();
            void actions.refetch();
          }}
        >
          The Optimizer's action log could not be read, so this tile cannot say what ran.
        </TileReadError>
      </HomeTileFrame>
    );
  }

  if (portfolios.hasAnswer && !hasActingPortfolio(portfolios.brandPortfolios)) {
    return (
      <HomeTileFrame state="missing" tile={tile}>
        <TileMissing>{OVERNIGHT_MISSING}</TileMissing>
      </HomeTileFrame>
    );
  }

  if (!portfolios.hasAnswer || !actionsAnswered || paging) {
    return (
      <HomeTileFrame state="loading" tile={tile}>
        <Skeleton className="h-16 w-full" />
      </HomeTileFrame>
    );
  }

  const count = inWindow.length;
  const summary = overnightSummary(inWindow);
  const shown = rows.slice(0, ROWS_AT_SIZE[tile.size]);

  return (
    <HomeTileFrame
      badge={`${count} in 24 h`}
      expanded={<Module rows={rows} runs={portfolioRunsOf(portfolios.brandPortfolios, accounts)} />}
      expandedDescription="What the Optimizer recorded for this brand in the last 24 hours, and how each portfolio is set to run."
      state="ready"
      tile={tile}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <p className="flex items-baseline gap-2">
          <span
            className="font-semibold text-3xl tabular-nums tracking-tight"
            data-testid="home-tile-autopilot-headline"
            data-value={count}
          >
            {count}
          </span>
          <span className="text-muted-foreground text-xs">
            {count === 1 ? 'action in the last 24 h' : 'actions in the last 24 h'}
          </span>
        </p>
        <p className="truncate text-muted-foreground text-xs">
          {count === 0 ? 'Nothing ran in the last 24 h.' : summary}
        </p>
        {shown.length > 0 ? (
          <ul className="flex min-w-0 flex-col gap-2">
            {shown.map((row) => (
              <OvernightRowItem compact key={row.id} row={row} />
            ))}
          </ul>
        ) : null}
      </div>
    </HomeTileFrame>
  );
}
