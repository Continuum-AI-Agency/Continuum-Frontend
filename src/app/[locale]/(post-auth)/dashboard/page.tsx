import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { deriveDashboardSetup, hasAnyAccount } from '@/components/dashboard/first-run/setupState';
import { HomeBaseDashboard } from '@/components/dashboard/HomeBaseDashboard';
import { AllDashboardDataWrapper } from '@/components/dashboard/server/AllDashboardDataWrapper';
import { HomeBoardDataWrapper } from '@/components/dashboard/server/HomeBoardDataWrapper';
import { OrganicDashboardDataWrapper } from '@/components/dashboard/server/OrganicDashboardDataWrapper';
import {
  HomeBoardSkeleton,
  PaidWidgetSkeleton,
  WidgetSkeleton,
} from '@/components/dashboard/skeletons/DashboardSkeletons';
import { PaidDashboardView } from '@/components/dashboard/views/lazyViews';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { fetchBrandBook } from '@/lib/brands/brandBook';
import { hasReadableAccount } from '@/lib/home/brandSignals';
import { fetchBrandIntegrationSummary } from '@/lib/integrations/brandProfile';
import { fetchUserIntegrationSummary } from '@/lib/integrations/userIntegrations';

type DashboardPageProps = {
  searchParams?: Promise<{ view?: string | string[] }>;
};

function resolveDashboardView(value: string | string[] | undefined) {
  return value === 'paid' || value === 'all' || value === 'organic' ? value : 'overview';
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const uiText = await getTranslations('dashboard');
  const params = await searchParams;
  const { activeBrandId, brandSummaries, user } = await getActiveBrandContext();
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

  const setup = deriveDashboardSetup(
    {
      hasConnectedProviders: hasAnyAccount(userIntegrations),
      // The reading's own notion: an MCC or a GA4 property alone is not an account the Home reads.
      hasAssignedAccounts: hasReadableAccount(brandIntegrations),
      brandBook,
    },
    uiText,
  );

  // A brand with nothing connected shows the board in setup mode (its setup tile leads, read from
  // what onboarding learned); views other than the Home wait for data.
  const activeView = setup.hasConnectedData ? resolveDashboardView(params?.view) : 'overview';
  const brandName = brandSummaries.find((brand) => brand.id === activeBrandId)?.name ?? null;

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
      <Suspense fallback={<HomeBoardSkeleton />}>
        <HomeBoardDataWrapper
          brandBookRefreshedAt={brandBook?.refreshed_at ?? null}
          brandId={activeBrandId}
          brandName={brandName}
          setup={setup}
          userId={user?.id ?? null}
        />
      </Suspense>
    );

  return (
    <HomeBaseDashboard
      activeView={activeView}
      activeViewSlot={activeViewSlot}
      setup={setup}
      brandBookRefreshedAt={brandBook?.refreshed_at ?? null}
    />
  );
}
