'use client';

// The ad-account and campaign selection on the project form.
//
// Both sources are the ones that already exist — `useBrandIntegrations` (the brand's ASSIGNED
// accounts, which is exactly a project's semantics) and `/api/campaigns` (the only campaign
// read in the app). Neither is re-invented here.
//
// What is stored is the PROVIDER id (`externalAccountId`), not the internal
// brand_profile_integration_accounts uuid, because that is what `Project.adAccountIds` means
// and what every downstream reader — Jaina's `resolveAdAccountSelection`, the Library filter —
// compares against. The internal id is the fallback only for assets that have no provider id.

import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { PlatformKey } from '@/components/onboarding/platforms';
import { useBrandIntegrations } from '@/hooks/useBrandIntegrations';
import type { BrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * The platforms whose accounts are AD accounts. `PLATFORM_KEYS` also carries organic-only
 * platforms (instagram, youtube, threads, x) and Google Analytics; offering those here would
 * let a user scope a project's paid spend to a YouTube channel.
 */
const AD_PLATFORMS = [
  'facebook',
  'googleAds',
  'linkedin',
  'tiktok',
  'amazonAds',
  'dv360',
] as const satisfies readonly PlatformKey[];

const PLATFORM_LABEL: Record<(typeof AD_PLATFORMS)[number], string> = {
  facebook: 'Meta',
  googleAds: 'Google Ads',
  linkedin: 'LinkedIn',
  tiktok: 'TikTok',
  amazonAds: 'Amazon Ads',
  dv360: 'DV360',
};

export type AdAccountOption = {
  id: string;
  name: string;
  platform: (typeof AD_PLATFORMS)[number];
  platformLabel: string;
};

export type CampaignOption = {
  id: string;
  name: string;
  accountId: string;
};

export type ScopeOptions<T> = {
  items: T[];
  isLoading: boolean;
  isError: boolean;
};

/**
 * Pure so it can be tested without a renderer — the three invariants that matter (the stored
 * id is the PROVIDER id, organic platforms are excluded, an account assigned twice appears
 * once) are all in here rather than in the hook.
 */
export function deriveAdAccountOptions(
  summary: Partial<BrandIntegrationSummary> | undefined,
): AdAccountOption[] {
  const seen = new Set<string>();
  const options: AdAccountOption[] = [];
  for (const platform of AD_PLATFORMS) {
    for (const account of summary?.[platform]?.accounts ?? []) {
      const id = account.externalAccountId ?? account.integrationAccountId;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      options.push({
        id,
        name: account.alias ?? account.name,
        platform,
        platformLabel: PLATFORM_LABEL[platform],
      });
    }
  }
  return options;
}

export function useAdAccountOptions(brandId: string | undefined): ScopeOptions<AdAccountOption> {
  const { integrations, isLoading, isError } = useBrandIntegrations(brandId);
  const items = useMemo(() => deriveAdAccountOptions(integrations), [integrations]);
  return { items, isLoading, isError };
}

type CampaignRow = { id?: string; name?: string };

async function fetchCampaigns(
  brandId: string,
  account: AdAccountOption,
): Promise<CampaignOption[]> {
  // The route forwards the caller's bearer to the edge function; without it the function
  // answers 401 and the picker would silently show an empty campaign list.
  const { data } = await createSupabaseBrowserClient().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');

  const params = new URLSearchParams({ brandId, adAccountId: account.id });
  if (account.platform === 'googleAds') params.set('platform', 'google-ads');

  const response = await fetch(`/api/campaigns?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Failed to load campaigns (${response.status})`);

  const payload = (await response.json()) as { campaigns?: CampaignRow[] };
  return (payload.campaigns ?? [])
    .filter((row): row is { id: string; name?: string } => typeof row.id === 'string')
    .map((row) => ({ id: row.id, name: row.name ?? row.id, accountId: account.id }));
}

/**
 * Campaigns for the ad accounts the form has selected. There is no "every campaign for a
 * brand" read — `/api/campaigns` 400s without an ad account — so the picker is genuinely
 * account-scoped rather than choosing to be.
 */
export function useCampaignOptions(
  brandId: string | undefined,
  accounts: AdAccountOption[],
): ScopeOptions<CampaignOption> {
  const results = useQueries({
    queries: accounts.map((account) => ({
      queryKey: ['project-scope', 'campaigns', brandId, account.id, account.platform],
      queryFn: () => fetchCampaigns(brandId as string, account),
      enabled: Boolean(brandId),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });

  // Not memoized: `useQueries` returns a fresh array every render, so any dependency list
  // written over it either lies or is recomputed anyway. The list is one entry per selected
  // ad account — dedupe over it costs nothing.
  const seen = new Set<string>();
  const items: CampaignOption[] = [];
  for (const result of results) {
    for (const campaign of result.data ?? []) {
      if (seen.has(campaign.id)) continue;
      seen.add(campaign.id);
      items.push(campaign);
    }
  }

  return {
    items,
    isLoading: results.some((result) => result.isLoading),
    isError: results.some((result) => result.isError),
  };
}
