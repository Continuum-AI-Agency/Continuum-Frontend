import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { AgentRunsProvider } from '@/components/agents/AgentRunsProvider';
import { MixpanelInit } from '@/components/analytics/MixpanelInit';
import { GalaxyBackgroundLazy } from '@/components/ui/GalaxyBackgroundLazy';
import { NavigationTransition } from '@/components/ui/NavigationTransition';
import { ToastProvider } from '@/components/ui/ToastProvider';
import { getActiveBrandContext } from '@/lib/brands/active-brand-context';
import { ReactQueryProvider } from '@/lib/react-query/provider';
import { StudioRenderProvider } from '@/lib/studio-render/StudioRenderProvider';
import DashboardLayoutShell from '../../components/DashboardLayoutShell';
import { DashboardLayoutFallback } from './DashboardLayoutFallback';

export const metadata: Metadata = {
  title: 'Dashboard | Continuum AI',
  description: 'Your AI command center for cross-platform marketing',
};

async function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { activeBrandId, brandSummaries, user, permissions } = await getActiveBrandContext();

  if (!activeBrandId) {
    redirect('/onboarding');
  }

  const activeIsCompleted = brandSummaries.some((b) => b.id === activeBrandId);
  if (!activeIsCompleted) {
    redirect(`/onboarding?brand=${activeBrandId}`);
  }

  return (
    <DashboardLayoutShell
      activeBrandId={activeBrandId}
      brandSummaries={brandSummaries}
      user={user}
      permissions={permissions}
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
    <ReactQueryProvider>
      <ToastProvider>
        {/* Above the router on purpose: an agent run registered here keeps streaming
            while you navigate away, open another session, or close the chat panel. */}
        <AgentRunsProvider>
          <StudioRenderProvider>
            <GalaxyBackgroundLazy intensity={1} speed="glacial" />
            <div
              className="min-h-dvh overflow-hidden"
              style={{
                backgroundColor: 'var(--background)',
                color: 'var(--foreground)',
              }}
            >
              <MixpanelInit />
              <Suspense fallback={<DashboardLayoutFallback />}>
                <DashboardLayoutContent>{children}</DashboardLayoutContent>
              </Suspense>
            </div>
          </StudioRenderProvider>
        </AgentRunsProvider>
      </ToastProvider>
    </ReactQueryProvider>
  );
}
