'use client';

import { useRouter } from 'next/navigation';
import * as React from 'react';
import { writePlannerUrlState } from '@/lib/organic/plannerUrlState';
import { useCalendarStore } from '@/lib/organic/store';
import { buildPlannerDraftDeepLink } from './agent/presentAgentMessage';

/**
 * "Open this draft in the planner" — ONE implementation.
 *
 * There were two. The workspace tabs wrote the store and swapped tab (instant, but
 * left no deep link, so a reload lost the selection); the agent panel did a
 * `router.push` of the deep link (durable, but a full Next transition that remounts
 * the workspace and drops the chat's scroll position). Same intent, two behaviours,
 * and which one a user got depended on which button they happened to press.
 *
 * The unified behaviour does all three things at once: select the draft, show the
 * planner, and record `?tab=planner&draftId=…` through `writePlannerUrlState` —
 * `history.replaceState`, so the URL is a deep link without being a navigation.
 *
 * Surfaces call `useOpenPlannerDraft()` and never implement this themselves. Inside
 * the organic workspace the provider supplies the fast path; anywhere else (a
 * notification, another route) it falls back to the deep link, which is the only
 * thing that can work from outside.
 */
export type OpenPlannerDraft = (draftId: string) => void;

const OpenPlannerDraftContext = React.createContext<OpenPlannerDraft | null>(null);

export const OpenPlannerDraftProvider = OpenPlannerDraftContext.Provider;

export function useOpenPlannerDraft(): OpenPlannerDraft {
  const provided = React.useContext(OpenPlannerDraftContext);
  const router = useRouter();

  return React.useCallback(
    (draftId: string) => {
      if (provided) {
        provided(draftId);
        return;
      }
      router.push(buildPlannerDraftDeepLink(draftId));
    },
    [provided, router],
  );
}

/**
 * The in-workspace implementation. `showPlanner` is the tab swap — the one piece
 * only the tabs component owns.
 */
export function useWorkspaceOpenPlannerDraft(showPlanner: () => void): OpenPlannerDraft {
  const setSelectedDraftId = useCalendarStore((state) => state.setSelectedDraftId);

  return React.useCallback(
    (draftId: string) => {
      setSelectedDraftId(draftId);
      showPlanner();
      writePlannerUrlState({ tab: 'planner', draftId });
    },
    [setSelectedDraftId, showPlanner],
  );
}
