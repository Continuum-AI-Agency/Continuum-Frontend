import 'server-only';

import type { CampaignIndexRecord } from '@/lib/paid-media/campaign-indexes';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type AdAccount = {
  id: string;
  name: string;
};

function getEdgeBaseUrl(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Missing Supabase URL configuration');
  }
  return supabaseUrl;
}

function getAnonKey(): string {
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error('Missing Supabase anon/publishable key configuration');
  }
  return anonKey;
}

/** Fetch timeline ad accounts for a brand, server-side. */
export async function fetchTimelineAccounts(brandId: string): Promise<AdAccount[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return [];

    const response = await fetch(`${getEdgeBaseUrl()}/functions/v1/fetch-timeline-accounts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: getAnonKey(),
      },
      body: JSON.stringify({ brandId }),
      cache: 'no-store',
    });

    if (!response.ok) return [];

    const data = (await response.json()) as { accounts?: AdAccount[] };
    return Array.isArray(data.accounts) ? data.accounts : [];
  } catch {
    return [];
  }
}

/**
 * Ad-account ids ASSIGNED to this brand — plugin_mcp.list_brand_ad_accounts, the
 * exact set the optimizer's brand-access gate admits, run under the caller's own
 * identity. Returns external `act_`-form ids; empty on any failure (never throws,
 * so a lookup outage degrades to "unfiltered", not a blocked page).
 */
export async function fetchAssignedAdAccountIds(brandId: string): Promise<string[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.access_token) return [];

    const { data, error } = await supabase
      .schema('plugin_mcp')
      .rpc('list_brand_ad_accounts', { p_brand_id: brandId });
    if (error) return [];

    return (Array.isArray(data) ? data : [])
      .map((row) => (row as { account_id?: unknown }).account_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

const CAMPAIGN_INDEX_TABLE = 'paid_media_campaign_indexes' as never;

type CampaignIndexRow = {
  id: string;
  brand_id: string;
  meta_account_id: string;
  name: string;
  campaign_ids: string[];
  created_at: string;
  updated_at: string;
};

function normalizeCampaignIndexRow(input: unknown): CampaignIndexRecord | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;

  if (
    typeof row.id !== 'string' ||
    typeof row.brand_id !== 'string' ||
    typeof row.meta_account_id !== 'string' ||
    typeof row.name !== 'string' ||
    !Array.isArray(row.campaign_ids) ||
    typeof row.created_at !== 'string' ||
    typeof row.updated_at !== 'string'
  ) {
    return null;
  }

  return {
    id: row.id,
    brandId: row.brand_id,
    metaAccountId: row.meta_account_id,
    name: row.name,
    campaignIds: row.campaign_ids.filter((v): v is string => typeof v === 'string'),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Fetch campaign indexes for a brand + ad account, server-side. */
export async function fetchCampaignIndexes(
  brandId: string,
  metaAccountId: string,
): Promise<CampaignIndexRecord[]> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.access_token) return [];

    const { data, error } = await supabase
      .schema('brand_profiles')
      .from(CAMPAIGN_INDEX_TABLE)
      .select('id, brand_id, meta_account_id, name, campaign_ids, created_at, updated_at')
      .eq('brand_id', brandId)
      .eq('meta_account_id', metaAccountId)
      .order('name', { ascending: true });

    if (error) return [];

    return (Array.isArray(data) ? data : [])
      .map((row) => normalizeCampaignIndexRow(row as CampaignIndexRow))
      .filter((v): v is CampaignIndexRecord => v !== null);
  } catch {
    return [];
  }
}
