'use client';

import { type PaidCreativeReport, paidCreativeReportSchema } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';

export type PaidCreativeReportStatus = 'assembling' | 'ready' | 'error' | 'empty';

export interface PaidCreativeReadState {
  status: PaidCreativeReportStatus;
  report: PaidCreativeReport | null;
  refreshedAt: string | null;
}

const STATUSES: PaidCreativeReportStatus[] = ['assembling', 'ready', 'error', 'empty'];

// Reads the materialized paid_media.creative_reports row directly under RLS
// (member SELECT policy) — the same client-side pattern as
// useCreativeStrategyReport. The jsonb `report` is validated against the shared
// contract at the boundary.
async function fetchPaidCreativeReport(brandId: string): Promise<PaidCreativeReadState> {
  const { createSupabaseBrowserClient } = await import('@/lib/supabase/client');
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .schema('paid_media')
    .from('creative_reports' as never)
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

  const parsed = paidCreativeReportSchema.safeParse(row.report);
  return {
    status: STATUSES.includes(row.status as PaidCreativeReportStatus)
      ? (row.status as PaidCreativeReportStatus)
      : 'assembling',
    report: parsed.success ? parsed.data : null,
    refreshedAt: row.refreshed_at ?? null,
  };
}

export function usePaidCreativeReport(brandId?: string) {
  const query = useQuery({
    queryKey: ['paid-creative-report', brandId],
    queryFn: () =>
      brandId
        ? fetchPaidCreativeReport(brandId)
        : Promise.resolve<PaidCreativeReadState>({
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
