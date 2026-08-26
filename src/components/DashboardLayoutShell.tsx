'use client';

import dynamic from 'next/dynamic';
import type React from 'react';
import { ClientOnly } from '@/components/ui/ClientOnly';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { DashboardHeader } from './dashboard-header';
import { AppSidebar } from './navigation/AppSidebar';
import { CommandPaletteProvider } from './navigation/CommandPaletteProvider';
import { ActiveBrandProvider } from './providers/ActiveBrandProvider';

// Cache Components: `next/dynamic` with `ssr: false` throws BAILOUT_TO_CLIENT_SIDE_RENDERING
// during prerender. That throw lands above the instant-validation boundary, so it aborts the
// static-shell validation of every route under this layout — and, at request time, leaves the
// whole dashboard subtree (both providers below wrap `children`) out of the streamed HTML.
// Keep the code-splitting; drop the bailout. The one that genuinely cannot render on the
// server is mount-gated with <ClientOnly> instead.
const CommandPalette = dynamic(() =>
  import('./navigation/CommandPalette').then((m) => ({ default: m.CommandPalette })),
);

const AgentRunsProvider = dynamic(() =>
  import('@/components/agents/AgentRunsProvider').then((m) => ({ default: m.AgentRunsProvider })),
);

const ClientRenderProvider = dynamic(() =>
  import('@/lib/client-render/ClientRenderProvider').then((m) => ({
    default: m.ClientRenderProvider,
  })),
);

const StrategicAnalysisRealtimeListener = dynamic(() =>
  import('./strategic-analyses/StrategicAnalysisRealtimeListener').then((m) => ({
    default: m.StrategicAnalysisRealtimeListener,
  })),
);

const StrategicAnalysisStatusPill = dynamic(() =>
  import('./strategic-analyses/StrategicAnalysisStatusPill').then((m) => ({
    default: m.StrategicAnalysisStatusPill,
  })),
);

// Reads `useSearchParams()`, which is a dynamic read during prerender.
const BrandWelcomeBanner = dynamic(() =>
  import('./welcome/BrandWelcomeBanner').then((m) => ({ default: m.BrandWelcomeBanner })),
);

import type { AuthIdentity } from '@/lib/auth/identity';
import type { AutomationDeploymentEnvironment } from '@/lib/automations/access';
import type { ChangelogEntry } from '@/lib/changelog/schema';

export type BrandSummary = {
  id: string;
  name: string;
  completed: boolean;
  logoPath?: string | null;
  logoUrl?: string | null;
  isPending?: boolean;
  // Ticket #162: per-brand active-integration indicator, bulk-fetched via
  // plugin_mcp.list_brands_integration_status (see useInfiniteUserBrands).
  // Undefined means "not yet fetched" — render nothing until known.
  hasActiveIntegration?: boolean;
  integrationAccountCount?: number;
};

export type BrandPermission = {
  brand_profile_id: string;
  role: string | null;
};

type DashboardLayoutShellProps = {
  children: React.ReactNode;
  activeBrandId: string;
  brandSummaries: BrandSummary[];
  user: AuthIdentity | null;
  permissions: BrandPermission[];
  changelogEntries: ChangelogEntry[];
  automationEnvironment: AutomationDeploymentEnvironment;
};

export default function DashboardLayoutShell({
  children,
  activeBrandId,
  brandSummaries,
  user,
  permissions,
  changelogEntries,
  automationEnvironment,
}: DashboardLayoutShellProps) {
  return (
    <ActiveBrandProvider
      activeBrandId={activeBrandId}
      brandSummaries={brandSummaries}
      user={user}
      permissions={permissions}
    >
      {/* Above the route tree but inside the tenant boundary: detached runs survive
          navigation without ever leaking across an active-brand change. */}
      <AgentRunsProvider>
        <ClientRenderProvider>
          <CommandPaletteProvider>
            <StrategicAnalysisRealtimeListener brandId={activeBrandId} />
            <StrategicAnalysisStatusPill brandId={activeBrandId} />
            <div className="relative">
              <div className="particle-layer top" aria-hidden="true" />
              <div className="particle-layer bottom" aria-hidden="true" />

              <SidebarProvider defaultOpen={false}>
                <AppSidebar automationEnvironment={automationEnvironment} />
                <SidebarInset className="flex h-dvh flex-col overflow-hidden bg-transparent">
                  <DashboardHeader changelogEntries={changelogEntries} />
                  {/* No inline gutter: surfaces are full-bleed panes and the
                      sidebar's own border-r is the separation. */}
                  <main className="@container/app-main min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain pb-[var(--shell-stack-gap)]">
                    <ClientOnly>
                      <BrandWelcomeBanner />
                    </ClientOnly>
                    {children}
                  </main>
                </SidebarInset>
              </SidebarProvider>
            </div>
            <CommandPalette automationEnvironment={automationEnvironment} />
          </CommandPaletteProvider>
        </ClientRenderProvider>
      </AgentRunsProvider>
    </ActiveBrandProvider>
  );
}
