'use client';

import {
  type CreativeStrategyReport,
  creativeStrategyReportSchema,
  creativeStrategyStatusSchema,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';

export type CreativeStrategyStatus = ReturnType<typeof creativeStrategyStatusSchema.parse>;

export interface CreativeStrategyReadState {
  status: CreativeStrategyStatus;
  report: CreativeStrategyReport | null;
  refreshedAt: string | null;
}

// Reads the materialized brand_profiles.creative_strategy_reports row directly under
// RLS (member SELECT) — same client-side pattern as useBrandAssignedAccountIds. The
// jsonb `report` is validated against the shared contract at the boundary. The table
// is not yet in the generated Supabase types, so the query is name-cast (as never)
// like other not-yet-regenerated reads until types are regenerated.
async function fetchCreativeStrategyReport(brandId: string): Promise<CreativeStrategyReadState> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('creative_strategy_reports' as never)
    .select('status, report, refreshed_at')
    .eq('brand_id' as never, brandId)
    .maybeSingle();

  if (error) throw error;
  const row = (data ?? null) as {
    status?: string | null;
    report?: unknown;
    refreshed_at?: string | null;
  } | null;
  if (!row) {
    return { status: 'assembling', report: null, refreshedAt: null };
  }

  const status = creativeStrategyStatusSchema.safeParse(row.status);
  const parsed = creativeStrategyReportSchema.safeParse(row.report);
  return {
    status: status.success ? status.data : 'assembling',
    report: parsed.success ? parsed.data : null,
    refreshedAt: row.refreshed_at ?? null,
  };
}

export function useCreativeStrategyReport(brandId?: string) {
  const query = useQuery({
    queryKey: ['creative-strategy-report', brandId],
    queryFn: () =>
      brandId
        ? fetchCreativeStrategyReport(brandId)
        : Promise.resolve<CreativeStrategyReadState>({
            status: 'assembling',
            report: null,
            refreshedAt: null,
          }),
    enabled: Boolean(brandId),
    staleTime: 5 * 60 * 1000,
  });

  return {
    status: query.data?.status ?? 'assembling',
    report: query.data?.report ?? null,
    refreshedAt: query.data?.refreshedAt ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
