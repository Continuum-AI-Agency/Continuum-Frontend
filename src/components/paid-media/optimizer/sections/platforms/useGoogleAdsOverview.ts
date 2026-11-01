'use client';

// The Google tab's one read: the brand's granted Google Ads customer through the same edge the
// dashboard already uses for google-ads (paid-media-metrics), scopes `account_overview` and
// `top_campaigns`, counting the result the brand's Google portfolios are held to (their goal,
// Ramiro 2026-10-28; none when they name no single one). When it cannot read, it says WHICH
// reason holds — no Google login at all, a login whose Ads customer is not granted to this brand,
// a role that cannot read Google, an account no live grant reaches, a login Google refused, or
// the API's own error — because each one has a different fix and "No data" names none of them.

import {
  type AdAccount,
  type GoogleResultBucket,
  googlePortfolioResult,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { type BrandRole, useBrandRole } from '@/lib/library/useBrandRole';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useOptimizerAdAccounts, useOptimizerPlatformPortfolios } from '../../useOptimizerData';
import {
  type GoogleReadWindow,
  invokeGoogleMetrics,
  parseGoogleAccountOverview,
  parseGoogleCampaigns,
  rangeOf,
} from '../google/googleReads';
import {
  buildGoogleOverview,
  completeDaysWindow,
  type GoogleOverview,
} from './googleAdsOverviewModel';
import { accountsOn } from './platformTabsModel';

const FIVE_MINUTES = 5 * 60 * 1000;
/** Every spending campaign of any account this product serves fits in one page. */
const CAMPAIGN_LIMIT = 50;

export type GoogleAdsOverviewState =
  | { status: 'loading' }
  | { status: 'no-connection' }
  | { status: 'no-grant' }
  /** The caller's role on the brand cannot read Google Ads (a viewer): an owner can change it. */
  | { status: 'no-role'; account: AdAccount }
  /** The brand lists the account but no live Google grant reaches it: grant it again. */
  | { status: 'no-access'; account: AdAccount }
  | {
      status: 'error';
      account: AdAccount | null;
      message: string;
      /** Google refused the login (revoked or expired): the fix is to reconnect Google. */
      reconnect?: boolean;
    }
  | {
      status: 'ready';
      account: AdAccount;
      overview: GoogleOverview;
      /** The portfolios' goal result every Google read of the tab counts; null when none. */
      resultBucket: GoogleResultBucket | null;
    };

export const googleAdsQueryKeys = {
  overview: (
    brandId: string,
    customerId: string,
    window: GoogleReadWindow,
    resultBucket: GoogleResultBucket | null,
  ) =>
    [
      'optimizer',
      'google-ads-overview',
      brandId,
      customerId,
      window.since,
      window.until,
      resultBucket ?? 'auto',
    ] as const,
  connection: () => ['optimizer', 'google-connection'] as const,
};

export async function fetchGoogleAdsOverview(
  brandId: string,
  customerId: string,
  window: GoogleReadWindow,
  resultBucket: GoogleResultBucket | null = null,
): Promise<GoogleOverview> {
  const base = {
    brandId,
    accountId: customerId,
    range: rangeOf(window),
    ...(resultBucket ? { resultBucket } : {}),
  };
  const [account, campaigns] = await Promise.all([
    invokeGoogleMetrics({ ...base, scope: 'account_overview' }),
    invokeGoogleMetrics({ ...base, scope: 'top_campaigns', kpi: 'spend', limit: CAMPAIGN_LIMIT }),
  ]);
  return buildGoogleOverview(parseGoogleAccountOverview(account), parseGoogleCampaigns(campaigns));
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

/**
 * `window` is the producer's own window when the tab has it, so the header and the split by
 * campaign type state the same dates; null when the producer has none, which reads the same 7
 * complete days ending yesterday; 'pending' while the producer is still answering, which reads
 * nothing yet — a read on the fallback first would be thrown away (and, between UTC midnight
 * and the account's, cover a day the account has not finished).
 */
export function useGoogleAdsOverview(
  brandId: string,
  window: GoogleReadWindow | null | 'pending' = null,
): GoogleAdsOverviewState {
  const accounts = useOptimizerAdAccounts(brandId);
  const granted = accountsOn(accounts.data, 'google_ads')[0] ?? null;
  const customerId = granted?.account_id ?? null;
  const fallbackWindow = completeDaysWindow(7);
  const range = window === 'pending' ? fallbackWindow : (window ?? fallbackWindow);
  // A portfolios read that failed leaves no goal: each result type is then counted apart.
  const portfolios = useOptimizerPlatformPortfolios(brandId, 'google_ads');
  const resultBucket = portfolioGoalOf(portfolios.data);

  const overview = useQuery({
    queryKey: googleAdsQueryKeys.overview(brandId, customerId ?? 'none', range, resultBucket),
    queryFn: () => fetchGoogleAdsOverview(brandId, customerId as string, range, resultBucket),
    enabled: Boolean(brandId && customerId) && window !== 'pending' && !portfolios.isPending,
    staleTime: FIVE_MINUTES,
    retry: 1,
  });
  // The caller's role is read only when a read was refused for no access: it is what tells a
  // role that cannot read Google from an account no grant reaches.
  const role = useBrandRole(overview.isError && isNoAccess(overview.error) ? brandId : null);
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
      message: 'Could not read which ad accounts this brand is granted.',
    };
  }
  if (!granted) {
    if (login.isError) {
      return { status: 'error', account: null, message: 'Could not check your Google login.' };
    }
    if (login.isLoading) return { status: 'loading' };
    return login.data ? { status: 'no-grant' } : { status: 'no-connection' };
  }
  // The grant row's currency, else the one the read itself carried: Google's customer reports
  // money in one code, and either source names it.
  const account: AdAccount = {
    ...granted,
    currency: granted.currency ?? overview.data?.currency ?? null,
  };
  if (overview.isError) return googleReadFailure(overview.error, account, role);
  if (!overview.data) return { status: 'loading' };
  return { status: 'ready', account, overview: overview.data, resultBucket };
}

/** The roles the token RPC (resolve_google_integration_token_context) lets read Google Ads. */
const READS_GOOGLE: ReadonlySet<BrandRole> = new Set(['owner', 'admin', 'operator']);

/** The edge refused the read for no access: its 404, typed INTEGRATION_NOT_LINKED once deployed. */
function isNoAccess(error: unknown): boolean {
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown };
  return code === 'INTEGRATION_NOT_LINKED' || (code !== 'TOKEN_EXPIRED' && status === 404);
}

/**
 * What a failed Google read means for the person reading. Google refused the login: reconnect.
 * No access (the edge's 404, typed INTEGRATION_NOT_LINKED once deployed): the token RPC answers
 * nothing both for a role that cannot read Google and for an account no live grant reaches, so
 * the caller's own role (brand_role, the same permissions row the RPC checks) tells them apart;
 * while it loads the tab waits, and when it cannot be read the edge's own words stand. Anything
 * else is the API's own error.
 */
export function googleReadFailure(
  error: unknown,
  account: AdAccount,
  role: BrandRole | null | undefined,
): GoogleAdsOverviewState {
  const message = error instanceof Error ? error.message : 'Unknown error';
  const { code } = (error ?? {}) as { code?: unknown };
  if (code === 'TOKEN_EXPIRED') return { status: 'error', account, message, reconnect: true };
  if (isNoAccess(error)) {
    if (role === undefined) return { status: 'loading' };
    if (role !== null) {
      return READS_GOOGLE.has(role)
        ? { status: 'no-access', account }
        : { status: 'no-role', account };
    }
  }
  return { status: 'error', account, message };
}

/** The goal result of the brand's live Google portfolios (an archived one holds nothing). */
export function portfolioGoalOf(
  portfolios: readonly { objective: string; status: string }[],
): GoogleResultBucket | null {
  return googlePortfolioResult(
    portfolios.filter((portfolio) => portfolio.status !== 'archived').map((p) => p.objective),
  );
}
