'use client';

// H07 Overnight: how many actions ran for the brand in the last 24 h, and what happened to each.
// optimizer_list_portfolios says who may act. The Backend's Overnight read says what each action's
// outcome really was, and what the per-cycle cap held back. Where that read is not here (the route
// is not deployed yet) the tile falls back on the Optimizer's action feed (optimizer-status
// view=actions, 7-day window, paged back only as far as the 24 h reach) and says outcomes are
// pending. The feed is only read when it is needed.

import { type HomeOvernightLogData, homeOvernightLogReadSchema } from '@continuum/contracts';
import { lazy, useEffect, useMemo, useState } from 'react';
import {
  useOptimizerActions,
  useOptimizerPortfolios,
} from '@/components/paid-media/optimizer/useOptimizerData';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import { useHomeRead } from '../../useHomeRead';
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
import { overnightCountsLine, overnightRowsOfRead } from './overnightRead';

const Module = lazy(() => import('./Module'));

const ROWS_AT_SIZE = { l: 3, m: 1, s: 0 } as const;

export default function AutopilotTile({ ctx, tile }: HomeTileProps) {
  const [now] = useState(() => new Date());
  const portfolios = useOptimizerPortfolios(ctx.brandId, null);
  const logLoad = useHomeRead<HomeOvernightLogData>({
    name: 'overnightLog',
    brandId: ctx.brandId,
    schema: homeOvernightLogReadSchema,
  });
  // `no_data` is an answer: the ledgers hold nothing for the window. Only a read that is not here
  // leaves the tile to the feed.
  const quietNight = logLoad.status === 'missing' && logLoad.missing.reason === 'no_data';
  const log = logLoad.status === 'ready' ? logLoad.data : null;
  const fallsBack = logLoad.status !== 'loading' && !log && !quietNight;
  const actions = useOptimizerActions(fallsBack ? ctx.brandId : '', 7);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = actions;
  const actionsAnswered = actions.isSuccess || actions.isRefetchError;
  const paging =
    fallsBack && actionsAnswered && needsOlderPage(actions.data, now, Boolean(hasNextPage));

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
    (!portfolios.hasAnswer && portfolios.isError) ||
    (fallsBack && !actionsAnswered && actions.isError);
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

  if (
    !portfolios.hasAnswer ||
    logLoad.status === 'loading' ||
    (fallsBack && (!actionsAnswered || paging))
  ) {
    return (
      <HomeTileFrame state="loading" tile={tile}>
        <Skeleton className="h-16 w-full" />
      </HomeTileFrame>
    );
  }

  const runs = portfolioRunsOf(portfolios.brandPortfolios, accounts);
  const count = log ? log.total : quietNight ? 0 : inWindow.length;
  const summary = log ? overnightCountsLine(log.counts) : overnightSummary(inWindow);
  const logRows = log ? overnightRowsOfRead(log.entries) : [];
  const allRows = fallsBack ? rows : logRows;
  const shown = allRows.slice(0, ROWS_AT_SIZE[tile.size]);
  const skippedByCap = log?.capSkipped.count ?? 0;
  const said = count === 0 && skippedByCap === 0 ? 'Nothing ran in the last 24 h.' : summary;

  return (
    <HomeTileFrame
      badge={`${count} in 24 h`}
      expanded={
        <Module
          capSkipped={log?.capSkipped.items ?? []}
          outcomesPending={fallsBack}
          rows={allRows}
          runs={runs}
          truncated={log?.truncated ?? false}
        />
      }
      expandedDescription="What the Optimizer recorded for this brand in the last 24 hours, and how each portfolio is set to run."
      state="ready"
      tile={tile}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <p className="flex items-baseline gap-2">
          <span
            className="font-semibold text-3xl tabular-nums tracking-tight"
            data-skipped-by-cap={log ? skippedByCap : undefined}
            data-source={fallsBack ? 'feed' : 'overnight-log'}
            data-testid="home-tile-autopilot-headline"
            data-value={count}
          >
            {count}
          </span>
          <span className="text-muted-foreground text-xs">
            {count === 1 ? 'action in the last 24 h' : 'actions in the last 24 h'}
          </span>
        </p>
        <p
          className="truncate text-muted-foreground text-xs"
          data-testid="home-tile-autopilot-summary"
        >
          {said}
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
