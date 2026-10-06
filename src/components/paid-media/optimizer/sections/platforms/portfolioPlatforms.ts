'use client';

// Which platforms each portfolio holds members on (frontend.html §7, feature 07). The portfolio
// list item carries no platforms, so the row reads them where the portfolio detail's "By
// platform" does: optimizer_get_portfolio_metrics, one by_platform row per platform with
// entities. Same query key and fetcher as usePortfolioMetrics, so opening the portfolio paints
// its "By platform" from the cache this warmed.
//
// Until that RPC is deployed, or when it fails, the row keeps the platform every portfolio the
// engine runs is on today; while it loads, the row names no platform rather than a guess.

import { useQueries } from '@tanstack/react-query';
import {
  fetchPortfolioMetrics,
  type PortfolioMetricsState,
  portfolioMetricsQueryKey,
} from '../detail/usePortfolioMetrics';
import { MissingRpcError } from './multiplatformRead';
import { type AdPlatform, orderPlatforms, readAdPlatform } from './platformTabsModel';

export function memberPlatforms(
  state: PortfolioMetricsState | undefined,
  fallback: AdPlatform,
): AdPlatform[] {
  if (!state || state.status === 'loading') return [];
  if (state.status !== 'ready') return [fallback];
  const held = orderPlatforms(
    state.metrics.by_platform.flatMap((row) => {
      const platform = readAdPlatform(row.platform);
      return platform ? [platform] : [];
    }),
  );
  return held.length > 0 ? held : [fallback];
}

/** Each portfolio's metrics read, keyed by id, for its member platforms. */
export function usePortfolioMemberStates(
  portfolioIds: readonly string[],
): Map<string, PortfolioMetricsState> {
  const results = useQueries({
    queries: portfolioIds.map((id) => ({
      queryKey: portfolioMetricsQueryKey(id, 'd7'),
      queryFn: () => fetchPortfolioMetrics(id, 'd7'),
      staleTime: 5 * 60 * 1000,
      retry: (count: number, error: unknown) => !(error instanceof MissingRpcError) && count < 2,
    })),
  });
  return new Map(
    portfolioIds.map((id, index): [string, PortfolioMetricsState] => {
      const query = results[index];
      if (query?.data) return [id, { status: 'ready', metrics: query.data }];
      if (query?.error instanceof MissingRpcError) return [id, { status: 'unavailable' }];
      if (query?.isError) return [id, { status: 'error' }];
      return [id, { status: 'loading' }];
    }),
  );
}
