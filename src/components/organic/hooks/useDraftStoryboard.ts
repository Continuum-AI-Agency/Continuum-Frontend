'use client';

import { useShallow } from 'zustand/react/shallow';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { useCalendarStore } from '@/lib/organic/store';

function matchesDraft(draft: OrganicCalendarDraft, draftId: string): boolean {
  return draft.id === draftId || draft.backendDraftId === draftId;
}

// Signed, renderable URLs only — base64 data URLs are never surfaced in the chat.
function isRenderableUrl(url: unknown): url is string {
  return typeof url === 'string' && url.length > 0 && !url.startsWith('data:');
}

function findDraft(
  days: { slots: OrganicCalendarDraft[] }[],
  backlog: OrganicCalendarDraft[],
  draftId: string | null | undefined,
): OrganicCalendarDraft | undefined {
  if (!draftId) return undefined;
  return (
    days.flatMap((day) => day.slots).find((slot) => matchesDraft(slot, draftId)) ??
    backlog.find((slot) => matchesDraft(slot, draftId))
  );
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
  const draft = findDraft(days, backlog, draftId);
  return (draft?.mediaSuggestion?.storyboard ?? [])
    .map((frame) => frame?.storageUrl)
    .filter(isRenderableUrl);
}

export function useDraftStoryboard(draftId: string | null | undefined): string[] {
  return useCalendarStore(
    useShallow((state) => selectDraftStoryboard(state.days, state.backlogDrafts, draftId)),
  );
}

/**
 * Realized final-media image URLs, once the draft's media is 'ready' — from the
 * durable publishingAssets (re-signed on calendar load), falling back to the
 * primary assetUrl/signedUrl mounted on the media suggestion by realize_ready.
 * Empty until the draft is realized, so the caller keeps showing the blueprint
 * storyboard until the final media exists. This is what lets the chat card upgrade
 * from the 512px blueprint concept to the finished image after "Generate media".
 */
export function selectDraftRealizedImages(
  days: { slots: OrganicCalendarDraft[] }[],
  backlog: OrganicCalendarDraft[],
  draftId: string | null | undefined,
): string[] {
  const draft = findDraft(days, backlog, draftId);
  const media = draft?.mediaSuggestion;
  if (!draft || media?.mediaStatus !== 'ready') return [];
  const assetUrls = (draft.publishingAssets ?? [])
    .filter((asset) => asset.kind === 'image')
    .map((asset) => asset.storageUrl)
    .filter(isRenderableUrl);
  if (assetUrls.length > 0) return assetUrls;
  const primary = media?.signedUrl ?? media?.assetUrl;
  return isRenderableUrl(primary) ? [primary] : [];
}

export function useDraftRealizedImages(draftId: string | null | undefined): string[] {
  return useCalendarStore(
    useShallow((state) => selectDraftRealizedImages(state.days, state.backlogDrafts, draftId)),
  );
}
