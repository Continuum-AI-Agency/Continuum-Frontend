'use client';

// H07 Overnight: how many actions ran for the brand in the last 24 h, and what happened to each.
// optimizer_list_portfolios says who may act. The Backend's Overnight read says what each action's
// outcome really was, and what the per-cycle cap held back. Where that read is not here (the route
// is not deployed yet) the tile falls back on the Optimizer's action feed (optimizer-status
// view=actions, 7-day window, paged back only as far as the 24 h reach) and says outcomes are
// pending. The feed is only read when it is needed.

import { type HomeOvernightLogData, homeOvernightLogReadSchema } from '@continuum/contracts';
import { useTranslations } from 'next-intl';
import { lazy, useEffect, useMemo, useState } from 'react';
import {
  useOptimizerActions,
  useOptimizerPortfolios,
} from '@/components/paid-media/optimizer/useOptimizerData';
import { Skeleton } from '@/components/ui/skeleton';
import { HomeDots } from '../../HomeDots';
import { useHomeDraft } from '../../HomePresentationContext';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import { checkedPortfolioDotItems, overnightDotItems } from '../../homeDotItems';
import type { HomeTileProps } from '../../types';
import { useHomeRead } from '../../useHomeRead';
import { TileReadError } from '../opps/tileParts';
import { OvernightRowItem } from './OvernightRowItem';
import {
  accountRefsOf,
  actionsInWindow,
  hasActingPortfolio,
  needsOlderPage,
  overnightRowsOf,
  overnightSummary,
  portfolioRunsOf,
} from './overnightModel';
import { overnightCountsLine, overnightRowsOfRead } from './overnightRead';

const Module = lazy(() => import('./Module'));

const ROWS_AT_SIZE = { l: 3, m: 1, s: 0 } as const;

export default function AutopilotTile({ ctx, tile }: HomeTileProps) {
  const uiText = useTranslations('dashboard');
  const draft = useHomeDraft();
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
          {uiText('the_optimizer_s_action_log_could_not_be_read__0e12f66')}
        </TileReadError>
      </HomeTileFrame>
    );
  }

  if (portfolios.hasAnswer && !hasActingPortfolio(portfolios.brandPortfolios)) {
    return (
      <HomeTileFrame state="missing" tile={tile}>
        <TileMissing>{uiText('no_portfolio_lets_continuum_act_here_yet_ever_3dddfb5')}</TileMissing>
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
  const said =
    count === 0 && skippedByCap === 0 ? uiText('nothing_ran_in_the_last_24_h_3c1b662') : summary;

  return (
    <HomeTileFrame
      badge={uiText('count_in_24_h_7bfd428', { count })}
      expanded={
        <Module
          capSkipped={log?.capSkipped.items ?? []}
          outcomesPending={fallsBack}
          rows={allRows}
          runs={runs}
          truncated={log?.truncated ?? false}
        />
      }
      expandedDescription={uiText('what_the_optimizer_recorded_for_this_brand_in_f98bf5d')}
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
            {uiText('count_plural_one_action_in_the_last_24_h_othe_bdc4e48', {
              count,
            })}
          </span>
        </p>
        <p
          className="truncate text-muted-foreground text-xs"
          data-testid="home-tile-autopilot-summary"
        >
          {said}
        </p>
        {draft && allRows.length > 0 ? (
          <HomeDots
            rows
            label={uiText('recorded_actions_in_the_last_24_hours_0461825')}
            items={overnightDotItems(allRows, uiText)}
          />
        ) : draft && runs.length > 0 ? (
          <HomeDots
            rows
            label={uiText('portfolios_watched_in_the_last_24_hours_a1c3e90')}
            items={checkedPortfolioDotItems(
              runs.map((run) => ({
                id: run.id,
                name: run.name,
                detail: run.paused ? `${run.mode} · ${uiText('m_c7dfb6f1d9')}` : run.mode,
              })),
              uiText('no_action_recorded_b72d4f1'),
              uiText('last_24_hours_5c37cf8'),
            )}
          />
        ) : shown.length > 0 ? (
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
