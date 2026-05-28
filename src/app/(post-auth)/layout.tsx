import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { userAgent } from "next/server";
import DashboardLayoutShell from "../../components/DashboardLayoutShell";
import { getActiveBrandContext } from "@/lib/brands/active-brand-context";
import { DashboardLayoutFallback } from "./DashboardLayoutFallback";
import { MixpanelInit } from "@/components/analytics/MixpanelInit";
import { NavigationTransition } from "@/components/ui/NavigationTransition";

export const metadata: Metadata = {
  title: "Dashboard | Continuum AI",
  description: "Your AI command center for cross-platform marketing",
};

async function resolveSidebarDefaultOpen(): Promise<boolean> {
  const cookieStore = await cookies();
  const stored = cookieStore.get("sidebar_state")?.value;
  if (stored === "true") return true;
  if (stored === "false") return false;

  const reqHeaders = await headers();
  const { device } = userAgent({ headers: reqHeaders });
  const isNarrow = device?.type === "mobile" || device?.type === "tablet";
  return !isNarrow;
}

async function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const [{ activeBrandId, brandSummaries, user, permissions }, sidebarDefaultOpen] =
    await Promise.all([getActiveBrandContext(), resolveSidebarDefaultOpen()]);

  if (!activeBrandId) {
    redirect("/onboarding");
  }

  const activeIsCompleted = brandSummaries.some((b) => b.id === activeBrandId);
  if (!activeIsCompleted) {
    redirect(`/onboarding?brand=${activeBrandId}`);
  }

  return (
    <DashboardLayoutShell
      activeBrandId={activeBrandId}
      brandSummaries={brandSummaries}
      user={user}
      permissions={permissions}
      sidebarDefaultOpen={sidebarDefaultOpen}
    >
      <NavigationTransition>{children}</NavigationTransition>
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
      <MixpanelInit />
      <Suspense fallback={<DashboardLayoutFallback />}>
        <DashboardLayoutContent>{children}</DashboardLayoutContent>
      </Suspense>
    </div>
  );
}
