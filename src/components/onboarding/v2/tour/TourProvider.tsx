"use client";

import { useCallback } from "react";
import { NextStepProvider, NextStep } from "nextstepjs";
import { allTours, TOUR_DASHBOARD, TOUR_ORGANIC, TOUR_PAID_MEDIA } from "./config";
import {
  useTourTabStore,
  type DashboardTourView,
  type OrganicTourCalendarView,
  type OrganicTourTab,
  type PaidMediaTourTab,
} from "./tourTabStore";
// Import for side effect: registers the brand-switch teardown for seen-flags.
import "./seenFlags";

// Step index -> tab. Keep in sync with the step order in config.tsx.
// Organic: 0 calendar, 1 list-view toggle, 2 list, 3 metrics tab, 4 metrics, 5 agent.
function organicTabForStep(step: number): OrganicTourTab {
  if (step === 4) return "metrics";
  if (step === 5) return "agent";
  return "planner";
}

function organicCalendarViewForStep(step: number): OrganicTourCalendarView | null {
  if (step === 0 || step === 1) return "week";
  if (step === 2) return "list";
  return null;
}

// Paid Media: 0 account selector, 1 campaign selector, 2-6 dashboard widgets, 7 jaina.
function paidMediaTabForStep(step: number): PaidMediaTourTab {
  if (step === 7) return "jaina";
  return "dashboard";
}

// Steps 0-4 sit on the organic view; the "switch to Paid" step (4) still shows
// the organic view so the toggle is in context, then steps 5-6 are paid.
function dashboardViewForStep(step: number): DashboardTourView {
  return step >= 5 ? "paid" : "organic";
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const requestOrganicTab = useTourTabStore((s) => s.requestOrganicTab);
  const requestOrganicCalendarView = useTourTabStore(
    (s) => s.requestOrganicCalendarView
  );
  const requestPaidMediaTab = useTourTabStore((s) => s.requestPaidMediaTab);
  const requestDashboardView = useTourTabStore((s) => s.requestDashboardView);
  const clearRequests = useTourTabStore((s) => s.clearRequests);

  const handleStepChange = useCallback(
    (step: number, tourName: string | null) => {
      if (tourName === TOUR_ORGANIC) {
        requestOrganicTab(organicTabForStep(step));
        const view = organicCalendarViewForStep(step);
        if (view) requestOrganicCalendarView(view);
      } else if (tourName === TOUR_PAID_MEDIA) {
        requestPaidMediaTab(paidMediaTabForStep(step));
      } else if (tourName === TOUR_DASHBOARD) {
        requestDashboardView(dashboardViewForStep(step));
      }
    },
    [
      requestOrganicTab,
      requestOrganicCalendarView,
      requestPaidMediaTab,
      requestDashboardView,
    ]
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
