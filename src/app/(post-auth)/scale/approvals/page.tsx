import { redirect } from "next/navigation";
import { hasProduct } from "@continuum/contracts";

import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { TierAccessRedirect } from "@/components/ui/TierAccessRedirect";
import ApprovalsClient from "./ApprovalsClient";

export default async function ApprovalsPage() {
  const { activeBrandId, entitlements, brandSummaries } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect("/onboarding");
  }

  // Match the paid-media entitlement gate.
  if (!entitlements || !hasProduct(entitlements, "paid_media")) {
    return (
      <TierAccessRedirect description="Approvals is a paid feature. Please contact an Administrator." />
    );
  }

  const brandName =
    brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? "Untitled brand";

  return (
    <div className="h-[var(--app-content-h)] min-h-[var(--workspace-min-height)] w-full min-w-0 overflow-hidden">
      <ApprovalsClient brandProfileId={activeBrandId} brandName={brandName} />
    </div>
  );
}
