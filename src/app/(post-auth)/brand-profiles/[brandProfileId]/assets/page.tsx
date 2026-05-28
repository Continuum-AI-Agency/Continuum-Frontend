import { fetchSelectableAssetsForCurrentUser } from "@/lib/api/integrations/server";
import { fetchBrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import {
	filterSelectableAssetsByAccountIds,
	mergeSelectableAssetsWithBrandSummary,
} from "@/lib/integrations/selectableAssets";
import { BrandAssetsForm } from "./BrandAssetsForm";

export default async function Page({ params }: { params: { brandProfileId: string } }) {
	const [selectableAssetsResponse, integrationSummary] = await Promise.all([
		fetchSelectableAssetsForCurrentUser(),
		fetchBrandIntegrationSummary(params.brandProfileId),
	]);
	const mergedSelectableAssetsResponse = mergeSelectableAssetsWithBrandSummary(
		selectableAssetsResponse,
		integrationSummary
	);
	const assignedIntegrationAccountIds = Object.values(integrationSummary).flatMap(group =>
		group.accounts.map(account => account.integrationAccountId)
	);
	const brandSelectableAssetsResponse = filterSelectableAssetsByAccountIds(
		mergedSelectableAssetsResponse,
		new Set(assignedIntegrationAccountIds)
	);
	return (
		<BrandAssetsForm
			brandProfileId={params.brandProfileId}
			selectableAssetsResponse={brandSelectableAssetsResponse}
			assignedIntegrationAccountIds={assignedIntegrationAccountIds}
		/>
	);
}
