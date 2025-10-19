import type { Metadata } from "next";
import OnboardingGate from "../../components/OnboardingGate";
import { DashboardLayoutClient } from "../../components/DashboardLayoutClient";

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
    <OnboardingGate>
      <DashboardLayoutClient>{children}</DashboardLayoutClient>
    </OnboardingGate>
  );
}
