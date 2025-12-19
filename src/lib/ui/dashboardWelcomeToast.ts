import type { ToastOptions } from "@/components/ui/ToastProvider";

export const DASHBOARD_WELCOME_TOAST_DURATION_MS = 10_000;

export function shouldShowDashboardWelcomeToast(pathname: string | null): boolean {
  return pathname === "/dashboard";
}

export function createDashboardWelcomeToastOptions(displayName: string): ToastOptions {
  const safeDisplayName = displayName.trim().length > 0 ? displayName.trim() : "User";
  return {
    title: `Welcome back, ${safeDisplayName}.`,
    description:
      "Your dashboard shows live brand insights and quick actions. Switch brands or add a new one from the menu on the right.",
    variant: "info",
    durationMs: DASHBOARD_WELCOME_TOAST_DURATION_MS,
  };
}

