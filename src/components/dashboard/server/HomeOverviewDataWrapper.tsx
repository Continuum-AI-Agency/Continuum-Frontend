import { HomeOverview } from '@/components/dashboard/overview/HomeOverview';
import type { HomeAdAccount } from '@/components/dashboard/overview/useHomeOverviewData';
import { loadHomeProfileRows } from '@/lib/home/homeProfile.server';
import { fetchBrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import type { SnapshotAccountRef } from '@/lib/organic/brandOrganicSnapshot';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Server half of the Home overview: the brand's ad accounts (with the currency Meta reported for
// each, so money is never printed in a guessed currency), its organic accounts, and the saved goals.
// The brand's `facebook` bucket holds both Pages and ad accounts; the asset type tells them apart.

async function loadAdAccountCurrencies(externalIds: string[]): Promise<Map<string, string>> {
  const currencies = new Map<string, string>();
  if (externalIds.length === 0) return currencies;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('brand_profiles')
    .from('integration_accounts_assets')
    .select('external_account_id, raw_payload')
    .in('external_account_id', externalIds);
  if (error) return currencies;
  for (const row of data ?? []) {
    const payload = row.raw_payload;
    const currency =
      payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.currency : null;
    if (typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)) {
      currencies.set(row.external_account_id, currency);
    }
  }
  return currencies;
}

export async function HomeOverviewDataWrapper({ brandId }: { brandId: string }) {
  const [summary, profileRows] = await Promise.all([
    fetchBrandIntegrationSummary(brandId),
    loadHomeProfileRows(brandId),
  ]);

  const metaAdAccounts = summary.facebook.accounts.filter(
    (account) => account.type === 'meta_ad_account',
  );
  const currencies = await loadAdAccountCurrencies(
    metaAdAccounts.flatMap((account) =>
      account.externalAccountId ? [account.externalAccountId] : [],
    ),
  );
  // A brand can carry the same ad account twice (two assignments, two connections); summing both
  // would double every figure, so each account is counted once.
  const adAccounts: HomeAdAccount[] = [];
  const seen = new Set<string>();
  for (const account of metaAdAccounts) {
    const id = account.externalAccountId ?? account.integrationAccountId;
    if (seen.has(id)) continue;
    seen.add(id);
    adAccounts.push({ id, name: account.alias ?? account.name, currency: currencies.get(id) ?? null });
  }

  const organicCandidates: SnapshotAccountRef[] = [
    ...summary.instagram.accounts.map((account) => ({
      platform: 'instagram' as const,
      integrationAccountId: account.integrationAccountId,
      name: account.name,
    })),
    ...summary.facebook.accounts
      .filter((account) => account.type !== 'meta_ad_account')
      .map((account) => ({
        platform: 'facebook' as const,
        integrationAccountId: account.integrationAccountId,
        name: account.name,
      })),
  ];

  const organicAccounts = organicCandidates.filter(
    (account, index, all) =>
      all.findIndex(
        (other) =>
          other.platform === account.platform &&
          other.integrationAccountId === account.integrationAccountId,
      ) === index,
  );

  return (
    <HomeOverview
      brandId={brandId}
      adAccounts={adAccounts}
      organicAccounts={organicAccounts}
      profileRows={profileRows}
    />
  );
}
