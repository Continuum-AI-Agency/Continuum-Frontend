'use client';

// The account doctor's reads, all the Optimizer's own and all under its React Query keys, so the
// Home and the Optimizer (and the Home's brief tile) share every entry:
//   1. optimizer_list_portfolios(p_brand_id) — useOptimizerPortfolios, the brand's one portfolio read;
//   2. optimizer_get_account_read(p_brand_id, p_ad_account_id), once per ad account — the stored
//      daily read whose `guards[]` carry the measurement checks (a DB read, no model runs);
//   3. optimizer_get_platform_cards(p_brand_id, 'google_ads') — only when the brand has a Google
//      Ads account; its delivery card says whether Google is showing the account's ads.
// Read-only: every RPC checks brand membership (optimizer._assert_brand).

import { useQueries, useQueryClient } from '@tanstack/react-query';
import {
  type AccountReadEnvelope,
  AccountReadEnvelopeSchema,
  optimizerQueryKeys,
  useOptimizerPlatformCards,
  useOptimizerPortfolios,
} from '@/components/paid-media/optimizer/useOptimizerData';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { DoctorAccountRead, DoctorInputs } from './doctorModel';

const FIVE_MINUTES = 5 * 60 * 1000;

async function fetchAccountRead(
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

export type DoctorReads = Pick<DoctorInputs, 'portfolios' | 'accountReads' | 'googleCards'> & {
  retry: () => void;
};

export function useDoctorReads(brandId: string, accounts: readonly HomeAdAccount[]): DoctorReads {
  const queryClient = useQueryClient();
  const portfoliosQuery = useOptimizerPortfolios(brandId, null);
  const hasGoogle = accounts.some((account) => account.platform === 'google_ads');
  const cards = useOptimizerPlatformCards(hasGoogle ? brandId : '', 'google_ads');
  const results = useQueries({
    queries: accounts.map((account) => ({
      queryKey: optimizerQueryKeys.accountRead(brandId, account.id),
      queryFn: () => fetchAccountRead(brandId, account.id),
      enabled: Boolean(brandId),
      staleTime: FIVE_MINUTES,
      retry: 1,
    })),
  });

  const accountReads = accounts.map(
    (account, index): DoctorAccountRead => ({
      account,
      status: results[index]?.status ?? 'pending',
      data: results[index]?.data,
    }),
  );

  const portfolios: DoctorInputs['portfolios'] = portfoliosQuery.hasAnswer
    ? { status: 'ready', rows: portfoliosQuery.brandPortfolios }
    : portfoliosQuery.isError
      ? { status: 'error' }
      : { status: 'pending' };

  const retry = () => {
    if (portfoliosQuery.isError) void portfoliosQuery.refetch();
    for (const result of results) {
      if (result.isError) void result.refetch();
    }
    if (hasGoogle && cards.status === 'error') {
      void queryClient.invalidateQueries({
        queryKey: optimizerQueryKeys.platformCards(brandId, 'google_ads'),
      });
    }
  };

  return { portfolios, accountReads, googleCards: hasGoogle ? cards : null, retry };
}
