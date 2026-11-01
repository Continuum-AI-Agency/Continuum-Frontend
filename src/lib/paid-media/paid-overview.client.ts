'use client';

import {
  type GoogleResultBucket,
  type PaidAccountOverview,
  paidAccountOverviewSchema,
} from '@continuum/contracts';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import type { PaidMetricsRange } from '@/lib/schemas/paidMetrics';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Account-level totals + period-over-period comparison + daily series from the
// paid-media reporting edge function. The missing wrapper for the account_overview
// scope (the leaderboards only had the ranking scopes wrapped). Both producers (Meta,
// Google) answer the one envelope in @continuum/contracts. Google counts one business
// result per read: `resultBucket` names it (leads | purchases | signups).
export async function fetchPaidAccountOverview(params: {
  brandId: string;
  adAccountId: string;
  platform: PaidMediaPlatform;
  range: PaidMetricsRange;
  resultBucket?: GoogleResultBucket;
}): Promise<PaidAccountOverview> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke('paid-media-reporting/metrics', {
    method: 'POST',
    body: {
      platform: params.platform,
      brandId: params.brandId,
      adAccountId: params.adAccountId,
      scope: 'account_overview',
      range: params.range,
      ...(params.resultBucket ? { resultBucket: params.resultBucket } : {}),
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  return paidAccountOverviewSchema.parse(data);
}
