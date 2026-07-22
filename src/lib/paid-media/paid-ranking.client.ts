'use client';

import {
  type PaidEntityKpi,
  type PaidRankedEntity,
  type PaidRankingDirection,
  type PaidRankingScope,
  paidRankedEntitySchema,
} from '@continuum/contracts';
import type { PaidMediaPlatform } from '@/lib/paid-media/performance-types';
import type { PaidMetricsRange } from '@/lib/schemas/paidMetrics';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// Calls the server-ranked paid-media reporting edge function for a given scope
// (top_campaigns / top_adsets / top_ads) and KPI. Ranking + KPI math run edge-
// side; this validates each row against the shared contract and drops malformed
// rows so one bad entity never blanks the whole leaderboard.
export async function fetchPaidRanking(params: {
  brandId: string;
  adAccountId: string;
  platform: PaidMediaPlatform;
  scope: PaidRankingScope;
  kpi: PaidEntityKpi;
  direction?: PaidRankingDirection;
  limit?: number;
  range: PaidMetricsRange;
}): Promise<PaidRankedEntity[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke('paid-media-reporting/metrics', {
    method: 'POST',
    body: {
      platform: params.platform,
      brandId: params.brandId,
      adAccountId: params.adAccountId,
      scope: params.scope,
      kpi: params.kpi,
      direction: params.direction ?? 'top',
      limit: params.limit ?? 5,
      range: params.range,
    },
  });

  if (error) {
    throw new Error(error.message);
  }

  const payload = (data ?? null) as { rows?: unknown } | null;
  const rawRows = Array.isArray(payload?.rows) ? payload.rows : [];
  const rows: PaidRankedEntity[] = [];
  for (const rawRow of rawRows) {
    const parsed = paidRankedEntitySchema.safeParse(rawRow);
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}
