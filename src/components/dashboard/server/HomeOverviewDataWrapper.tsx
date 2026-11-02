// Static, not from lazyViews: the default view must hydrate from the HTML, and a dynamic
// import arrives only after hydration, flashing the page skeleton over the rendered view.
import { HomeOverview } from '@/components/dashboard/overview/HomeOverview';
import type { HomeAdAccount } from '@/components/dashboard/overview/useHomeOverviewData';
import { loadBrandReading } from '@/lib/home/brandReading.server';
import { loadHomeProfileRows } from '@/lib/home/homeProfile.server';
import { fetchBrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import type { SnapshotAccountRef } from '@/lib/organic/brandOrganicSnapshot';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Server half of the Home overview: the brand's ad accounts — Meta ad accounts and Google Ads
// customers, each with the currency its account row stores, so money is never printed in a
// guessed currency — its organic accounts, and the saved goals. The brand's `facebook` bucket
// holds both Pages and ad accounts; the asset type tells them apart. A Google Ads manager (MCC)
// runs no ads itself and is never one of the brand's ad accounts (PP-DT-E-home-setup-mode-mcc-
// mismatch).

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
  const readingPromise = loadBrandReading({ brandId, summary, profileRows });

  const candidates = [
    ...summary.facebook.accounts
      .filter((account) => account.type === 'meta_ad_account')
      .map((account) => ({ account, platform: 'meta' as const })),
    ...summary.googleAds.accounts
      .filter((account) => account.status !== 'manager')
      .map((account) => ({ account, platform: 'google_ads' as const })),
  ];
  const [currencies, reading] = await Promise.all([
    loadAdAccountCurrencies(
      candidates.flatMap(({ account }) =>
        account.externalAccountId ? [account.externalAccountId] : [],
      ),
    ),
    readingPromise,
  ]);
  // A brand can carry the same ad account twice (two assignments, two connections); summing both
  // would double every figure, so each account is counted once.
  const adAccounts: HomeAdAccount[] = [];
  const seen = new Set<string>();
  for (const { account, platform } of candidates) {
    const id = account.externalAccountId ?? account.integrationAccountId;
    if (seen.has(id)) continue;
    seen.add(id);
    adAccounts.push({
      id,
      name: account.alias ?? account.name,
      currency: currencies.get(id) ?? null,
      platform,
    });
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
      reading={reading}
    />
  );
}
