'use client';

// The Google half of the picker's inventory: the brand's granted Google Ads customer, its
// campaigns with their channel type, and their ad groups — two ranking reads of the
// paid-media-metrics edge the Google tab already uses. No Google account means no Google group:
// the picker then renders exactly as it does for a Meta-only brand today.

import type { AdAccount } from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { readEdgeErrorMessage } from '@/lib/supabase/edgeErrorMessage';
import { accountsOn } from '../sections/platforms/platformTabsModel';
import { useOptimizerAdAccounts } from '../useOptimizerData';
import type { GoogleAdGroupRow, GoogleCampaignRow } from './platformPickerModel';

/** Every campaign and ad group of any account this product serves fits in one page. */
const RANKING_LIMIT = 50;

const RankingRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  hierarchy: z.object({ campaign: z.object({ id: z.string() }).partial().optional() }).optional(),
  labels: z.record(z.string(), z.string()).optional(),
  metrics: z.object({ spend: z.number() }).partial().optional(),
});
const RankingSchema = z.object({ rows: z.array(RankingRowSchema) });

export type GoogleInventory = {
  account: AdAccount;
  campaigns: GoogleCampaignRow[];
  adGroups: GoogleAdGroupRow[];
};

export type GooglePickerInventoryState =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; inventory: GoogleInventory };

/** The two ranking answers → picker rows. Rows without a campaign id are not addressable. */
export function parseGoogleInventory(
  account: AdAccount,
  campaignsAnswer: unknown,
  adGroupsAnswer: unknown,
): GoogleInventory | null {
  const campaigns = RankingSchema.safeParse(campaignsAnswer);
  const adGroups = RankingSchema.safeParse(adGroupsAnswer);
  if (!campaigns.success || !adGroups.success) return null;
  return {
    account,
    campaigns: campaigns.data.rows.map((row) => ({
      id: row.id,
      name: row.name,
      channelType: row.labels?.channel_type ?? null,
      spend: row.metrics?.spend ?? 0,
    })),
    adGroups: adGroups.data.rows.flatMap((row) => {
      const campaignId = row.hierarchy?.campaign?.id;
      return campaignId ? [{ id: row.id, name: row.name, campaignId }] : [];
    }),
  };
}

async function invokeRanking(brandId: string, customerId: string, scope: string) {
  const { data, error } = await createSupabaseBrowserClient().functions.invoke(
    'paid-media-metrics',
    {
      body: {
        platform: 'google-ads',
        range: { preset: 'last_30d' },
        brandId,
        accountId: customerId,
        scope,
        kpi: 'spend',
        limit: RANKING_LIMIT,
      },
    },
  );
  if (error) {
    throw new Error(await readEdgeErrorMessage(error, 'The Google Ads read did not answer.'));
  }
  return data;
}

export function useGooglePickerInventory(brandId: string): GooglePickerInventoryState {
  const accountsRead = useOptimizerAdAccounts(brandId);
  const account = accountsOn(accountsRead.data ?? [], 'google_ads')[0] ?? null;
  const query = useQuery({
    queryKey: ['optimizer', 'google-picker-inventory', brandId, account?.account_id ?? ''],
    enabled: Boolean(account),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!account) throw new Error('No Google Ads account.');
      const [campaigns, adGroups] = await Promise.all([
        invokeRanking(brandId, account.account_id, 'top_campaigns'),
        invokeRanking(brandId, account.account_id, 'top_adsets'),
      ]);
      const inventory = parseGoogleInventory(account, campaigns, adGroups);
      if (!inventory) throw new Error('The Google Ads read answered in a shape we do not know.');
      return inventory;
    },
  });
  if (accountsRead.isLoading) return { status: 'loading' };
  if (!account) return { status: 'none' };
  if (query.data) return { status: 'ready', inventory: query.data };
  if (query.error) return { status: 'error', message: query.error.message };
  return { status: 'loading' };
}
