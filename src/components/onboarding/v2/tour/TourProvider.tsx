"use client";

import { useCallback } from "react";
import { NextStepProvider, NextStep } from "nextstepjs";
import { allTours, TOUR_DASHBOARD, TOUR_ORGANIC, TOUR_PAID_MEDIA } from "./config";
import { TourCard } from "./TourCard";
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
// We switch a tab/view ONE STEP EARLY for steps whose target is deferred-mounted
// (list content at step 2, metrics dashboard at step 4) so the element is painted
// before nextstepjs queries it — otherwise the spotlight jumps off-screen.
function organicTabForStep(step: number): OrganicTourTab {
  // Pre-mount the metrics dashboard at the "metrics tab" step (3) so step 4's
  // deferred dashboard target exists before it is highlighted.
  if (step === 3 || step === 4) return "metrics";
  if (step === 5) return "agent";
  return "planner";
}

function organicCalendarViewForStep(step: number): OrganicTourCalendarView | null {
  if (step === 0) return "week";
  // Switch to list at the "list view" step (1) so step 2's deferred list content
  // is mounted before it is highlighted.
  if (step === 1 || step === 2) return "list";
  return null;
}

// Paid Media: 0 account selector, 1 campaign selector, 2-6 dashboard widgets, 7 jaina.
function paidMediaTabForStep(step: number): PaidMediaTourTab {
  if (step === 7) return "jaina";
  return "dashboard";
}

// Step 4 pre-switches to the paid view so steps 5-6 find paid widgets already
// mounted when nextstepjs queries. The toggle button (step 4 target) is in the
// header and visible on both views, so the switch is transparent to the user.
function dashboardViewForStep(step: number): DashboardTourView {
  return step >= 4 ? "paid" : "organic";
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
        cardComponent={TourCard}
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
