import { arrayMove } from '@dnd-kit/sortable';
import { useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useStudioStore } from '../../stores/useStudioStore';
import type { TimelineEditorNodeData, TimelineItem } from '../../types';
import { type ClipEffectSpec, speedFor } from '../../utils/render/effectSpec';
import {
  type ClipTransition,
  computeOutputPlacements,
  overlapInSecFor,
} from '../../utils/render/transitions';

// Pure timeline geometry + mutation helpers for the Video Editor (timelineEditor)
// single-track sequencer. Placements reference an input-pool source by
// sourceNodeId; trim/duration are pure data over that source, so reorder, trim,
// and split need no encoder work. Helpers are exported standalone so the logic
// is unit-testable without rendering the editor.

export const DEFAULT_STILL_SEC = 3;
export const MIN_CLIP_SEC = 0.1;

export interface ClipLayout {
  item: TimelineItem;
  startSec: number;
  durationSec: number;
  leftPx: number;
  widthPx: number;
}

export interface TimelineLayout {
  clips: ClipLayout[];
  totalSec: number;
}

export function effectiveItemDuration(item: TimelineItem, sourceDurationSec?: number): number {
  if (item.kind === 'image') {
    return item.durationSec && item.durationSec > 0 ? item.durationSec : DEFAULT_STILL_SEC;
  }
  const start = Math.max(0, item.trimStartSec ?? 0);
  const fallbackEnd = sourceDurationSec ?? start + DEFAULT_STILL_SEC;
  const end = item.trimEndSec ?? fallbackEnd;
  // Speed compresses/stretches how long the trimmed source occupies the output.
  return Math.max(MIN_CLIP_SEC, (end - start) / speedFor(item.effects));
}

export function normalizeOrder(items: TimelineItem[]): TimelineItem[] {
  return items.map((item, index) => ({ ...item, order: index }));
}

// Toggle a marker at `sec`: remove it if one already sits within `epsilon`,
// otherwise insert it (kept sorted). Markers are reference points on the ruler for
// aligning cuts/overlays.
export function toggleMarkerTime(markers: number[], sec: number, epsilon = 0.05): number[] {
  if (sec < 0) return markers;
  const near = markers.filter((marker) => Math.abs(marker - sec) <= epsilon);
  if (near.length > 0) return markers.filter((marker) => Math.abs(marker - sec) > epsilon);
  return [...markers, sec].sort((a, b) => a - b);
}

export function computeLayout(
  items: TimelineItem[],
  durationFor: (item: TimelineItem) => number,
  pxPerSec: number,
): TimelineLayout {
  const ordered = [...items].sort((a, b) => a.order - b.order);
  const durations = ordered.map(durationFor);
  // Cross-dissolves overlap adjacent clips, so a clip's output start (and the
  // total) come from the shared placement math the renderer also uses.
  const { placements, totalSec } = computeOutputPlacements(
    ordered.map((item, index) => ({
      outputDurationSec: durations[index],
      crossDissolveInSec: overlapInSecFor(item.transition),
    })),
  );
  const clips = ordered.map((item, index) => {
    const startSec = placements[index].outputStartSec;
    const durationSec = durations[index];
    return {
      item,
      startSec,
      durationSec,
      leftPx: startSec * pxPerSec,
      widthPx: durationSec * pxPerSec,
    } satisfies ClipLayout;
  });
  return { clips, totalSec };
}

export function clipAtTime(layout: TimelineLayout, sec: number): ClipLayout | undefined {
  const hit = layout.clips.find(
    (clip) => sec >= clip.startSec && sec < clip.startSec + clip.durationSec,
  );
  if (hit) return hit;
  if (sec >= layout.totalSec && layout.clips.length > 0)
    return layout.clips[layout.clips.length - 1];
  return undefined;
}

export function placeItem(
  items: TimelineItem[],
  sourceNodeId: string,
  kind: 'video' | 'image',
  atIndex?: number,
): TimelineItem[] {
  const placement: TimelineItem = { id: uuidv4(), order: items.length, sourceNodeId, kind };
  const next = [...items];
  if (atIndex === undefined || atIndex >= next.length) next.push(placement);
  else next.splice(Math.max(0, atIndex), 0, placement);
  return normalizeOrder(next);
}

export function removeItem(items: TimelineItem[], itemId: string): TimelineItem[] {
  return normalizeOrder(items.filter((item) => item.id !== itemId));
}

// Insert a copy of the item (new id, same source/trim/effects) directly after it —
// copy-paste / duplicate. Order is renumbered so the copy sits next in sequence.
export function duplicateItem(items: TimelineItem[], itemId: string): TimelineItem[] {
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) return items;
  const copy: TimelineItem = { ...items[index], id: uuidv4() };
  const next = [...items];
  next.splice(index + 1, 0, copy);
  return normalizeOrder(next);
}

export function reorderItems(items: TimelineItem[], fromId: string, toId: string): TimelineItem[] {
  const ordered = [...items].sort((a, b) => a.order - b.order);
  const from = ordered.findIndex((item) => item.id === fromId);
  const to = ordered.findIndex((item) => item.id === toId);
  if (from < 0 || to < 0 || from === to) return items;
  return normalizeOrder(arrayMove(ordered, from, to));
}

export function trimItem(
  items: TimelineItem[],
  itemId: string,
  range: { startSec?: number; endSec?: number },
  sourceDurationSec?: number,
): TimelineItem[] {
  return items.map((item) => {
    if (item.id !== itemId || item.kind === 'image') return item;
    let start = Math.max(0, range.startSec ?? item.trimStartSec ?? 0);
    let end = range.endSec ?? item.trimEndSec ?? sourceDurationSec ?? start + DEFAULT_STILL_SEC;
    if (sourceDurationSec !== undefined) end = Math.min(end, sourceDurationSec);
    if (end - start < MIN_CLIP_SEC) {
      if (range.startSec !== undefined) start = Math.max(0, end - MIN_CLIP_SEC);
      else end = start + MIN_CLIP_SEC;
    }
    return { ...item, trimStartSec: start, trimEndSec: end };
  });
}

export function setStillDuration(
  items: TimelineItem[],
  itemId: string,
  sec: number,
): TimelineItem[] {
  return items.map((item) =>
    item.id === itemId && item.kind === 'image'
      ? { ...item, durationSec: Math.max(MIN_CLIP_SEC, sec) }
      : item,
  );
}

export function setItemMuteAudio(
  items: TimelineItem[],
  itemId: string,
  mute: boolean,
): TimelineItem[] {
  return items.map((item) =>
    item.id === itemId && item.kind !== 'image' ? { ...item, muteAudio: mute } : item,
  );
}

export interface ClipAudioPatch {
  volume?: number;
  audioFadeInSec?: number;
  audioFadeOutSec?: number;
}

// Merge a per-clip audio patch (gain + manual fades) onto a video item. Clamped
// to sane ranges; images have no audio and are left untouched.
export function setItemAudio(
  items: TimelineItem[],
  itemId: string,
  patch: ClipAudioPatch,
): TimelineItem[] {
  return items.map((item) => {
    if (item.id !== itemId || item.kind === 'image') return item;
    const next = { ...item };
    if (patch.volume !== undefined) next.volume = Math.max(0, Math.min(4, patch.volume));
    if (patch.audioFadeInSec !== undefined) next.audioFadeInSec = Math.max(0, patch.audioFadeInSec);
    if (patch.audioFadeOutSec !== undefined)
      next.audioFadeOutSec = Math.max(0, patch.audioFadeOutSec);
    return next;
  });
}

// Shallow-merge an effect patch onto the item. Sub-objects (adjustments,
// transform, kenBurns) are replaced wholesale by the caller (the inspector
// spreads the current value before patching a single field).
export function updateClipEffects(
  items: TimelineItem[],
  itemId: string,
  patch: Partial<ClipEffectSpec>,
): TimelineItem[] {
  return items.map((item) =>
    item.id === itemId ? { ...item, effects: { ...item.effects, ...patch } } : item,
  );
}

// Set (or clear, with undefined) the transition into a clip.
export function setItemTransition(
  items: TimelineItem[],
  itemId: string,
  transition: ClipTransition | undefined,
): TimelineItem[] {
  return items.map((item) => (item.id === itemId ? { ...item, transition } : item));
}

export function splitItem(
  items: TimelineItem[],
  itemId: string,
  localSec: number,
  sourceDurationSec?: number,
): TimelineItem[] {
  const idx = items.findIndex((item) => item.id === itemId);
  if (idx < 0) return items;
  const item = items[idx];
  const duration = effectiveItemDuration(item, sourceDurationSec);
  if (localSec <= MIN_CLIP_SEC || localSec >= duration - MIN_CLIP_SEC) return items;

  let first: TimelineItem;
  let second: TimelineItem;
  if (item.kind === 'image') {
    first = { ...item, durationSec: localSec };
    second = { ...item, id: uuidv4(), durationSec: duration - localSec };
  } else {
    // localSec is output time; convert to source time by the clip's speed so the
    // cut lands on the right source frame for sped-up / slowed clips.
    const speed = speedFor(item.effects);
    const start = Math.max(0, item.trimStartSec ?? 0);
    const end = item.trimEndSec ?? start + duration * speed;
    const splitAt = start + localSec * speed;
    first = { ...item, trimStartSec: start, trimEndSec: splitAt };
    second = { ...item, id: uuidv4(), trimStartSec: splitAt, trimEndSec: end };
  }

  const next = [...items];
  next.splice(idx, 1, first, second);
  return normalizeOrder(next);
}

export interface TimelineEditorModel {
  layout: TimelineLayout;
  durationFor: (item: TimelineItem) => number;
  place: (sourceNodeId: string, kind: 'video' | 'image', atIndex?: number) => void;
  remove: (itemId: string) => void;
  duplicate: (itemId: string) => void;
  reorder: (fromId: string, toId: string) => void;
  trim: (itemId: string, range: { startSec?: number; endSec?: number }) => void;
  setStill: (itemId: string, sec: number) => void;
  setMuteAudio: (itemId: string, mute: boolean) => void;
  setAudio: (itemId: string, patch: ClipAudioPatch) => void;
  setEffects: (itemId: string, patch: Partial<ClipEffectSpec>) => void;
  setTransition: (itemId: string, transition: ClipTransition | undefined) => void;
  split: (itemId: string, localSec: number) => void;
}

export function useTimelineEditorModel(params: {
  nodeId: string;
  items: TimelineItem[];
  sourceDurations: Map<string, number>;
  pxPerSec: number;
}): TimelineEditorModel {
  const { nodeId, items, sourceDurations, pxPerSec } = params;
  const updateNode = useStudioStore((state) => state.updateNode);
  const triggerSave = useStudioStore((state) => state.triggerSave);

  const durationFor = useCallback(
    (item: TimelineItem) => effectiveItemDuration(item, sourceDurations.get(item.sourceNodeId)),
    [sourceDurations],
  );

  const layout = useMemo(
    () => computeLayout(items, durationFor, pxPerSec),
    [items, durationFor, pxPerSec],
  );

  // Editing invalidates any prior render: reset the break-point gate so the
  // workflow re-parks until the human renders the new timeline.
  const writeItems = useCallback(
    (next: TimelineItem[]) => {
      updateNode(nodeId, (node) => ({
        ...node,
        data: {
          ...(node.data as TimelineEditorNodeData),
          items: normalizeOrder(next),
          committed: false,
        },
      }));
      triggerSave();
    },
    [nodeId, triggerSave, updateNode],
  );

  const sourceDurationFor = useCallback(
    (itemId: string) => {
      const item = items.find((candidate) => candidate.id === itemId);
      return item ? sourceDurations.get(item.sourceNodeId) : undefined;
    },
    [items, sourceDurations],
  );

  return {
    layout,
    durationFor,
    place: useCallback(
      (sourceNodeId, kind, atIndex) => writeItems(placeItem(items, sourceNodeId, kind, atIndex)),
      [items, writeItems],
    ),
    remove: useCallback((itemId) => writeItems(removeItem(items, itemId)), [items, writeItems]),
    duplicate: useCallback(
      (itemId) => writeItems(duplicateItem(items, itemId)),
      [items, writeItems],
    ),
    reorder: useCallback(
      (fromId, toId) => writeItems(reorderItems(items, fromId, toId)),
      [items, writeItems],
    ),
    trim: useCallback(
      (itemId, range) => writeItems(trimItem(items, itemId, range, sourceDurationFor(itemId))),
      [items, sourceDurationFor, writeItems],
    ),
    setStill: useCallback(
      (itemId, sec) => writeItems(setStillDuration(items, itemId, sec)),
      [items, writeItems],
    ),
    setMuteAudio: useCallback(
      (itemId, mute) => writeItems(setItemMuteAudio(items, itemId, mute)),
      [items, writeItems],
    ),
    setAudio: useCallback(
      (itemId, patch) => writeItems(setItemAudio(items, itemId, patch)),
      [items, writeItems],
    ),
    setEffects: useCallback(
      (itemId, patch) => writeItems(updateClipEffects(items, itemId, patch)),
      [items, writeItems],
    ),
    setTransition: useCallback(
      (itemId, transition) => writeItems(setItemTransition(items, itemId, transition)),
      [items, writeItems],
    ),
    split: useCallback(
      (itemId, localSec) =>
        writeItems(splitItem(items, itemId, localSec, sourceDurationFor(itemId))),
      [items, sourceDurationFor, writeItems],
    ),
  };
}
