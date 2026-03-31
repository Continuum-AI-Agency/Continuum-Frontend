import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { HomeBaseDashboard } from "@/components/dashboard/HomeBaseDashboard";
import { PaidDashboardView } from "@/components/dashboard/views/PaidDashboardView";
import { OrganicDashboardDataWrapper } from "@/components/dashboard/server/OrganicDashboardDataWrapper";
import { WidgetSkeleton } from "@/components/dashboard/skeletons/DashboardSkeletons";

// force-dynamic: reads user session cookies via getActiveBrandContext()
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect("/onboarding");
  }

  return (
    <HomeBaseDashboard
      paidViewSlot={<PaidDashboardView brandId={activeBrandId} />}
      organicViewSlot={
        <Suspense fallback={<WidgetSkeleton />}>
          <OrganicDashboardDataWrapper brandId={activeBrandId} />
        </Suspense>
      }
    />
  );
}
