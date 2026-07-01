import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/ToastProvider";

export const metadata: Metadata = {
  title: "Onboarding | Continuum AI",
};

export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <ToastProvider>{children}</ToastProvider>;
}
