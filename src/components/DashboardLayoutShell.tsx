"use client";

import React from "react";
import { DashboardHeader } from "./dashboard-header";
import { AppSidebar } from "./navigation/AppSidebar";
import { ActiveBrandProvider } from "./providers/ActiveBrandProvider";
import { StrategicAnalysisRealtimeListener } from "./strategic-analyses/StrategicAnalysisRealtimeListener";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

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
  return (
    <ActiveBrandProvider activeBrandId={activeBrandId} brandSummaries={brandSummaries}>
      <StrategicAnalysisRealtimeListener brandId={activeBrandId} />
      <div className="relative">
        <div className="particle-layer top" aria-hidden="true" />
        <div className="particle-layer bottom" aria-hidden="true" />

        <SidebarProvider 
           defaultOpen={false}
           style={
             {
               "--sidebar-width": "16rem",
               "--sidebar-width-icon": "5.5rem",
             } as React.CSSProperties
           }
        >
          <AppSidebar />
          <SidebarInset className="bg-transparent overflow-hidden flex flex-col h-screen">
             <DashboardHeader />
             <main className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-3 lg:px-4 pb-8">
               <div className="w-full h-full min-h-0">{children}</div>
             </main>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </ActiveBrandProvider>
  );
}
