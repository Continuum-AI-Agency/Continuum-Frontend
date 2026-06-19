import { redirect } from "next/navigation";

import PaidMediaClientPage from "./PaidMediaClient";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { TierAccessRedirect } from "@/components/ui/TierAccessRedirect";
import { fetchTimelineAccounts } from "@/lib/paid-media/paid-media-data.server";

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

  // Fetch accounts in parallel with layout; campaign indexes load client-side
  // after account selection to avoid a sequential server waterfall.
  const initialAccounts = await fetchTimelineAccounts(activeBrandId);
  const firstAccountId = initialAccounts[0]?.id ?? null;

  return (
    <div className="h-[var(--app-content-h)] min-h-[var(--workspace-min-height)] w-full min-w-0 overflow-hidden">
      <PaidMediaClientPage
        brandProfileId={activeBrandId}
        brandName={brandName}
        initialAccounts={initialAccounts}
        initialAdAccountId={firstAccountId}
      />
    </div>
  );
}
