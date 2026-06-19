import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PaidEntityKpi } from "@continuum/contracts";

// Persisted dashboard UI preferences. Currently the KPI the top-ads tables rank
// by — kept here (not component state) so both tables share it and the choice
// survives navigation. Account memory lives in the shared
// useAccountSelectionStore (brandId:platform), reused by organic and paid.
type DashboardPrefsState = {
  paidKpi: PaidEntityKpi;
  setPaidKpi: (kpi: PaidEntityKpi) => void;
};

export const useDashboardPrefsStore = create<DashboardPrefsState>()(
  persist(
    (set) => ({
      paidKpi: "roas",
      setPaidKpi: (kpi) => set({ paidKpi: kpi }),
    }),
    { name: "continuum:dashboard-prefs", version: 1 },
  ),
);
