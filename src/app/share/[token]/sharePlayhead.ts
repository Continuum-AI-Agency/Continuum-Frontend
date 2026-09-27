'use client';

// Where a guest is in a shared video — the playhead and any in/out range they
// marked — published by ShareVideoPlayer and read by ExternalCommentComposer, so
// guest feedback is pinned to the moment (or span) they were looking at, as a
// member's is. Keyed by asset: a share page can hold many players.

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
