import { fetchSelectableAssetsForCurrentUser } from "@/lib/api/integrations/server";
import { fetchBrandIntegrationSummary } from "@/lib/integrations/brandProfile";
import { BrandAssetsForm } from "./BrandAssetsForm";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { brandProfileId: string } }) {
	const [selectableAssetsResponse, integrationSummary] = await Promise.all([
		fetchSelectableAssetsForCurrentUser(),
		fetchBrandIntegrationSummary(params.brandProfileId),
	]);

	const assignedIntegrationAccountIds = Object.values(integrationSummary).flatMap(group =>
		group.accounts.map(account => account.integrationAccountId)
	);
	return (
		<BrandAssetsForm
			brandProfileId={params.brandProfileId}
			selectableAssetsResponse={selectableAssetsResponse}
			assignedIntegrationAccountIds={assignedIntegrationAccountIds}
		/>
	);
}
