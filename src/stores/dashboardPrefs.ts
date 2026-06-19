import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PaidEntityKpi } from "@continuum/contracts";

// Persisted dashboard UI preferences. Currently the KPI the top-ads tables rank
// by — kept here (not component state) so both tables share it and the choice
// survives navigation. Account memory lives in the shared
// useAccountSelectionStore (brandId:platform), reused by organic and paid.
export type PaidEntityScope = "top_campaigns" | "top_adsets";

type DashboardPrefsState = {
  paidKpi: PaidEntityKpi;
  setPaidKpi: (kpi: PaidEntityKpi) => void;
  paidScope: PaidEntityScope;
  setPaidScope: (scope: PaidEntityScope) => void;
};

export const useDashboardPrefsStore = create<DashboardPrefsState>()(
  persist(
    (set) => ({
      paidKpi: "roas",
      setPaidKpi: (kpi) => set({ paidKpi: kpi }),
      paidScope: "top_campaigns",
      setPaidScope: (scope) => set({ paidScope: scope }),
    }),
    { name: "continuum:dashboard-prefs", version: 1 },
  ),
);
