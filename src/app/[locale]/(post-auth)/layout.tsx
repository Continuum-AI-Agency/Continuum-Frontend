import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { NavigationTransition } from '@/components/ui/NavigationTransition';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { FeatureMessages } from '@/i18n/FeatureMessages';
import { resolveAutomationDeploymentEnvironment } from '@/lib/automations/access';
import { lockedProducts } from '@/lib/billing/productAccess';
import { toSidebarBilling } from '@/lib/billing/sidebarBilling';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { getServerChangelog } from '@/lib/changelog/server';
import { ReactQueryProvider } from '@/lib/react-query/provider';
import { StudioRenderProvider } from '@/lib/studio-render/StudioRenderProvider';
import DashboardLayoutShell from '../../../components/DashboardLayoutShell';
import { DashboardLayoutFallback } from './DashboardLayoutFallback';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('navigation');
  return {
    title: t('metadata_fd8cfc3bd803'),
    description: t('metadata_756308972f95'),
  };
}

async function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  // Request-time only. Awaited before the reads below start, so none of them begins inside a
  // prerender only to reject when it completes.
  await connection();
  // The changelog does not depend on the brand, so it must not wait for it: awaited in
  // sequence it added a full database round trip to every authenticated page's first paint.
  const changelogPromise = getServerChangelog();
  const { activeBrandId, brandSummaries, user, permissions, brandAccess } =
    await getActiveBrandContext();

  if (!activeBrandId) {
    redirect('/onboarding');
  }

  const activeIsCompleted = brandSummaries.some((b) => b.id === activeBrandId);
  if (!activeIsCompleted) {
    redirect(`/onboarding?brand=${activeBrandId}`);
  }

  const changelogEntries = await changelogPromise;
  const automationEnvironment = resolveAutomationDeploymentEnvironment({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  });

  return (
    <DashboardLayoutShell
      activeBrandId={activeBrandId}
      brandSummaries={brandSummaries}
      user={user}
      permissions={permissions}
      changelogEntries={changelogEntries}
      automationEnvironment={automationEnvironment}
      lockedProducts={lockedProducts(brandAccess)}
      billing={toSidebarBilling(brandAccess)}
    >
      <NavigationTransition>{children}</NavigationTransition>
    </DashboardLayoutShell>
  );
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <FeatureMessages scope="app/[locale]/(post-auth)/layout.tsx">
      <ReactQueryProvider>
        <ToastProvider>
          <StudioRenderProvider>
            <div
              className="min-h-dvh overflow-hidden"
              style={{
                backgroundColor: 'var(--background)',
                color: 'var(--foreground)',
              }}
            >
              <Suspense fallback={<DashboardLayoutFallback />}>
                <DashboardLayoutContent>{children}</DashboardLayoutContent>
              </Suspense>
            </div>
          </StudioRenderProvider>
        </ToastProvider>
      </ReactQueryProvider>
    </FeatureMessages>
  );
}
