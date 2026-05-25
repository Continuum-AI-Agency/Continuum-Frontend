import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import * as storeRegistry from "@/lib/storage/storeRegistry";
import type { ActionStatus } from "./types";

type ViewMode = "focus" | "table";
type OptimisticDecision = "approve" | "reject";

type ApprovalsState = {
  focusedActionId: string | null;
  statusFilter: ActionStatus;
  actionTypeFilter: string | null;
  viewMode: ViewMode;
  pendingDecisions: Record<string, OptimisticDecision>;

  setFocusedActionId: (id: string | null) => void;
  setStatusFilter: (status: ActionStatus) => void;
  setActionTypeFilter: (type: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  markOptimistic: (id: string, decision: OptimisticDecision) => void;
  clearOptimistic: (id: string) => void;
  resetForBrandSwitch: () => void;
};

type PersistedApprovalsState = Pick<
  ApprovalsState,
  "statusFilter" | "actionTypeFilter" | "viewMode"
>;

function partialize(state: ApprovalsState): PersistedApprovalsState {
  return {
    statusFilter: state.statusFilter,
    actionTypeFilter: state.actionTypeFilter,
    viewMode: state.viewMode,
  };
}

export const useApprovalsStore = create<ApprovalsState>()(
  persist(
    (set) => ({
      focusedActionId: null,
      statusFilter: "PENDING",
      actionTypeFilter: null,
      viewMode: "focus",
      pendingDecisions: {},

      setFocusedActionId: (id) => set({ focusedActionId: id }),
      setStatusFilter: (status) => set({ statusFilter: status }),
      setActionTypeFilter: (type) => set({ actionTypeFilter: type }),
      setViewMode: (mode) => set({ viewMode: mode }),
      markOptimistic: (id, decision) =>
        set((state) => ({
          pendingDecisions: { ...state.pendingDecisions, [id]: decision },
        })),
      clearOptimistic: (id) =>
        set((state) => {
          const { [id]: _omit, ...rest } = state.pendingDecisions;
          void _omit;
          return { pendingDecisions: rest };
        }),
      resetForBrandSwitch: () =>
        set({
          focusedActionId: null,
          statusFilter: "PENDING",
          actionTypeFilter: null,
          pendingDecisions: {},
        }),
    }),
    {
      name: "approvals-storage",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.sessionStorage : localStorage,
      ),
      partialize,
    },
  ),
);

if (typeof window !== "undefined") {
  storeRegistry.register({
    name: "approvals",
    teardown: () => {
      try {
        useApprovalsStore.getState().resetForBrandSwitch();
        window.sessionStorage.removeItem("approvals-storage");
      } catch (error) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[approvals] teardown failed", error);
        }
      }
    },
  });
}
