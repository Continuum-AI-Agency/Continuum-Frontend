"use client";

import { useShallow } from "zustand/react/shallow";

import { useCalendarStore } from "@/lib/organic/store";
import type { OrganicCalendarDraft } from "@/components/organic/primitives/types";

function matchesDraft(draft: OrganicCalendarDraft, draftId: string): boolean {
  return draft.id === draftId || draft.backendDraftId === draftId;
}

/**
 * Durable 512px storyboard URLs from the persisted draft (re-signed on calendar
 * load), looked up by draftId. This is the reliable inline source: the blueprint
 * job usually finishes after the chat stream closes, so the live frame can't be
 * relied on. Signed URLs only — base64 is never surfaced in the chat.
 */
export function selectDraftStoryboard(
  days: { slots: OrganicCalendarDraft[] }[],
  backlog: OrganicCalendarDraft[],
  draftId: string | null | undefined,
): string[] {
  if (!draftId) return [];
  const draft =
    days.flatMap((day) => day.slots).find((slot) => matchesDraft(slot, draftId)) ??
    backlog.find((slot) => matchesDraft(slot, draftId));
  return (draft?.mediaSuggestion?.storyboard ?? [])
    .map((frame) => frame?.storageUrl)
    .filter((url): url is string => typeof url === "string" && url.length > 0 && !url.startsWith("data:"));
}

export function useDraftStoryboard(draftId: string | null | undefined): string[] {
  return useCalendarStore(
    useShallow((state) => selectDraftStoryboard(state.days, state.backlogDrafts, draftId)),
  );
}
