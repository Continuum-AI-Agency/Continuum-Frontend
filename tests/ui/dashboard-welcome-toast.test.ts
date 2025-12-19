import { expect, test } from "bun:test";

import { TOAST_VARIANTS } from "@/components/ui/ToastProvider";
import {
  createDashboardWelcomeToastOptions,
  DASHBOARD_WELCOME_TOAST_DURATION_MS,
  shouldShowDashboardWelcomeToast,
} from "@/lib/ui/dashboardWelcomeToast";

test("ToastProvider supports the info variant", () => {
  expect(TOAST_VARIANTS).toContain("info");
});

test("Dashboard welcome toast options use info styling + configured duration", () => {
  const toast = createDashboardWelcomeToastOptions(" Duane Scott ");

  expect(toast.variant).toBe("info");
  expect(toast.durationMs).toBe(DASHBOARD_WELCOME_TOAST_DURATION_MS);
  expect(toast.title).toBe("Welcome back, Duane Scott.");
});

test("Dashboard welcome toast options fall back to User", () => {
  const toast = createDashboardWelcomeToastOptions("   ");
  expect(toast.title).toBe("Welcome back, User.");
});

test("Dashboard welcome toast only shows on /dashboard", () => {
  expect(shouldShowDashboardWelcomeToast("/dashboard")).toBe(true);
  expect(shouldShowDashboardWelcomeToast("/dashboard/brands")).toBe(false);
  expect(shouldShowDashboardWelcomeToast(null)).toBe(false);
});

