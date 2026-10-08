'use client';

// The TikTok tab's own read: paid-media-metrics, platform tiktok-ads, scope tiktok_snapshots —
// the entity read the Optimizer's ingest makes, read here as the signed-in member of the brand.
// Which advertiser to read comes from the multi-platform producer's tiktok_ads row (the brand's
// ad-account list has no TikTok row), so this hook is told the advertiser rather than finding it.

import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { readEdgeErrorMessage } from '@/lib/supabase/edgeErrorMessage';
import {
  buildTikTokOverview,
  type TikTokOverview,
  TikTokSnapshotsEnvelopeSchema,
} from './tiktokAdsOverviewModel';

const FIVE_MINUTES = 5 * 60 * 1000;

export type TikTokAdsOverviewState =
  | { status: 'not-connected' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; overview: TikTokOverview };

export const tiktokAdsOverviewKey = (brandId: string, advertiserId: string) =>
  ['optimizer', 'tiktok-ads-overview', brandId, advertiserId] as const;

export async function fetchTikTokAdsOverview(
  brandId: string,
  advertiserId: string,
): Promise<TikTokOverview> {
  const { data, error } = await createSupabaseBrowserClient().functions.invoke(
    'paid-media-metrics',
    {
      body: {
        platform: 'tiktok-ads',
        scope: 'tiktok_snapshots',
        brandId,
        accountId: advertiserId,
      },
    },
  );
  if (error) {
    throw new Error(await readEdgeErrorMessage(error, 'The TikTok Ads read did not answer.'));
  }
  const parsed = TikTokSnapshotsEnvelopeSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('The TikTok Ads read came back in a shape this page does not know.');
  }
  return buildTikTokOverview(parsed.data);
}

export function tiktokOverviewStateOf(
  advertiserId: string | null,
  query: { data: TikTokOverview | undefined; error: unknown; isError: boolean },
): TikTokAdsOverviewState {
  if (!advertiserId) return { status: 'not-connected' };
  if (query.isError) {
    return {
      status: 'error',
      message: query.error instanceof Error ? query.error.message : 'Unknown error',
    };
  }
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', overview: query.data };
}

export function useTikTokAdsOverview(
  brandId: string,
  advertiserId: string | null,
): TikTokAdsOverviewState {
  const query = useQuery({
    queryKey: tiktokAdsOverviewKey(brandId, advertiserId ?? 'none'),
    queryFn: () => fetchTikTokAdsOverview(brandId, advertiserId as string),
    enabled: Boolean(brandId && advertiserId),
    staleTime: FIVE_MINUTES,
    retry: 1,
  });
  return tiktokOverviewStateOf(advertiserId, query);
}
