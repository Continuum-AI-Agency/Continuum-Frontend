'use client';

// Every listed portfolio's headline figure (see ./portfolioFigure), from the reads the
// portfolio detail makes — the account snapshot read and each portfolio's enrolled roster (and
// a Google, TikTok or mixed portfolio's metrics read), under the detail's own query keys — so a list row and the detail hero are fed the same
// data and priced by the same function. Opening a portfolio from the list is a cache hit.

import type {
  EfficiencySeriesPoint,
  PortfolioLevel,
  PortfolioListItem,
} from '@continuum/contracts';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { accountSnapshotsQuery, enrolledAdsetsQuery } from '../useOptimizerData';
import { usePortfolioMemberStates } from './platforms/portfolioPlatforms';
import {
  holdsOtherPlatforms,
  type PortfolioFigure,
  portfolioFigureFromReads,
} from './portfolioFigure';

export type PortfolioFigures = {
  figures: Map<string, PortfolioFigure>;
  /** A live read is still in flight: a figure painted now could flip from the snapshot to
   *  the live one under the reader's eyes. */
  pending: boolean;
};

const levelOf = (portfolio: PortfolioListItem): PortfolioLevel =>
  (portfolio.level as PortfolioLevel | null | undefined) ?? 'adset';

export function usePortfolioFigures(args: {
  brandId: string;
  adAccountId: string | null;
  portfolios: readonly PortfolioListItem[];
  /** Each portfolio's efficiency series, in the order of `portfolios` (the snapshot). */
  series: readonly (readonly EfficiencySeriesPoint[])[];
}): PortfolioFigures {
  const { brandId, adAccountId, portfolios, series } = args;
  const levels = useMemo(() => [...new Set(portfolios.map(levelOf))], [portfolios]);
  const snapshotReads = useQueries({
    queries: levels.map((level) => ({
      ...accountSnapshotsQuery(brandId, adAccountId ?? '', level),
      enabled: Boolean(brandId && adAccountId),
    })),
  });
  const rosterReads = useQueries({
    queries: portfolios.map((portfolio) => enrolledAdsetsQuery(portfolio.id)),
  });
  // A Google, TikTok or mixed portfolio is priced from its metrics read; same query key as the
  // rows' platform chips, so it is the same request.
  const otherPlatformIds = useMemo(
    () => portfolios.filter((portfolio) => holdsOtherPlatforms(portfolio)).map(({ id }) => id),
    [portfolios],
  );
  const metricsById = usePortfolioMemberStates(otherPlatformIds);

  const pending =
    (Boolean(brandId && adAccountId) &&
      (snapshotReads.some((read) => read.isPending) ||
        rosterReads.some((read) => read.isPending))) ||
    otherPlatformIds.some((id) => metricsById.get(id)?.status === 'loading');

  const figures = new Map<string, PortfolioFigure>();
  portfolios.forEach((portfolio, index) => {
    const read = snapshotReads[levels.indexOf(levelOf(portfolio))]?.data;
    const roster = rosterReads[index]?.data;
    const metrics = metricsById.get(portfolio.id);
    const figure = portfolioFigureFromReads({
      portfolio,
      snapshots: read?.snapshots ?? null,
      inactiveWindows: read?.inactiveWindows,
      readAt: read?.fetchedAt ?? null,
      memberIds: roster?.map((member) => member.adset_id) ?? null,
      series: series[index] ?? [],
      metrics: metrics?.status === 'ready' ? metrics.metrics : null,
    });
    if (figure) figures.set(portfolio.id, figure);
  });
  return { figures, pending };
}
