import { fetchBrandProfileIncludedAssets } from "@/lib/api/brandProfiles";
import { fetchAvailableAssets } from "@/lib/api/integrations/server";
import { BrandAssetsForm } from "./BrandAssetsForm";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { brandProfileId: string } }) {
	const [available, included] = await Promise.all([
		fetchAvailableAssets(["instagram", "youtube"]),
		fetchBrandProfileIncludedAssets(params.brandProfileId),
	]);
	return (
		<BrandAssetsForm
			brandProfileId={params.brandProfileId}
			availableAssets={available}
			includedAssets={included}
		/>
	);
}

