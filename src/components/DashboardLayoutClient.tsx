"use client";

import React, { useState } from "react";
import { DashboardHeader } from "./dashboard-header";
import { MobileSidebar } from "./MobileSidebar";
import GalaxyBackground from "./ui/GalaxyBackground";
import { AppSidebar } from "./navigation/AppSidebar";

interface DashboardLayoutClientProps {
  children: React.ReactNode;
}

export function DashboardLayoutClient({ children }: DashboardLayoutClientProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <GalaxyBackground intensity={1} speed="glacial" />
      <div className="flex h-screen">
        <AppSidebar />
        <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />

        <div className="flex-1 flex flex-col overflow-hidden">
          <DashboardHeader onOpenMobile={() => setMobileOpen(true)} />

          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <div className="max-w-[1400px] mx-auto w-full">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

