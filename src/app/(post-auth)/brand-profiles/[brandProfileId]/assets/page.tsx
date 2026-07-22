import { fetchSelectableAssetsForCurrentUser } from '@/lib/api/integrations/server';
import { fetchBrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import {
  filterSelectableAssetsByAccountIds,
  mergeSelectableAssetsWithBrandSummary,
} from '@/lib/integrations/selectableAssets';
import { BrandAssetsForm } from './BrandAssetsForm';

export default async function Page({ params }: { params: Promise<{ brandProfileId: string }> }) {
  const { brandProfileId } = await params;
  const [selectableAssetsResponse, integrationSummary] = await Promise.all([
    fetchSelectableAssetsForCurrentUser(),
    fetchBrandIntegrationSummary(brandProfileId),
  ]);
  const mergedSelectableAssetsResponse = mergeSelectableAssetsWithBrandSummary(
    selectableAssetsResponse,
    integrationSummary,
  );
  const assignedIntegrationAccountIds = Object.values(integrationSummary).flatMap((group) =>
    group.accounts.map((account) => account.integrationAccountId),
  );
  const brandSelectableAssetsResponse = filterSelectableAssetsByAccountIds(
    mergedSelectableAssetsResponse,
    new Set(assignedIntegrationAccountIds),
  );
  return (
    <BrandAssetsForm
      brandProfileId={brandProfileId}
      selectableAssetsResponse={brandSelectableAssetsResponse}
      assignedIntegrationAccountIds={assignedIntegrationAccountIds}
    />
  );
}
