import { create } from "zustand";

export type OrganicTourTab = "planner" | "metrics" | "agent";
export type OrganicTourCalendarView = "week" | "list";
export type PaidMediaTourTab = "dashboard" | "performance" | "jaina";
export type DashboardTourView = "organic" | "paid";

// Bridges the tour provider's onStepChange callback to the tabbed surfaces.
// The provider requests a tab; the surface component reacts and switches.
// `requestId` lets a surface re-run its effect even if the same tab is
// requested twice in a row (e.g. user navigated away mid-tour).
type TourTabState = {
  organicTab: OrganicTourTab | null;
  organicCalendarView: OrganicTourCalendarView | null;
  paidMediaTab: PaidMediaTourTab | null;
  dashboardView: DashboardTourView | null;
  requestId: number;
  requestOrganicTab: (tab: OrganicTourTab) => void;
  requestOrganicCalendarView: (view: OrganicTourCalendarView) => void;
  requestPaidMediaTab: (tab: PaidMediaTourTab) => void;
  requestDashboardView: (view: DashboardTourView) => void;
  clearRequests: () => void;
};

export const useTourTabStore = create<TourTabState>((set) => ({
  organicTab: null,
  organicCalendarView: null,
  paidMediaTab: null,
  dashboardView: null,
  requestId: 0,
  requestOrganicTab: (tab) =>
    set((state) => ({ organicTab: tab, requestId: state.requestId + 1 })),
  requestOrganicCalendarView: (view) =>
    set((state) => ({ organicCalendarView: view, requestId: state.requestId + 1 })),
  requestPaidMediaTab: (tab) =>
    set((state) => ({ paidMediaTab: tab, requestId: state.requestId + 1 })),
  requestDashboardView: (view) =>
    set((state) => ({ dashboardView: view, requestId: state.requestId + 1 })),
  clearRequests: () =>
    set({
      organicTab: null,
      organicCalendarView: null,
      paidMediaTab: null,
      dashboardView: null,
    }),
}));
