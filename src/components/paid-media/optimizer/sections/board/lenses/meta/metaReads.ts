'use client';

// The reads behind the four Meta views. Campaigns and ad sets come from the paid-media ranking
// edge (paid-media-reporting/metrics, the read the Home's leaderboards make through
// fetchPaidRanking) over the last 30 days, ranked by spend, at the edge's fifty-row limit. The
// four views share one query key per scope, so the board pays for each read once. The ads of a
// zoomed campaign are the same edge's top_ads scoped to that campaign; fetchPaidRanking takes
// no campaign, so that one call is spelled here. The portfolios' rosters reuse the detail's
// own query (enrolledAdsetsQuery), so they are cache hits after the Overview.
//
// Nothing is posted until the brand's account list says the account is a Meta one
// (useMetaReadAccount): a Google customer id is never read as Meta.

import {
  type PaidRankedEntity,
  type PortfolioAdset,
  type PortfolioListItem,
  paidRankedEntitySchema,
} from '@continuum/contracts';
import { type UseQueryResult, useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import {
  enrolledAdsetsQuery,
  useMetaReadAccount,
} from '@/components/paid-media/optimizer/useOptimizerData';
import { fetchPaidRanking, reportingMetricsRoute } from '@/lib/paid-media/paid-ranking.client';
import { retryUnlessTimeout } from '@/lib/react-query/retry';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { type MetaRankRow, rankRowOf } from './metaLensModel';

/** The window every Meta view reads. */
const META_LENS_RANGE = { preset: 'last_30d' } as const;
/** The ranking edge returns at most this many rows. */
const RANKING_LIMIT = 50;
const TEN_MINUTES = 10 * 60 * 1000;

type MetaRankingScope = 'top_campaigns' | 'top_adsets' | 'top_ads';

const metaLensQueryKeys = {
  ranking: (
    brandId: string,
    accountId: string,
    scope: MetaRankingScope,
    campaignId: string | null,
  ) =>
    [
      'optimizer',
      'board',
      'meta-ranking',
      brandId,
      accountId,
      scope,
      campaignId ?? 'account',
      META_LENS_RANGE.preset,
    ] as const,
};

export type MetaReadState<T> =
  /** No Meta account to read: none selected, or the selected one is on another platform. */
  | { status: 'no-account' }
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'ready'; data: T };

/** The ads of one campaign, ranked by spend. */
async function fetchCampaignAds(
  brandId: string,
  adAccountId: string,
  campaignId: string,
): Promise<PaidRankedEntity[]> {
  const { data, error } = await createSupabaseBrowserClient().functions.invoke(
    reportingMetricsRoute('meta'),
    {
      method: 'POST',
      body: {
        platform: 'meta',
        brandId,
        adAccountId,
        scope: 'top_ads',
        kpi: 'spend',
        direction: 'top',
        limit: RANKING_LIMIT,
        range: META_LENS_RANGE,
        campaignId,
      },
    },
  );
  if (error) throw new Error(error.message);
  const rows = (data as { rows?: unknown } | null)?.rows;
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const parsed = paidRankedEntitySchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

function stateOf(
  hasAccount: boolean,
  query: {
    data: PaidRankedEntity[] | undefined;
    isError: boolean;
    refetch: () => unknown;
  },
): MetaReadState<MetaRankRow[]> {
  if (!hasAccount) return { status: 'no-account' };
  if (query.data) return { status: 'ready', data: query.data.map(rankRowOf) };
  if (query.isError) return { status: 'error', retry: () => void query.refetch() };
  return { status: 'loading' };
}

/** The account's campaigns or ad sets over the last 30 days, by spend. */
export function useMetaRanking(
  brandId: string,
  adAccountId: string | null,
  scope: 'top_campaigns' | 'top_adsets',
): MetaReadState<MetaRankRow[]> {
  const target = useMetaReadAccount(brandId, adAccountId);
  const accountId = target.accountId;
  const query = useQuery({
    queryKey: metaLensQueryKeys.ranking(brandId, accountId ?? 'none', scope, null),
    queryFn: () =>
      fetchPaidRanking({
        brandId,
        adAccountId: accountId as string,
        platform: 'meta',
        scope,
        kpi: 'spend',
        direction: 'top',
        limit: RANKING_LIMIT,
        range: META_LENS_RANGE,
      }),
    enabled: Boolean(brandId && accountId),
    staleTime: TEN_MINUTES,
    retry: retryUnlessTimeout(1),
  });
  // A Meta account is in hand once the account list says so; until it answers, it may be.
  const hasAccount = Boolean(adAccountId) && (!target.settled || accountId != null);
  const { data, isError, refetch } = query;
  return useMemo(
    () => stateOf(hasAccount, { data, isError, refetch }),
    [hasAccount, data, isError, refetch],
  );
}

/** The ads of a zoomed campaign; idle (`no-account`) while nothing is zoomed. */
export function useCampaignAds(
  brandId: string,
  adAccountId: string | null,
  campaignId: string | null,
): MetaReadState<MetaRankRow[]> {
  const target = useMetaReadAccount(brandId, adAccountId);
  const accountId = target.accountId;
  const query = useQuery({
    queryKey: metaLensQueryKeys.ranking(brandId, accountId ?? 'none', 'top_ads', campaignId),
    queryFn: () => fetchCampaignAds(brandId, accountId as string, campaignId as string),
    enabled: Boolean(brandId && accountId && campaignId),
    staleTime: TEN_MINUTES,
    retry: retryUnlessTimeout(1),
  });
  const active = Boolean(campaignId && accountId);
  const { data, isError, refetch } = query;
  return useMemo(
    () => stateOf(active, { data, isError, refetch }),
    [active, data, isError, refetch],
  );
}

export type RostersState = {
  /** Each portfolio's enrolled ad sets; null while any roster is still on its way. */
  rosters: Map<string, PortfolioAdset[]> | null;
  /** Portfolios whose roster could not be read: left off the overlay, never shown empty. */
  failed: string[];
};

/** Every listed portfolio's enrolled roster, on the detail's own query key. */
export function usePortfolioRosters(portfolios: readonly PortfolioListItem[]): RostersState {
  const combine = useCallback(
    (reads: UseQueryResult<PortfolioAdset[]>[]): RostersState => {
      const failed = portfolios.filter((_, index) => reads[index]?.isError).map(({ id }) => id);
      if (reads.some((read) => read.isPending)) return { rosters: null, failed };
      const rosters = new Map<string, PortfolioAdset[]>();
      portfolios.forEach((portfolio, index) => {
        const roster = reads[index]?.data;
        if (roster) rosters.set(portfolio.id, roster);
      });
      return { rosters, failed };
    },
    [portfolios],
  );
  return useQueries({
    queries: portfolios.map((portfolio) => enrolledAdsetsQuery(portfolio.id)),
    combine,
  });
}
