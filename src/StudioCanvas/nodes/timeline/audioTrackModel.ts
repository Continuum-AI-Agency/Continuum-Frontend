import { v4 as uuidv4 } from 'uuid';
import type { TimelineItem, TimelineTrack } from '../../types';
import type { TimelineDocument } from './adapter';

const MIN_DURATION_SEC = 0.05;

export interface ResolvedAudioPlacement {
  trackId: string;
  item: TimelineItem;
  startSec: number;
  durationSec: number;
  endSec: number;
}

export function audioItemDuration(
  item: TimelineItem,
  sourceDurationSec: number | undefined,
): number {
  const sourceDuration = Math.max(0, sourceDurationSec ?? 0);
  const start = Math.max(0, item.trimStartSec ?? 0);
  const end = Math.max(start, Math.min(item.trimEndSec ?? sourceDuration, sourceDuration));
  return Math.max(MIN_DURATION_SEC, end - start);
}

export function resolveAudioPlacements(
  document: Pick<TimelineDocument, 'audioTracks'>,
  sourceDurations: ReadonlyMap<string, number>,
): ResolvedAudioPlacement[] {
  return (document.audioTracks ?? [])
    .filter((track) => track.kind === 'audio')
    .flatMap((track) =>
      track.items.map((item) => {
        const startSec = Math.max(0, item.startSec ?? 0);
        const durationSec = audioItemDuration(item, sourceDurations.get(item.sourceNodeId));
        return { trackId: track.id, item, startSec, durationSec, endSec: startSec + durationSec };
      }),
    );
}

export function placeAudioItem(
  document: TimelineDocument,
  input: {
    sourceNodeId: string;
    startSec: number;
    sourceDurationSec?: number;
    trackId?: string;
    itemId?: string;
  },
): TimelineDocument {
  const tracks = document.audioTracks ?? [];
  const targetId = input.trackId ?? tracks[0]?.id ?? 'audio-1';
  const existing = tracks.find((track) => track.id === targetId);
  const item: TimelineItem = {
    id: input.itemId ?? uuidv4(),
    order: existing?.items.length ?? 0,
    sourceNodeId: input.sourceNodeId,
    kind: 'audio',
    startSec: Math.max(0, input.startSec),
    trimStartSec: 0,
    ...(input.sourceDurationSec && input.sourceDurationSec > 0
      ? { trimEndSec: input.sourceDurationSec }
      : {}),
    volume: 1,
  };
  const nextTracks: TimelineTrack[] = existing
    ? tracks.map((track) =>
        track.id === targetId ? { ...track, items: [...track.items, item] } : track,
      )
    : [...tracks, { id: targetId, kind: 'audio', items: [item] }];
  return { ...document, audioTracks: nextTracks };
}

export function patchAudioItem(
  document: TimelineDocument,
  itemId: string,
  patch: Partial<
    Pick<
      TimelineItem,
      'startSec' | 'trimStartSec' | 'trimEndSec' | 'volume' | 'audioFadeInSec' | 'audioFadeOutSec'
    >
  >,
): TimelineDocument {
  return {
    ...document,
    audioTracks: document.audioTracks?.map((track) => ({
      ...track,
      items: track.items.map((item) => {
        if (item.id !== itemId) return item;
        const trimStartSec = Math.max(0, patch.trimStartSec ?? item.trimStartSec ?? 0);
        const requestedEnd = patch.trimEndSec ?? item.trimEndSec;
        return {
          ...item,
          ...patch,
          startSec: Math.max(0, patch.startSec ?? item.startSec ?? 0),
          trimStartSec,
          ...(requestedEnd !== undefined
            ? { trimEndSec: Math.max(trimStartSec + MIN_DURATION_SEC, requestedEnd) }
            : {}),
          volume: Math.max(0, Math.min(4, patch.volume ?? item.volume ?? 1)),
          audioFadeInSec: Math.max(0, patch.audioFadeInSec ?? item.audioFadeInSec ?? 0),
          audioFadeOutSec: Math.max(0, patch.audioFadeOutSec ?? item.audioFadeOutSec ?? 0),
        };
      }),
    })),
  };
}

export function removeAudioItem(document: TimelineDocument, itemId: string): TimelineDocument {
  return {
    ...document,
    audioTracks: document.audioTracks
      ?.map((track) => ({
        ...track,
        items: track.items
          .filter((item) => item.id !== itemId)
          .map((item, order) => ({ ...item, order })),
      }))
      .filter((track) => track.items.length > 0),
  };
}
