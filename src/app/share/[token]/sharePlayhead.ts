'use client';

// Where a guest is in a shared asset, published by its viewer and read by
// ExternalCommentComposer so guest feedback lands where they were looking, as a
// member's does: the playhead and any in/out range of a video or audio player,
// or the pin / marks drafted on a still. Keyed by asset: a share page can hold many.

import type { SpatialAnnotation } from '@/components/library/detail/AnnotationOverlay';
import { useSyncExternalStore } from 'react';

export type SharePlayhead = { timeMs: number; inMs: number | null; outMs: number | null };

const playheads = new Map<string, SharePlayhead>();
const listeners = new Set<() => void>();

export function publishSharePlayhead(assetId: string, playhead: SharePlayhead) {
  const previous = playheads.get(assetId);
  if (
    previous &&
    previous.timeMs === playhead.timeMs &&
    previous.inMs === playhead.inMs &&
    previous.outMs === playhead.outMs
  ) {
    return;
  }
  playheads.set(assetId, playhead);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSharePlayhead(assetId: string | null): SharePlayhead | null {
  return useSyncExternalStore(
    subscribe,
    () => (assetId ? (playheads.get(assetId) ?? null) : null),
    () => null,
  );
}

// The annotation a guest comment carries: the marked range when there is one,
// else the playhead's moment. The contract requires endMs > timeMs.
export function pinnedMoment(playhead: SharePlayhead): { timeMs: number; endMs: number | null } {
  if (playhead.inMs !== null && playhead.outMs !== null && playhead.outMs > playhead.inMs) {
    return { timeMs: playhead.inMs, endMs: playhead.outMs };
  }
  return { timeMs: playhead.inMs ?? playhead.timeMs, endMs: null };
}

// ─── Still drafts ─────────────────────────────────────────────────────────────
// `reset` counts posts, so the viewer clears its drawing once the comment carrying
// it is saved.
type ShareDraft = { annotation: SpatialAnnotation | null; reset: number };
const drafts = new Map<string, ShareDraft>();

function draftOf(assetId: string): ShareDraft {
  return drafts.get(assetId) ?? { annotation: null, reset: 0 };
}

export function publishShareDraft(assetId: string, annotation: SpatialAnnotation | null) {
  const previous = draftOf(assetId);
  if (previous.annotation === annotation) return;
  drafts.set(assetId, { ...previous, annotation });
  for (const listener of listeners) listener();
}

export function clearShareDraft(assetId: string) {
  drafts.set(assetId, { annotation: null, reset: draftOf(assetId).reset + 1 });
  for (const listener of listeners) listener();
}

export function useShareDraft(assetId: string | null): ShareDraft | null {
  return useSyncExternalStore(
    subscribe,
    () => (assetId ? (drafts.get(assetId) ?? null) : null),
    () => null,
  );
}
