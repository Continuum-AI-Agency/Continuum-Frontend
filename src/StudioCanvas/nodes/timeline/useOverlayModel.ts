import { useCallback, useMemo } from 'react';
import { useStudioStore } from '../../stores/useStudioStore';
import type { TimelineEditorNodeData, TimelineItem, TimelineTrack } from '../../types';
import type { ClipEffectSpec } from '../../utils/render/effectSpec';
import {
  addOverlayTrack,
  allOverlayItems,
  ensureOverlayTrack,
  findOverlayItem,
  placeOverlayItem,
  removeOverlayItem,
  resolveOverlayTracks,
  setOverlayStart,
  updateOverlayItem,
} from './multiTrack';
import type { OverlayLaneItem } from './OverlayTrack';

export interface OverlayLane {
  trackId: string;
  label: string;
  items: OverlayLaneItem[];
}

import {
  type ClipAudioPatch,
  effectiveItemDuration,
  setItemAudio,
  setItemMuteAudio,
  setStillDuration,
  trimItem,
  updateClipEffects,
} from './useTimelineEditorModel';

// Editing model for overlay-track items. Mirrors useTimelineEditorModel's
// write-through pattern (updateNode + triggerSave, resetting the render gate) but
// operates on data.overlayTracks. Reuses the base item mutations so trim/still/
// effects behave identically for overlays.

export interface OverlayModel {
  laneItems: OverlayLaneItem[];
  lanes: OverlayLane[];
  findItem: (itemId: string | undefined) => TimelineItem | undefined;
  durationOf: (item: TimelineItem) => number;
  sourceDurationOf: (item: TimelineItem) => number | undefined;
  place: (
    sourceNodeId: string,
    kind: 'video' | 'image',
    startSec: number,
    trackId?: string,
  ) => void;
  addTrack: () => void;
  remove: (itemId: string) => void;
  setStart: (itemId: string, startSec: number) => void;
  trim: (itemId: string, range: { startSec?: number; endSec?: number }) => void;
  setStill: (itemId: string, sec: number) => void;
  setMuteAudio: (itemId: string, mute: boolean) => void;
  setAudio: (itemId: string, patch: ClipAudioPatch) => void;
  setEffects: (itemId: string, patch: Partial<ClipEffectSpec>) => void;
}

export function useOverlayModel(params: {
  nodeId: string;
  tracks: TimelineTrack[];
  sourceDurations: Map<string, number>;
  labelFor: (sourceNodeId: string) => string;
}): OverlayModel {
  const { nodeId, tracks, sourceDurations, labelFor } = params;
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);

  const write = useCallback(
    (updater: (tracks: TimelineTrack[]) => TimelineTrack[]) => {
      updateNode(nodeId, (node) => {
        const data = node.data as TimelineEditorNodeData;
        return {
          ...node,
          data: { ...data, overlayTracks: updater(resolveOverlayTracks(data)), committed: false },
        };
      });
      triggerSave();
    },
    [nodeId, triggerSave, updateNode],
  );

  const sourceDurationOf = useCallback(
    (item: TimelineItem) => sourceDurations.get(item.sourceNodeId),
    [sourceDurations],
  );
  const durationOf = useCallback(
    (item: TimelineItem) => effectiveItemDuration(item, sourceDurationOf(item)),
    [sourceDurationOf],
  );

  const toLaneItem = useCallback(
    (item: TimelineItem): OverlayLaneItem => ({
      id: item.id,
      kind: item.kind ?? 'video',
      label: labelFor(item.sourceNodeId),
      startSec: item.startSec ?? 0,
      durationSec: durationOf(item),
    }),
    [labelFor, durationOf],
  );

  const laneItems = useMemo<OverlayLaneItem[]>(
    () => allOverlayItems(tracks).map(toLaneItem),
    [tracks, toLaneItem],
  );

  // Overlay items grouped per track, for rendering one stacked lane each.
  const lanes = useMemo<OverlayLane[]>(
    () =>
      ensureOverlayTrack(tracks).map((track, index) => ({
        trackId: track.id,
        label: `Overlay ${index + 1}`,
        items: track.items.map(toLaneItem),
      })),
    [tracks, toLaneItem],
  );

  return {
    laneItems,
    lanes,
    findItem: useCallback((itemId) => findOverlayItem(tracks, itemId), [tracks]),
    durationOf,
    sourceDurationOf,
    place: useCallback(
      (sourceNodeId, kind, startSec, trackId) =>
        write((next) => placeOverlayItem(next, sourceNodeId, kind, startSec, trackId)),
      [write],
    ),
    addTrack: useCallback(() => write((next) => addOverlayTrack(next)), [write]),
    remove: useCallback((itemId) => write((next) => removeOverlayItem(next, itemId)), [write]),
    setStart: useCallback(
      (itemId, startSec) => write((next) => setOverlayStart(next, itemId, startSec)),
      [write],
    ),
    trim: useCallback(
      (itemId, range) =>
        write((next) =>
          updateOverlayItem(
            next,
            itemId,
            (item) => trimItem([item], itemId, range, sourceDurationOf(item))[0],
          ),
        ),
      [write, sourceDurationOf],
    ),
    setStill: useCallback(
      (itemId, sec) =>
        write((next) =>
          updateOverlayItem(next, itemId, (item) => setStillDuration([item], itemId, sec)[0]),
        ),
      [write],
    ),
    setMuteAudio: useCallback(
      (itemId, mute) =>
        write((next) =>
          updateOverlayItem(next, itemId, (item) => setItemMuteAudio([item], itemId, mute)[0]),
        ),
      [write],
    ),
    setAudio: useCallback(
      (itemId, patch) =>
        write((next) =>
          updateOverlayItem(next, itemId, (item) => setItemAudio([item], itemId, patch)[0]),
        ),
      [write],
    ),
    setEffects: useCallback(
      (itemId, patch) =>
        write((next) =>
          updateOverlayItem(next, itemId, (item) => updateClipEffects([item], itemId, patch)[0]),
        ),
      [write],
    ),
  };
}
