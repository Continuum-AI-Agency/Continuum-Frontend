"use client";

import React from "react";
import { DashboardHeader } from "./dashboard-header";
import { AppSidebar } from "./navigation/AppSidebar";
import { ActiveBrandProvider } from "./providers/ActiveBrandProvider";
import { StrategicAnalysisRealtimeListener } from "./strategic-analyses/StrategicAnalysisRealtimeListener";
import { StrategicAnalysisStatusPill } from "./strategic-analyses/StrategicAnalysisStatusPill";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CommandPaletteProvider } from "./navigation/CommandPaletteProvider";
import { BrandWelcomeBanner } from "./welcome/BrandWelcomeBanner";
import dynamic from "next/dynamic";

const CommandPalette = dynamic(
  () => import("./navigation/CommandPalette").then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
);

import type { AuthIdentity } from "@/lib/auth/identity";

export type BrandSummary = {
  id: string;
  name: string;
  completed: boolean;
  logoPath?: string | null;
  logoUrl?: string | null;
  isPending?: boolean;
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
};

export default function DashboardLayoutShell({
  children,
  activeBrandId,
  brandSummaries,
  user,
  permissions,
}: DashboardLayoutShellProps) {
  return (
    <ActiveBrandProvider activeBrandId={activeBrandId} brandSummaries={brandSummaries} user={user} permissions={permissions}>
      <CommandPaletteProvider>
        <StrategicAnalysisRealtimeListener brandId={activeBrandId} />
        <StrategicAnalysisStatusPill brandId={activeBrandId} />
        <div className="relative">
          <div className="particle-layer top" aria-hidden="true" />
          <div className="particle-layer bottom" aria-hidden="true" />

          <SidebarProvider defaultOpen={false}>
            <AppSidebar />
            <SidebarInset className="flex h-dvh flex-col overflow-hidden bg-transparent">
              <DashboardHeader />
              <main className="@container/app-main min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-[var(--shell-gutter)] pb-[var(--shell-stack-gap)]">
                <BrandWelcomeBanner />
                <div className="min-h-full w-full min-w-0">{children}</div>
              </main>
            </SidebarInset>
          </SidebarProvider>
        </div>
        <CommandPalette />
      </CommandPaletteProvider>
    </ActiveBrandProvider>
  );
}
