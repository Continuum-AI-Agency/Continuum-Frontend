// Cross-surface UI state for the Automations sheets. Message-level "Automate
// this prompt" actions live deep inside the chat trees (JainaMessageItem,
// OrganicAgentPanel messages), so a small store beats threading callbacks
// through both surfaces — same pattern as the agent mention queue.

import type { AgentTarget } from '@continuum/contracts';
import { create } from 'zustand';

type AutomationSheetState = {
  builderOpen: boolean;
  builderAgent: AgentTarget | null;
  builderPromptSeed: string | null;
  editAutomationId: string | null;
  detailAutomationId: string | null;
  detailRunId: string | null;
  openBuilder: (input: { agent: AgentTarget; prompt?: string }) => void;
  openEditor: (automationId: string) => void;
  openDetail: (automationId: string, runId?: string) => void;
  close: () => void;
};

export const useAutomationSheetStore = create<AutomationSheetState>((set) => ({
  builderOpen: false,
  builderAgent: null,
  builderPromptSeed: null,
  editAutomationId: null,
  detailAutomationId: null,
  detailRunId: null,
  openBuilder: ({ agent, prompt }) =>
    set({
      builderOpen: true,
      builderAgent: agent,
      builderPromptSeed: prompt ?? null,
      editAutomationId: null,
      detailAutomationId: null,
      detailRunId: null,
    }),
  openEditor: (automationId) =>
    set({
      builderOpen: true,
      builderAgent: null,
      builderPromptSeed: null,
      editAutomationId: automationId,
      detailAutomationId: null,
      detailRunId: null,
    }),
  openDetail: (automationId, runId) =>
    set({
      builderOpen: false,
      builderAgent: null,
      builderPromptSeed: null,
      editAutomationId: null,
      detailAutomationId: automationId,
      detailRunId: runId ?? null,
    }),
  close: () =>
    set({
      builderOpen: false,
      builderAgent: null,
      builderPromptSeed: null,
      editAutomationId: null,
      detailAutomationId: null,
      detailRunId: null,
    }),
}));
