'use client';

// The brief's one read, once per ad account: optimizer_get_account_read, the RPC the Optimizer's
// account views already call (useOptimizerAccountRead). It runs under the same React Query key
// and stores the same parsed envelope, so a Home that opens the Optimizer next reuses it, and the
// other way round. Read-only: the RPC checks brand membership (optimizer._assert_brand) and
// returns the newest composed read for that account, or null when nothing was ever stored.

import { useQueries } from '@tanstack/react-query';
import {
  type AccountReadEnvelope,
  AccountReadEnvelopeSchema,
  optimizerQueryKeys,
} from '@/components/paid-media/optimizer/useOptimizerData';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { BriefRead } from './briefModel';

const FIVE_MINUTES = 5 * 60 * 1000;

export async function fetchBriefRead(
  brandId: string,
  adAccountId: string,
): Promise<AccountReadEnvelope> {
  const { data, error } = await createSupabaseBrowserClient().rpc('optimizer_get_account_read', {
    p_brand_id: brandId,
    p_ad_account_id: adAccountId,
  });
  if (error) throw new Error('optimizer_get_account_read unreachable');
  return AccountReadEnvelopeSchema.catch(null).parse(data ?? null);
}

export function useBriefReads(
  brandId: string,
  accounts: readonly HomeAdAccount[],
): { reads: BriefRead[]; retry: () => void } {
  const results = useQueries({
    queries: accounts.map((account) => ({
      queryKey: optimizerQueryKeys.accountRead(brandId, account.id),
      queryFn: () => fetchBriefRead(brandId, account.id),
      enabled: Boolean(brandId),
      staleTime: FIVE_MINUTES,
      retry: 1,
    })),
  });

  const reads = accounts.map(
    (account, index): BriefRead => ({
      account,
      status: results[index]?.status ?? 'pending',
      data: results[index]?.data,
    }),
  );

  const retry = () => {
    for (const result of results) {
      if (result.isError) void result.refetch();
    }
  };

  return { reads, retry };
}
