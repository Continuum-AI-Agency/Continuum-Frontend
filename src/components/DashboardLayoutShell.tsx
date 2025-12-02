"use client";

import React from "react";
import { DashboardHeader } from "./dashboard-header";
import { MobileSidebar } from "./MobileSidebar";
import { AppSidebar } from "./navigation/AppSidebar";
import { ActiveBrandProvider } from "./providers/ActiveBrandProvider";
import { StrategicAnalysisRealtimeListener } from "./strategic-analyses/StrategicAnalysisRealtimeListener";

export type BrandSummary = {
  id: string;
  name: string;
  completed: boolean;
};

type DashboardLayoutShellProps = {
  children: React.ReactNode;
  activeBrandId: string;
  brandSummaries: BrandSummary[];
};

export default function DashboardLayoutShell({
  children,
  activeBrandId,
  brandSummaries,
}: DashboardLayoutShellProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <ActiveBrandProvider activeBrandId={activeBrandId} brandSummaries={brandSummaries}>
      <StrategicAnalysisRealtimeListener brandId={activeBrandId} />
      <div className="min-h-screen relative">
        <div className="particle-layer top" aria-hidden="true" />
        <div className="particle-layer bottom" aria-hidden="true" />

        <AppSidebar />
        <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />

        <div className="h-screen flex flex-col overflow-hidden md:pl-20">
          <DashboardHeader onOpenMobile={() => setMobileOpen(true)} />

          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="max-w-[1200px] mx-auto w-full">{children}</div>
          </main>
        </div>
      </div>
    </ActiveBrandProvider>
  );
}
