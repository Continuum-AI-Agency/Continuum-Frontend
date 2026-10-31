import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { deriveDashboardSetup, hasAnyAccount } from '@/components/dashboard/first-run/setupState';
import { HomeBaseDashboard } from '@/components/dashboard/HomeBaseDashboard';
import { AllDashboardDataWrapper } from '@/components/dashboard/server/AllDashboardDataWrapper';
import { HomeOverviewDataWrapper } from '@/components/dashboard/server/HomeOverviewDataWrapper';
import { OrganicDashboardDataWrapper } from '@/components/dashboard/server/OrganicDashboardDataWrapper';
import {
  PaidWidgetSkeleton,
  WidgetSkeleton,
} from '@/components/dashboard/skeletons/DashboardSkeletons';
import { PaidDashboardView } from '@/components/dashboard/views/PaidDashboardView';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { fetchBrandBook } from '@/lib/brands/brandBook';
import { loadBrandReading } from '@/lib/home/brandReading.server';
import { loadHomeProfileRows } from '@/lib/home/homeProfile.server';
import { fetchBrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import { fetchUserIntegrationSummary } from '@/lib/integrations/userIntegrations';

type DashboardPageProps = {
  searchParams?: Promise<{ view?: string | string[] }>;
};

function resolveDashboardView(value: string | string[] | undefined) {
  return value === 'paid' || value === 'all' || value === 'organic' ? value : 'overview';
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

  // A brand with nothing connected shows only its setup; the reading still says what the Home
  // learned from onboarding (its goal, from the Brand Book) above the checklist. With data, the
  // overview reads the brand itself.
  const setupReading = setup.hasConnectedData
    ? null
    : await loadBrandReading({
        brandId: activeBrandId,
        summary: brandIntegrations,
        profileRows: await loadHomeProfileRows(activeBrandId),
      });

  const activeViewSlot =
    activeView === 'paid' ? (
      <Suspense fallback={<PaidWidgetSkeleton />}>
        <PaidDashboardView brandId={activeBrandId} />
      </Suspense>
    ) : activeView === 'all' ? (
      <Suspense fallback={<WidgetSkeleton />}>
        <AllDashboardDataWrapper brandId={activeBrandId} />
      </Suspense>
    ) : activeView === 'organic' ? (
      <Suspense fallback={<WidgetSkeleton />}>
        <OrganicDashboardDataWrapper brandId={activeBrandId} />
      </Suspense>
    ) : (
      <Suspense fallback={<WidgetSkeleton />}>
        <HomeOverviewDataWrapper brandId={activeBrandId} />
      </Suspense>
    );

  return (
    <HomeBaseDashboard
      activeView={activeView}
      activeViewSlot={activeViewSlot}
      setup={setup}
      brandBookRefreshedAt={brandBook?.refreshed_at ?? null}
      reading={setupReading}
    />
  );
}
