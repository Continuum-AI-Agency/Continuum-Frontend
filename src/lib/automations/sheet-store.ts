// Cross-surface UI state for the Automations sheets. The detail sheet's Edit
// action and the email deep-link reader both sit outside the sheets they open,
// so a small store beats threading callbacks through both chat surfaces.

import { create } from 'zustand';

type AutomationSheetState = {
  builderOpen: boolean;
  editAutomationId: string | null;
  detailAutomationId: string | null;
  detailRunId: string | null;
  openEditor: (automationId: string) => void;
  openDetail: (automationId: string, runId?: string) => void;
  close: () => void;
};

export const useAutomationSheetStore = create<AutomationSheetState>((set) => ({
  builderOpen: false,
  editAutomationId: null,
  detailAutomationId: null,
  detailRunId: null,
  openEditor: (automationId) =>
    set({
      builderOpen: true,
      editAutomationId: automationId,
      detailAutomationId: null,
      detailRunId: null,
    }),
  openDetail: (automationId, runId) =>
    set({
      builderOpen: false,
      editAutomationId: null,
      detailAutomationId: automationId,
      detailRunId: runId ?? null,
    }),
  close: () =>
    set({
      builderOpen: false,
      editAutomationId: null,
      detailAutomationId: null,
      detailRunId: null,
    }),
}));
