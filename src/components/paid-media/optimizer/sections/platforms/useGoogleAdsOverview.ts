'use client';

// The Google tab's one read: the brand's granted Google Ads customer through the same edge the
// dashboard already uses for google-ads (paid-media-metrics), scopes `account_overview` and
// `top_campaigns`. When it cannot read, it says WHICH of the three reasons holds — no Google
// login at all, a login whose Ads customer is not granted to this brand, or the API's own
// error — because each one has a different fix and "No data" names none of them.

import type { AdAccount } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { readEdgeErrorMessage } from '@/lib/supabase/edgeErrorMessage';
import { useOptimizerAdAccounts } from '../../useOptimizerData';
import {
  buildGoogleOverview,
  GoogleAccountOverviewSchema,
  type GoogleOverview,
  GoogleTopCampaignsSchema,
} from './googleAdsOverviewModel';
import { accountsOn } from './platformTabsModel';

const FIVE_MINUTES = 5 * 60 * 1000;
/** Every spending campaign of any account this product serves fits in one page. */
const CAMPAIGN_LIMIT = 50;

export type GoogleAdsOverviewState =
  | { status: 'loading' }
  | { status: 'no-connection' }
  | { status: 'no-grant' }
  | { status: 'error'; account: AdAccount | null; message: string }
  | { status: 'ready'; account: AdAccount; overview: GoogleOverview };

export const googleAdsQueryKeys = {
  overview: (brandId: string, customerId: string) =>
    ['optimizer', 'google-ads-overview', brandId, customerId] as const,
  connection: () => ['optimizer', 'google-connection'] as const,
};

async function invokeGoogleMetrics(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await createSupabaseBrowserClient().functions.invoke(
    'paid-media-metrics',
    { body: { platform: 'google-ads', range: { preset: 'last_7d' }, ...body } },
  );
  if (error) {
    throw new Error(await readEdgeErrorMessage(error, 'The Google Ads read did not answer.'));
  }
  return data;
}

export async function fetchGoogleAdsOverview(
  brandId: string,
  customerId: string,
): Promise<GoogleOverview> {
  const base = { brandId, accountId: customerId };
  const [account, campaigns] = await Promise.all([
    invokeGoogleMetrics({ ...base, scope: 'account_overview' }),
    invokeGoogleMetrics({ ...base, scope: 'top_campaigns', kpi: 'spend', limit: CAMPAIGN_LIMIT }),
  ]);
  const parsedAccount = GoogleAccountOverviewSchema.safeParse(account);
  const parsedCampaigns = GoogleTopCampaignsSchema.safeParse(campaigns);
  if (!parsedAccount.success || !parsedCampaigns.success) {
    throw new Error('The Google Ads read came back in a shape this page does not know.');
  }
  return buildGoogleOverview(parsedAccount.data, parsedCampaigns.data);
}

/** Whether the signed-in user has a Google login at all. RLS scopes user_integrations to its
 *  owner, so this never reveals anyone else's connection. */
async function fetchHasGoogleLogin(): Promise<boolean> {
  const { data, error } = await createSupabaseBrowserClient()
    .schema('brand_profiles')
    .from('user_integrations')
    .select('id')
    .eq('provider', 'google')
    .limit(1);
  if (error) throw new Error('user_integrations unreachable');
  return (data ?? []).length > 0;
}

export function useGoogleAdsOverview(brandId: string): GoogleAdsOverviewState {
  const accounts = useOptimizerAdAccounts(brandId);
  const account = accountsOn(accounts.data, 'google_ads')[0] ?? null;
  const customerId = account?.account_id ?? null;

  const overview = useQuery({
    queryKey: googleAdsQueryKeys.overview(brandId, customerId ?? 'none'),
    queryFn: () => fetchGoogleAdsOverview(brandId, customerId as string),
    enabled: Boolean(brandId && customerId),
    staleTime: FIVE_MINUTES,
    retry: 1,
  });
  const login = useQuery({
    queryKey: googleAdsQueryKeys.connection(),
    queryFn: fetchHasGoogleLogin,
    enabled: accounts.isSuccess && !customerId,
    staleTime: FIVE_MINUTES,
    retry: 1,
  });

  if (accounts.isLoading) return { status: 'loading' };
  if (accounts.isError) {
    return {
      status: 'error',
      account: null,
      message: "Could not read which ad accounts this brand is granted.",
    };
  }
  if (!account) {
    if (login.isError) {
      return { status: 'error', account: null, message: 'Could not check your Google login.' };
    }
    if (login.isLoading) return { status: 'loading' };
    return login.data ? { status: 'no-grant' } : { status: 'no-connection' };
  }
  if (overview.isError) {
    const message = overview.error instanceof Error ? overview.error.message : 'Unknown error';
    return { status: 'error', account, message };
  }
  if (!overview.data) return { status: 'loading' };
  return { status: 'ready', account, overview: overview.data };
}
