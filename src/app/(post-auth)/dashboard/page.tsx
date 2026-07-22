import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { deriveDashboardSetup, hasAnyAccount } from '@/components/dashboard/first-run/setupState';
import { HomeBaseDashboard } from '@/components/dashboard/HomeBaseDashboard';
import { OrganicDashboardDataWrapper } from '@/components/dashboard/server/OrganicDashboardDataWrapper';
import {
  PaidWidgetSkeleton,
  WidgetSkeleton,
} from '@/components/dashboard/skeletons/DashboardSkeletons';
import { PaidDashboardView } from '@/components/dashboard/views/PaidDashboardView';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { fetchBrandBook } from '@/lib/brands/brandBook';
import { fetchBrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import { fetchUserIntegrationSummary } from '@/lib/integrations/userIntegrations';

type DashboardPageProps = {
  searchParams?: Promise<{ view?: string | string[] }>;
};

function resolveDashboardView(value: string | string[] | undefined) {
  return value === 'paid' ? 'paid' : 'organic';
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const activeView = resolveDashboardView(params?.view);
  const { activeBrandId, user } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect('/onboarding');
  }

  // First-run setup signals. fetchBrandIntegrationSummary is React-cache()d and
  // is called again inside OrganicDashboardDataWrapper, so this does not add a
  // second round-trip for the organic view.
  const [brandIntegrations, userIntegrations, brandBook] = await Promise.all([
    fetchBrandIntegrationSummary(activeBrandId),
    user?.id ? fetchUserIntegrationSummary(user.id) : Promise.resolve(null),
    fetchBrandBook(activeBrandId),
  ]);

  const setup = deriveDashboardSetup({
    hasConnectedProviders: hasAnyAccount(userIntegrations),
    hasAssignedAccounts: hasAnyAccount(brandIntegrations),
    brandBook,
  });

  const activeViewSlot =
    activeView === 'paid' ? (
      <Suspense fallback={<PaidWidgetSkeleton />}>
        <PaidDashboardView brandId={activeBrandId} />
      </Suspense>
    ) : (
      <Suspense fallback={<WidgetSkeleton />}>
        <OrganicDashboardDataWrapper brandId={activeBrandId} />
      </Suspense>
    );

  return (
    <div className="h-[var(--app-content-h)] min-h-[var(--workspace-min-height,600px)] w-full min-w-0 overflow-hidden">
      <HomeBaseDashboard
        activeView={activeView}
        activeViewSlot={activeViewSlot}
        setup={setup}
        brandBookRefreshedAt={brandBook?.refreshed_at ?? null}
      />
    </div>
  );
}
