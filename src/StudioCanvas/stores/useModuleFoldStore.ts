// Which applied Techniques are folded down to a single card, and what they are called.
//
// Deliberately NOT part of useStudioStore. Everything here is presentation state: the
// canvas runtime, the autosave and the realtime merge all read `useStudioStore.nodes` /
// `.edges`, and nothing in this store ever reaches them. Keeping the two apart is what
// makes "a run over a collapsed module is identical to a run over the expanded one"
// true by construction rather than by discipline.
//
// `modules` is a label cache, not a membership record — membership lives in the
// `module:<uuid>:` node-id namespace that useApplyWorkflow already stamps, and is
// re-derived from the live graph by `deriveModulesFromNodes`. A stale entry here (a
// module deleted, or one from another room) folds nothing.

import { create } from 'zustand';

import type { WorkflowModuleRecord } from '../utils/moduleFold';

interface ModuleFoldState {
  /** moduleId → the record useApplyWorkflow built, kept for its label. */
  modules: Record<string, WorkflowModuleRecord>;
  collapsedModuleIds: string[];
  registerModule: (record: WorkflowModuleRecord) => void;
  collapseModule: (moduleId: string) => void;
  expandModule: (moduleId: string) => void;
  reset: () => void;
}

export const useModuleFoldStore = create<ModuleFoldState>((set) => ({
  modules: {},
  collapsedModuleIds: [],

  registerModule: (record) => {
    set((state) => ({ modules: { ...state.modules, [record.id]: record } }));
  },

  collapseModule: (moduleId) => {
    set((state) =>
      state.collapsedModuleIds.includes(moduleId)
        ? state
        : { collapsedModuleIds: [...state.collapsedModuleIds, moduleId] },
    );
  },

  expandModule: (moduleId) => {
    set((state) =>
      state.collapsedModuleIds.includes(moduleId)
        ? { collapsedModuleIds: state.collapsedModuleIds.filter((id) => id !== moduleId) }
        : state,
    );
  },

  reset: () => {
    set({ modules: {}, collapsedModuleIds: [] });
  },
}));
