'use client';

import dynamic from 'next/dynamic';
import type React from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { ClientRenderProvider } from '@/lib/client-render/ClientRenderProvider';
import { DashboardHeader } from './dashboard-header';
import { AppSidebar } from './navigation/AppSidebar';
import { CommandPaletteProvider } from './navigation/CommandPaletteProvider';
import { ActiveBrandProvider } from './providers/ActiveBrandProvider';
import { StrategicAnalysisRealtimeListener } from './strategic-analyses/StrategicAnalysisRealtimeListener';
import { StrategicAnalysisStatusPill } from './strategic-analyses/StrategicAnalysisStatusPill';
import { BrandWelcomeBanner } from './welcome/BrandWelcomeBanner';

const CommandPalette = dynamic(
  () => import('./navigation/CommandPalette').then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
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
                <main className="@container/app-main min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-[var(--shell-gutter)] pb-[var(--shell-stack-gap)]">
                  <BrandWelcomeBanner />
                  <div className="min-h-full w-full min-w-0">{children}</div>
                </main>
              </SidebarInset>
            </SidebarProvider>
          </div>
          <CommandPalette automationEnvironment={automationEnvironment} />
        </CommandPaletteProvider>
      </ClientRenderProvider>
    </ActiveBrandProvider>
  );
}
