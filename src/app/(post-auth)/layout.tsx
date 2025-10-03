import type { Metadata } from "next";
import { DashboardSidebar } from "../../components/dashboard-sidebar";
import { DashboardHeader } from "../../components/dashboard-header";
import GalaxyBackground from "../../components/ui/GalaxyBackground";

export const metadata: Metadata = {
  title: "Dashboard | Continuum AI",
  description: "Your AI command center for cross-platform marketing",
};

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen">
      <GalaxyBackground intensity={1} speed="glacial" />
      <div className="flex h-screen">
        {/* Sidebar */}
        <DashboardSidebar />

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <DashboardHeader />

          {/* Main content */}
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
