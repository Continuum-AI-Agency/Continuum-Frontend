'use client';

// The Overview's one multi-platform read: public.optimizer_get_account_platform_metrics, parsed
// with the contract both sides share. Four states, each a different fact: still reading; the
// RPC is not deployed yet (a known state until the migration ships, never retried); the read
// failed or came back in a shape the contract refuses; and ready.

import { type AccountPlatformMetrics, AccountPlatformMetricsSchema } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { isMissingRpcError, MissingRpcError } from './multiplatformRead';

const FIVE_MINUTES = 5 * 60 * 1000;
const RPC = 'optimizer_get_account_platform_metrics';

export type MetricsWindowLabel = 'd3' | 'd7' | 'd14';

export type AccountPlatformMetricsState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ready'; metrics: AccountPlatformMetrics };

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: unknown }>;
};

export const accountPlatformMetricsKey = (brandId: string, window: MetricsWindowLabel) =>
  ['optimizer', 'account-platform-metrics', brandId, window] as const;

export async function fetchAccountPlatformMetrics(
  brandId: string,
  window: MetricsWindowLabel,
  client: RpcClient = createSupabaseBrowserClient() as unknown as RpcClient,
): Promise<AccountPlatformMetrics> {
  const { data, error } = await client.rpc(RPC, { p_brand_id: brandId, p_window: window });
  if (error) {
    if (isMissingRpcError(error)) throw new MissingRpcError(RPC);
    throw new Error('Could not read the multi-platform numbers.');
  }
  const parsed = AccountPlatformMetricsSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('The multi-platform numbers came back in a shape this page does not know.');
  }
  return parsed.data;
}

export function metricsStateOf(query: {
  data: AccountPlatformMetrics | undefined;
  error: unknown;
  isError: boolean;
}): AccountPlatformMetricsState {
  if (query.isError) {
    if (query.error instanceof MissingRpcError) return { status: 'unavailable' };
    return {
      status: 'error',
      message: query.error instanceof Error ? query.error.message : 'Unknown error',
    };
  }
  if (!query.data) return { status: 'loading' };
  return { status: 'ready', metrics: query.data };
}

export function useAccountPlatformMetrics(
  brandId: string,
  window: MetricsWindowLabel = 'd7',
): AccountPlatformMetricsState {
  const query = useQuery({
    queryKey: accountPlatformMetricsKey(brandId, window),
    queryFn: () => fetchAccountPlatformMetrics(brandId, window),
    enabled: Boolean(brandId),
    staleTime: FIVE_MINUTES,
    retry: (failures, error) => !(error instanceof MissingRpcError) && failures < 1,
  });
  return metricsStateOf(query);
}
