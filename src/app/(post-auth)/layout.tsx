import type { Metadata } from "next";
import { DashboardSidebar } from "../../components/dashboard-sidebar";
import React from "react";
import { DashboardHeader } from "../../components/dashboard-header";
import GalaxyBackground from "../../components/ui/GalaxyBackground";
import OnboardingGate from "../../components/OnboardingGate";
import { MobileSidebar } from "../../components/MobileSidebar";

export const metadata: Metadata = {
  title: "Dashboard | Continuum AI",
  description: "Your AI command center for cross-platform marketing",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  return (
    <OnboardingGate>
      <div className="min-h-screen">
        <GalaxyBackground intensity={1} speed="glacial" />
        <div className="flex h-screen">
          {/* Sidebar */}
          <div className="hidden md:block">
            <DashboardSidebar />
          </div>
          <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />

          {/* Main content area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <DashboardHeader onOpenMobile={() => setMobileOpen(true)} />

            {/* Main content */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-6">
              <div className="max-w-[1400px] mx-auto w-full">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </OnboardingGate>
  );
}
