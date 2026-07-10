// Cross-surface queue for organic agent @-mentions.
//
// Dashboard cards (What's Working, KPI strip, insights) pin structured refs
// here; OrganicAgentPanel drains them into PromptInput via
// `queuedMentionSuggestions` so the user never has to re-discover nested folders.

import { create } from "zustand";
import type { AgentMentionSuggestion } from "@/lib/agent-references";

type MentionQueueState = {
  queue: AgentMentionSuggestion[];
  /** Append one or more suggestions (dedupes by suggestion.key). */
  enqueue: (suggestions: AgentMentionSuggestion | AgentMentionSuggestion[]) => void;
  /** Drain the queue (caller is responsible for feeding PromptInput). */
  consume: () => AgentMentionSuggestion[];
  clear: () => void;
};

export const useAgentMentionQueueStore = create<MentionQueueState>((set, get) => ({
  queue: [],
  enqueue: (suggestions) => {
    const incoming = Array.isArray(suggestions) ? suggestions : [suggestions];
    if (incoming.length === 0) return;
    set((state) => {
      const seen = new Set(state.queue.map((s) => s.key));
      const next = [...state.queue];
      for (const suggestion of incoming) {
        if (seen.has(suggestion.key)) continue;
        seen.add(suggestion.key);
        next.push(suggestion);
      }
      return { queue: next };
    });
  },
  consume: () => {
    const current = get().queue;
    if (current.length === 0) return [];
    set({ queue: [] });
    return current;
  },
  clear: () => set({ queue: [] }),
}));

/** Imperative helper for non-React call sites (row actions, etc.). */
export function enqueueAgentMentions(
  suggestions: AgentMentionSuggestion | AgentMentionSuggestion[],
): void {
  useAgentMentionQueueStore.getState().enqueue(suggestions);
}
