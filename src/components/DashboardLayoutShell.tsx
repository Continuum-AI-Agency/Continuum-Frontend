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

const TourProvider = dynamic(
  () => import("./onboarding/v2/tour/TourProvider").then((m) => ({ default: m.TourProvider })),
  { ssr: false },
);

import { User } from "@supabase/supabase-js";

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
  user: User | null;
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

          <SidebarProvider
            defaultOpen={false}
            style={
              {
                "--sidebar-width": "16rem",
                "--sidebar-width-icon": "3.5rem",
              } as React.CSSProperties
            }
          >
            <AppSidebar />
            <SidebarInset className="bg-transparent overflow-hidden flex flex-col h-screen">
              <DashboardHeader />
              <main className="flex-1 min-h-0 overflow-y-auto px-[var(--app-shell-pad-inline)] pb-[var(--app-shell-gap)]">
                <BrandWelcomeBanner />
                <TourProvider>
                  <div className="w-full h-full min-h-0">{children}</div>
                </TourProvider>
              </main>
            </SidebarInset>
          </SidebarProvider>
        </div>
        <CommandPalette />
      </CommandPaletteProvider>
    </ActiveBrandProvider>
  );
}
