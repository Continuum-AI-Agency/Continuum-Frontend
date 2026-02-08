import { redirect } from "next/navigation";

import PaidMediaClientPage from "./PaidMediaClient";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { TierAccessRedirect } from "@/components/ui/TierAccessRedirect";

export const dynamic = "force-dynamic";

export default async function PaidMediaPage() {
  const { activeBrandId, activeBrandTier, brandSummaries } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect("/onboarding");
  }

  // Permission gate: allow only tiers 1,2,3; tier 0 (or missing) is blocked.
  if (activeBrandTier === 0) {
    return (
      <TierAccessRedirect description="Paid Media is a paid feature. Please contact an Administrator." />
    );
  }

  const brandName =
    brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? "Untitled brand";

  return <PaidMediaClientPage brandProfileId={activeBrandId} brandName={brandName} />;
}
