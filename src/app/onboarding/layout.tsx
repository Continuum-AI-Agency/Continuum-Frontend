import type { Metadata } from "next";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { ReactQueryProvider } from "@/lib/react-query/provider";

export const metadata: Metadata = {
  title: "Onboarding | Continuum AI",
};

export default function OnboardingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ReactQueryProvider>
      <ToastProvider>{children}</ToastProvider>
    </ReactQueryProvider>
  );
}
