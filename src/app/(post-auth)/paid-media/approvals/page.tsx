import { redirect } from "next/navigation";

import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { TierAccessRedirect } from "@/components/ui/TierAccessRedirect";
import ApprovalsClient from "./ApprovalsClient";

// force-dynamic: reads user session and brand tier via getActiveBrandContext()
export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const { activeBrandId, activeBrandTier, brandSummaries } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect("/onboarding");
  }

  // Match the paid-media tier gate: tiers 1-3 only.
  if (activeBrandTier === 0) {
    return (
      <TierAccessRedirect description="Approvals is a paid feature. Please contact an Administrator." />
    );
  }

  const brandName =
    brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? "Untitled brand";

  return (
    <div className="h-[calc(100dvh-4.25rem)] min-h-[var(--workspace-min-height)] w-full overflow-hidden">
      <ApprovalsClient brandProfileId={activeBrandId} brandName={brandName} />
    </div>
  );
}
