'use client';

// The campaign page's day-by-day read: paid-media-metrics' `campaign` scope, which answers for
// one Google campaign the same shape the `account_overview` scope does (paid/account-overview):
// its window totals and the window day by day. Cached by the edge like every Google read; a
// payload that does not parse is an error the page names, never an empty line.

import { type PaidAccountOverview, paidAccountOverviewSchema } from '@continuum/contracts';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import {
  type GoogleReadTarget,
  type GoogleReadWindow,
  invokeGoogleMetrics,
  rangeOf,
} from '../../google/googleReads';

const FIVE_MINUTES = 5 * 60 * 1000;

export function parseGoogleCampaignDaily(raw: unknown): PaidAccountOverview {
  const parsed = paidAccountOverviewSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('The Google Ads campaign read came back in a shape this page does not know.');
  }
  return parsed.data;
}

export function useGoogleCampaignDaily(
  target: GoogleReadTarget | null,
  campaignId: string | null,
  window: GoogleReadWindow,
): UseQueryResult<PaidAccountOverview> {
  const bucket = target?.resultBucket ?? null;
  return useQuery({
    queryKey: [
      'optimizer',
      'google',
      target?.brandId ?? 'none',
      target?.customerId ?? 'none',
      'campaign_daily',
      campaignId ?? 'none',
      window.since,
      window.until,
      bucket ?? 'auto',
    ],
    queryFn: async () =>
      parseGoogleCampaignDaily(
        await invokeGoogleMetrics({
          brandId: target?.brandId,
          accountId: target?.customerId,
          ...(bucket ? { resultBucket: bucket } : {}),
          scope: 'campaign',
          campaignId,
          range: rangeOf(window),
        }),
      ),
    enabled: Boolean(target?.brandId && target.customerId && campaignId),
    staleTime: FIVE_MINUTES,
    retry: 1,
  });
}
