'use client';
import {
  useTranslations as useBetaTranslations,
  useTranslations as useExtraTranslations,
} from 'next-intl';

// The client checklist (recommend mode, where the client applies the changes): how many of the
// Optimizer's recommendations are open for the client, and in which portfolios. One read —
// optimizer_list_portfolios, shared with the Opportunities and Overnight tiles. The items, the
// export and the report email open in the expanded module, which reads each portfolio's queue
// only then. Read-only: nothing here writes, and the mode's "Add to checklist" has no write behind
// it, so it is not offered.

import Link from 'next/link';
import { lazy, useMemo } from 'react';
import { useOptimizerPortfolios } from '@/components/paid-media/optimizer/useOptimizerData';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { HomeTileFrame, TileMissing } from '../../HomeTileFrame';
import type { HomeTileProps } from '../../types';
import { OPTIMIZER_LINKS, portfolioDecisionsHref } from '../opps/oppsModel';
import { ROW_LINK, ROW_LINK_LIST, TileReadError } from '../opps/tileParts';
import { CHECKLIST_MISSING, checklistViewOf } from './checklistModel';

const Module = lazy(() => import('./Module'));

const ROWS_AT_SIZE = { l: 4, m: 2, s: 0 } as const;

export default function ChecklistTile({ ctx, tile }: HomeTileProps) {
  const extraUiText = useExtraTranslations('dashboard');

  const betaUiText = useBetaTranslations('dashboard');

  const portfolios = useOptimizerPortfolios(ctx.brandId, null);
  const { hasAnswer, isError, refetch, brandPortfolios } = portfolios;
  const view = useMemo(
    () => (hasAnswer ? checklistViewOf(brandPortfolios) : null),
    [hasAnswer, brandPortfolios],
  );

  if (view == null) {
    return isError ? (
      <HomeTileFrame state="error" tile={tile}>
        <TileReadError onRetry={() => void refetch()}>
          {betaUiText('beta_13404a7bb6a7')}
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
        <TileMissing>{CHECKLIST_MISSING}</TileMissing>
        <Link className={cn(ROW_LINK, 'mt-2 inline-block text-xs')} href={OPTIMIZER_LINKS.create}>
          {betaUiText('beta_2283fad67e39')}
        </Link>
      </HomeTileFrame>
    );
  }

  const rows = view.portfolios.slice(0, ROWS_AT_SIZE[tile.size]);
  const [first] = view.portfolios;

  return (
    <HomeTileFrame
      badge={betaUiText('beta_f0eb8687c3fa', { value0: String(view.open) })}
      expanded={
        <Module
          adAccounts={ctx.adAccounts}
          brandId={ctx.brandId}
          brandName={ctx.brandName}
          portfolios={view.portfolios}
        />
      }
      expandedDescription={extraUiText('home_70725a414adb')}
      state="ready"
      tile={tile}
    >
      <div className="flex min-w-0 flex-col gap-3">
        <p className="flex items-baseline gap-2">
          <span
            className="font-semibold text-3xl tabular-nums tracking-tight"
            data-testid="home-tile-checklist-headline"
            data-value={view.open}
          >
            {view.open}
          </span>
          <span className="text-muted-foreground text-xs">{betaUiText('beta_2aa6f2aef4e0')}</span>
        </p>
        {view.open === 0 ? (
          <p className="text-muted-foreground text-xs">{betaUiText('beta_1924fc9ca576')}</p>
        ) : rows.length > 0 ? (
          <ul className={ROW_LINK_LIST} data-testid="home-tile-checklist-portfolios">
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
                  {portfolio.open} {betaUiText('beta_2348f9987442')}
                </span>
              </li>
            ))}
          </ul>
        ) : first ? (
          <p className="truncate text-muted-foreground text-xs">
            {first.name}: {first.open} {betaUiText('beta_2348f9987442')}
          </p>
        ) : null}
      </div>
    </HomeTileFrame>
  );
}
