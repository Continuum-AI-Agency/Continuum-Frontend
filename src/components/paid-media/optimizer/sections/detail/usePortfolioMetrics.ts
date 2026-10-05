'use client';

// The portfolio's one normalized slice across platforms: public.optimizer_get_portfolio_metrics,
// parsed with PortfolioMetricsSchema. Three honest outcomes, because the screen renders each
// differently: the slice, "not available yet" (the RPC is not deployed — a known state, not a
// failure), and an error. A missing RPC is never retried: it will not appear by asking again.

import { type PortfolioMetrics, PortfolioMetricsSchema } from '@continuum/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isMissingRpcError, MissingRpcError } from '../platforms/multiplatformRead';

export const PORTFOLIO_METRICS_RPC = 'optimizer_get_portfolio_metrics';

export type PortfolioMetricsWindow = 'd7' | 'd14' | 'd30';

export const portfolioMetricsQueryKey = (portfolioId: string, window: PortfolioMetricsWindow) =>
  ['optimizer', 'portfolio-metrics', portfolioId, window] as const;

type LooseRpc = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export async function fetchPortfolioMetrics(
  portfolioId: string,
  window: PortfolioMetricsWindow,
  client: LooseRpc = createSupabaseBrowserClient() as unknown as LooseRpc,
): Promise<PortfolioMetrics> {
  const { data, error } = await client.rpc(PORTFOLIO_METRICS_RPC, {
    p_portfolio_id: portfolioId,
    p_window: window,
  });
  if (error) {
    if (isMissingRpcError(error)) throw new MissingRpcError(PORTFOLIO_METRICS_RPC);
    throw new Error('The portfolio metrics read failed.');
  }
  const parsed = PortfolioMetricsSchema.safeParse(data);
  if (!parsed.success) throw new Error('The portfolio metrics read returned an unexpected shape.');
  return parsed.data;
}

export type PortfolioMetricsState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; metrics: PortfolioMetrics };

export function usePortfolioMetrics(
  portfolioId: string | null,
  window: PortfolioMetricsWindow = 'd7',
): PortfolioMetricsState {
  const query = useQuery({
    queryKey: portfolioMetricsQueryKey(portfolioId ?? '', window),
    queryFn: () => fetchPortfolioMetrics(portfolioId as string, window),
    enabled: Boolean(portfolioId),
    staleTime: 5 * 60 * 1000,
    retry: (count, error) => !(error instanceof MissingRpcError) && count < 2,
  });
  if (query.data) return { status: 'ready', metrics: query.data };
  if (query.error instanceof MissingRpcError) return { status: 'unavailable' };
  if (query.isError) return { status: 'error' };
  return { status: 'loading' };
}

/** Drop every cached window of one portfolio's slice, after its attribution source changed. */
export function useInvalidatePortfolioMetrics(portfolioId: string): () => void {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({ queryKey: ['optimizer', 'portfolio-metrics', portfolioId] });
}
