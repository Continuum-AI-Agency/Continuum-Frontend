import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { HomeBaseDashboard } from "@/components/dashboard/HomeBaseDashboard";
import { PaidDashboardView } from "@/components/dashboard/views/PaidDashboardView";
import { OrganicDashboardDataWrapper } from "@/components/dashboard/server/OrganicDashboardDataWrapper";
import { PaidWidgetSkeleton, WidgetSkeleton } from "@/components/dashboard/skeletons/DashboardSkeletons";

type DashboardPageProps = {
  searchParams?: Promise<{ view?: string | string[] }>;
};

function resolveDashboardView(value: string | string[] | undefined) {
  return value === "paid" ? "paid" : "organic";
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const activeView = resolveDashboardView(params?.view);
  const { activeBrandId } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect("/onboarding");
  }

  const activeViewSlot =
    activeView === "paid" ? (
      <Suspense fallback={<PaidWidgetSkeleton />}>
        <PaidDashboardView brandId={activeBrandId} />
      </Suspense>
    ) : (
      <Suspense fallback={<WidgetSkeleton />}>
        <OrganicDashboardDataWrapper brandId={activeBrandId} />
      </Suspense>
    );

  return (
    <HomeBaseDashboard
      activeView={activeView}
      activeViewSlot={activeViewSlot}
    />
  );
}
