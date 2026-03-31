import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import DashboardLayoutShell from "../../components/DashboardLayoutShell";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { DashboardLayoutFallback } from "./DashboardLayoutFallback";

export const metadata: Metadata = {
  title: "Dashboard | Continuum AI",
  description: "Your AI command center for cross-platform marketing",
};

async function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { activeBrandId, brandSummaries, user } = await getActiveBrandContext();
  if (!activeBrandId) {
    redirect("/onboarding");
  }

  return (
    <DashboardLayoutShell
      activeBrandId={activeBrandId}
      brandSummaries={brandSummaries}
      user={user}
    >
      {children}
    </DashboardLayoutShell>
  );
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className="min-h-screen overflow-hidden"
      style={{
        backgroundColor: "var(--background)",
        color: "var(--foreground)",
      }}
    >
      <Suspense fallback={<DashboardLayoutFallback />}>
        <DashboardLayoutContent>{children}</DashboardLayoutContent>
      </Suspense>
    </div>
  );
}
