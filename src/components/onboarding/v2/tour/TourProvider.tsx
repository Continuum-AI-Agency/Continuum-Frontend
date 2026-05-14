"use client";

import { useCallback } from "react";
import { NextStepProvider, NextStep } from "nextstepjs";
import { allTours, TOUR_DASHBOARD, TOUR_ORGANIC, TOUR_PAID_MEDIA } from "./config";
import {
  useTourTabStore,
  type DashboardTourView,
  type OrganicTourTab,
  type PaidMediaTourTab,
} from "./tourTabStore";
// Import for side effect: registers the brand-switch teardown for seen-flags.
import "./seenFlags";

// Step index -> tab. Keep in sync with the step order in config.tsx.
function organicTabForStep(step: number): OrganicTourTab {
  if (step === 1) return "metrics";
  if (step === 4) return "agent";
  return "planner";
}

function paidMediaTabForStep(step: number): PaidMediaTourTab {
  if (step === 5) return "jaina";
  return "dashboard";
}

// Steps 0-4 sit on the organic view; the "switch to Paid" step (4) still shows
// the organic view so the toggle is in context, then steps 5-6 are paid.
function dashboardViewForStep(step: number): DashboardTourView {
  return step >= 5 ? "paid" : "organic";
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const requestOrganicTab = useTourTabStore((s) => s.requestOrganicTab);
  const requestPaidMediaTab = useTourTabStore((s) => s.requestPaidMediaTab);
  const requestDashboardView = useTourTabStore((s) => s.requestDashboardView);
  const clearRequests = useTourTabStore((s) => s.clearRequests);

  const handleStepChange = useCallback(
    (step: number, tourName: string | null) => {
      if (tourName === TOUR_ORGANIC) {
        requestOrganicTab(organicTabForStep(step));
      } else if (tourName === TOUR_PAID_MEDIA) {
        requestPaidMediaTab(paidMediaTabForStep(step));
      } else if (tourName === TOUR_DASHBOARD) {
        requestDashboardView(dashboardViewForStep(step));
      }
    },
    [requestOrganicTab, requestPaidMediaTab, requestDashboardView]
  );

  return (
    <NextStepProvider>
      <NextStep
        steps={allTours}
        clickThroughOverlay={false}
        displayArrow
        onStepChange={handleStepChange}
        onComplete={clearRequests}
        onSkip={clearRequests}
      >
        {children}
      </NextStep>
    </NextStepProvider>
  );
}
