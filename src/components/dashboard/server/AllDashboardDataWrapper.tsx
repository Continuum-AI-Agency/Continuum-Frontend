import {
  OrganicPaidOverview,
  type PaidAdAccountRef,
} from '@/components/organic/compare/OrganicPaidOverview';
import { fetchBrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import type { SnapshotAccountRef } from '@/lib/organic/brandOrganicSnapshot';

// The brand's `facebook` bucket holds both Pages (organic) and ad accounts (paid); the
// asset type is the only thing that tells them apart.
export async function AllDashboardDataWrapper({ brandId }: { brandId: string }) {
  const summary = await fetchBrandIntegrationSummary(brandId);

  const organicAccounts: SnapshotAccountRef[] = [
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

  const adAccounts: PaidAdAccountRef[] = summary.facebook.accounts
    .filter((account) => account.type === 'meta_ad_account')
    .map((account) => ({
      id: account.externalAccountId ?? account.integrationAccountId,
      name: account.name,
    }));

  return (
    <OrganicPaidOverview
      brandId={brandId}
      organicAccounts={organicAccounts}
      adAccounts={adAccounts}
    />
  );
}
