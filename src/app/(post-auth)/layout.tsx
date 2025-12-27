import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardLayoutShell from "../../components/DashboardLayoutShell";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";

export const metadata: Metadata = {
  title: "Dashboard | Continuum AI",
  description: "Your AI command center for cross-platform marketing",
};

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { activeBrandId, brandSummaries } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect("/onboarding");
  }

  return (
    <div
      className="min-h-screen overflow-hidden"
      style={{
        backgroundColor: "var(--background)",
        color: "var(--foreground)",
      }}
    >
      <DashboardLayoutShell
        activeBrandId={activeBrandId}
        brandSummaries={brandSummaries}
      >
        {children}
      </DashboardLayoutShell>
    </div>
  );
}
