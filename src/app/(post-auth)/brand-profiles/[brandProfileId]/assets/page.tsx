import { Suspense } from 'react';
import { fetchSelectableAssetsForCurrentUser } from '@/lib/api/integrations/server';
import { fetchBrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import {
  filterSelectableAssetsByAccountIds,
  mergeSelectableAssetsWithBrandSummary,
} from '@/lib/integrations/selectableAssets';
import { BrandAssetsForm } from './BrandAssetsForm';

type BrandAssetsPageProps = { params: Promise<{ brandProfileId: string }> };

async function BrandAssets({ params }: BrandAssetsPageProps) {
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

// The page awaits nothing: params and both fetches resolve inside the boundary,
// so everything above it prerenders as the shell.
export default function Page(props: BrandAssetsPageProps) {
  return (
    <Suspense fallback={null}>
      <BrandAssets {...props} />
    </Suspense>
  );
}
