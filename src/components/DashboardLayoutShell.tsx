"use client";

import React from "react";
import { DashboardSidebar } from "./dashboard-sidebar";
import { DashboardHeader } from "./dashboard-header";
import { MobileSidebar } from "./MobileSidebar";

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
    <div className="min-h-screen">
      <div className="flex h-screen">
        <div className="hidden md:block">
          <DashboardSidebar />
        </div>
        <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <DashboardHeader
            onOpenMobile={() => setMobileOpen(true)}
            activeBrandId={activeBrandId}
            brandSummaries={brandSummaries}
          />

          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="max-w-[1200px] mx-auto w-full">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
