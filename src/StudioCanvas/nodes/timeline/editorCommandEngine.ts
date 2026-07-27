import type { TimelineItem, TimelineTrack } from '../../types';
import type { TimelineDocument } from './adapter';

export type TimelineItemLocation = {
  /** `base` addresses document.items; any other id addresses an overlay track. */
  trackId: 'base' | string;
  /** Final zero-based index in the addressed track. */
  index: number;
};

type TimelineMetadata = Omit<TimelineDocument, 'items' | 'overlayTracks'>;
export type TimelineMetadataKey = keyof TimelineMetadata;

/**
 * Low-level, lossless editor commands. Creation commands carry their ids instead
 * of minting them here, which makes replay and redo byte-for-byte deterministic.
 */
export type TimelineEditorCommand =
  | { type: 'insert_item'; location: TimelineItemLocation; item: TimelineItem }
  | { type: 'remove_item'; itemId: string }
  | { type: 'replace_item'; itemId: string; item: TimelineItem }
  | {
      type: 'move_item';
      itemId: string;
      location: TimelineItemLocation;
      /** Required when moving onto an overlay track; ignored for the base track. */
      startSec?: number;
    }
  | { type: 'insert_overlay_track'; index: number; track: TimelineTrack }
  | { type: 'remove_overlay_track'; trackId: string }
  | {
      type: 'set_metadata';
      values: Partial<TimelineMetadata>;
      unset?: TimelineMetadataKey[];
    };

export interface TimelineRevision {
  number: number;
  fingerprint: string;
  parentFingerprint: string | null;
}

export interface TimelineHistoryEntry {
  label?: string;
  forward: TimelineEditorCommand[];
  inverse: TimelineEditorCommand[];
  beforeFingerprint: string;
  afterFingerprint: string;
}

export interface TimelineEditorState {
  document: TimelineDocument;
  revision: TimelineRevision;
  undoStack: TimelineHistoryEntry[];
  redoStack: TimelineHistoryEntry[];
}

export type TimelineCommandResult =
  | {
      ok: true;
      document: TimelineDocument;
      revision: TimelineRevision;
      inverse: TimelineEditorCommand[];
    }
  | {
      ok: false;
      document: TimelineDocument;
      revision: TimelineRevision;
      errors: string[];
    };

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

function compactHash(value: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
}

export function fingerprintTimelineDocument(document: TimelineDocument): string {
  return compactHash(stableStringify(document));
}

function cloneDocument(document: TimelineDocument): TimelineDocument {
  return {
    ...document,
    items: document.items.map((item) => ({ ...item })),
    overlayTracks: document.overlayTracks?.map((track) => ({
      ...track,
      items: track.items.map((item) => ({ ...item })),
    })),
    markers: document.markers ? [...document.markers] : undefined,
    captionCues: document.captionCues?.map((cue) => ({
      ...cue,
      words: cue.words.map((word) => ({ ...word })),
      style: cue.style ? { ...cue.style } : undefined,
    })),
    captionWords: document.captionWords?.map((word) => ({ ...word })),
    captionStyle: document.captionStyle
      ? {
          ...document.captionStyle,
          position: document.captionStyle.position
            ? { ...document.captionStyle.position }
            : undefined,
        }
      : undefined,
  };
}

function normalizeItems(items: TimelineItem[]): TimelineItem[] {
  return items.map((item, order) => ({ ...item, order }));
}

function everyItem(document: TimelineDocument): TimelineItem[] {
  return [...document.items, ...(document.overlayTracks ?? []).flatMap((track) => track.items)];
}

function locateItem(
  document: TimelineDocument,
  itemId: string,
): { item: TimelineItem; location: TimelineItemLocation } | null {
  const baseIndex = document.items.findIndex((item) => item.id === itemId);
  if (baseIndex >= 0)
    return { item: document.items[baseIndex], location: { trackId: 'base', index: baseIndex } };
  for (const track of document.overlayTracks ?? []) {
    const index = track.items.findIndex((item) => item.id === itemId);
    if (index >= 0) return { item: track.items[index], location: { trackId: track.id, index } };
  }
  return null;
}

function insertAt(
  document: TimelineDocument,
  location: TimelineItemLocation,
  item: TimelineItem,
): TimelineDocument | null {
  if (location.index < 0 || !Number.isInteger(location.index)) return null;
  if (location.trackId === 'base') {
    if (location.index > document.items.length) return null;
    const items = [...document.items];
    const baseItem = { ...item };
    delete baseItem.startSec;
    items.splice(location.index, 0, baseItem);
    return { ...document, items: normalizeItems(items) };
  }
  const track = document.overlayTracks?.find((candidate) => candidate.id === location.trackId);
  if (!track || location.index > track.items.length) return null;
  return {
    ...document,
    overlayTracks: document.overlayTracks?.map((candidate) => {
      if (candidate.id !== location.trackId) return candidate;
      const items = [...candidate.items];
      items.splice(location.index, 0, item);
      return { ...candidate, items: normalizeItems(items) };
    }),
  };
}

function removeLocated(
  document: TimelineDocument,
  location: TimelineItemLocation,
): TimelineDocument {
  if (location.trackId === 'base') {
    return {
      ...document,
      items: normalizeItems(document.items.filter((_, index) => index !== location.index)),
    };
  }
  return {
    ...document,
    overlayTracks: document.overlayTracks?.map((track) =>
      track.id === location.trackId
        ? {
            ...track,
            items: normalizeItems(track.items.filter((_, index) => index !== location.index)),
          }
        : track,
    ),
  };
}

function validateDocument(document: TimelineDocument): string[] {
  const errors: string[] = [];
  const trackIds = new Set<string>();
  const itemIds = new Set<string>();
  for (const track of document.overlayTracks ?? []) {
    if (!track.id || trackIds.has(track.id))
      errors.push(`duplicate or empty overlay track id "${track.id}"`);
    trackIds.add(track.id);
    if (track.kind !== 'overlay') errors.push(`track "${track.id}" is not an overlay track`);
  }
  for (const item of everyItem(document)) {
    if (!item.id || itemIds.has(item.id))
      errors.push(`duplicate or empty timeline item id "${item.id}"`);
    itemIds.add(item.id);
    if (!item.sourceNodeId) errors.push(`item "${item.id}" has no source`);
    if ((item.trimStartSec ?? 0) < 0) errors.push(`item "${item.id}" has a negative trim start`);
    if (item.trimEndSec !== undefined && item.trimEndSec <= (item.trimStartSec ?? 0)) {
      errors.push(`item "${item.id}" has an empty trim range`);
    }
    if (item.kind === 'image' && item.durationSec !== undefined && item.durationSec <= 0) {
      errors.push(`image item "${item.id}" has a non-positive duration`);
    }
  }
  for (const track of document.overlayTracks ?? []) {
    for (const item of track.items) {
      if (item.startSec === undefined || item.startSec < 0) {
        errors.push(`overlay item "${item.id}" requires a non-negative startSec`);
      }
    }
  }
  for (const cue of document.captionCues ?? []) {
    if (cue.startSec < 0 || cue.endSec <= cue.startSec) {
      errors.push(`caption cue "${cue.id}" has an invalid time range`);
    }
  }
  return errors;
}

function applyOne(
  input: TimelineDocument,
  command: TimelineEditorCommand,
): { document: TimelineDocument; inverse: TimelineEditorCommand } | { error: string } {
  const document = cloneDocument(input);
  switch (command.type) {
    case 'insert_item': {
      if (locateItem(document, command.item.id)) {
        return { error: `timeline item "${command.item.id}" already exists` };
      }
      const inserted = insertAt(document, command.location, command.item);
      if (!inserted)
        return { error: `item insertion target "${command.location.trackId}" is invalid` };
      return {
        document: inserted,
        inverse: { type: 'remove_item', itemId: command.item.id },
      };
    }
    case 'remove_item': {
      const located = locateItem(document, command.itemId);
      if (!located) return { error: `timeline item "${command.itemId}" was not found` };
      return {
        document: removeLocated(document, located.location),
        inverse: { type: 'insert_item', location: located.location, item: located.item },
      };
    }
    case 'replace_item': {
      const located = locateItem(document, command.itemId);
      if (!located) return { error: `timeline item "${command.itemId}" was not found` };
      if (command.item.id !== command.itemId) {
        return { error: 'replace_item cannot change a stable item id' };
      }
      const without = removeLocated(document, located.location);
      const replaced = insertAt(without, located.location, command.item);
      if (!replaced) return { error: `could not replace timeline item "${command.itemId}"` };
      return {
        document: replaced,
        inverse: { type: 'replace_item', itemId: command.itemId, item: located.item },
      };
    }
    case 'move_item': {
      const located = locateItem(document, command.itemId);
      if (!located) return { error: `timeline item "${command.itemId}" was not found` };
      const without = removeLocated(document, located.location);
      const movedItem =
        command.location.trackId === 'base'
          ? { ...located.item, startSec: undefined }
          : {
              ...located.item,
              startSec: command.startSec ?? located.item.startSec,
            };
      if (command.location.trackId !== 'base' && movedItem.startSec === undefined) {
        return { error: `moving "${command.itemId}" to an overlay requires startSec` };
      }
      const moved = insertAt(without, command.location, movedItem);
      if (!moved) return { error: `item move target "${command.location.trackId}" is invalid` };
      return {
        document: moved,
        inverse: {
          type: 'move_item',
          itemId: command.itemId,
          location: located.location,
          ...(located.location.trackId === 'base' ? {} : { startSec: located.item.startSec }),
        },
      };
    }
    case 'insert_overlay_track': {
      if (
        command.track.kind !== 'overlay' ||
        command.index < 0 ||
        command.index > (document.overlayTracks?.length ?? 0)
      ) {
        return { error: `overlay track insertion "${command.track.id}" is invalid` };
      }
      if ((document.overlayTracks ?? []).some((track) => track.id === command.track.id)) {
        return { error: `overlay track "${command.track.id}" already exists` };
      }
      const tracks = [...(document.overlayTracks ?? [])];
      tracks.splice(command.index, 0, {
        ...command.track,
        items: normalizeItems(command.track.items),
      });
      return {
        document: { ...document, overlayTracks: tracks },
        inverse: { type: 'remove_overlay_track', trackId: command.track.id },
      };
    }
    case 'remove_overlay_track': {
      const tracks = document.overlayTracks ?? [];
      const index = tracks.findIndex((track) => track.id === command.trackId);
      if (index < 0) return { error: `overlay track "${command.trackId}" was not found` };
      return {
        document: {
          ...document,
          overlayTracks: tracks.filter((_, candidate) => candidate !== index),
        },
        inverse: { type: 'insert_overlay_track', index, track: tracks[index] },
      };
    }
    case 'set_metadata': {
      const previousValues: Partial<TimelineMetadata> = {};
      const previousUnset: TimelineMetadataKey[] = [];
      const next = { ...document, ...command.values };
      const keys = new Set<TimelineMetadataKey>([
        ...(Object.keys(command.values) as TimelineMetadataKey[]),
        ...(command.unset ?? []),
      ]);
      for (const key of keys) {
        if (Object.hasOwn(document, key)) {
          Object.assign(previousValues, { [key]: document[key] });
        } else {
          previousUnset.push(key);
        }
      }
      for (const key of command.unset ?? []) {
        delete (next as unknown as Record<string, unknown>)[key];
      }
      return {
        document: next,
        inverse: {
          type: 'set_metadata',
          values: previousValues,
          ...(previousUnset.length > 0 ? { unset: previousUnset } : {}),
        },
      };
    }
  }
}

export function createTimelineEditorState(document: TimelineDocument): TimelineEditorState {
  const cloned = cloneDocument(document);
  return {
    document: cloned,
    revision: {
      number: 0,
      fingerprint: fingerprintTimelineDocument(cloned),
      parentFingerprint: null,
    },
    undoStack: [],
    redoStack: [],
  };
}

export function applyTimelineCommandBatch(input: {
  document: TimelineDocument;
  revision: TimelineRevision;
  expectedFingerprint: string;
  commands: TimelineEditorCommand[];
}): TimelineCommandResult {
  const currentFingerprint = fingerprintTimelineDocument(input.document);
  if (
    input.expectedFingerprint !== currentFingerprint ||
    input.revision.fingerprint !== currentFingerprint
  ) {
    return {
      ok: false,
      document: input.document,
      revision: input.revision,
      errors: [
        `timeline revision conflict: expected ${input.expectedFingerprint}, current ${currentFingerprint}`,
      ],
    };
  }
  if (input.commands.length === 0) {
    return {
      ok: false,
      document: input.document,
      revision: input.revision,
      errors: ['an atomic command batch must contain at least one command'],
    };
  }

  let working = cloneDocument(input.document);
  const inverse: TimelineEditorCommand[] = [];
  for (const command of input.commands) {
    const applied = applyOne(working, command);
    if ('error' in applied) {
      return {
        ok: false,
        document: input.document,
        revision: input.revision,
        errors: [applied.error],
      };
    }
    working = applied.document;
    inverse.unshift(applied.inverse);
  }
  const errors = validateDocument(working);
  if (errors.length > 0) {
    return {
      ok: false,
      document: input.document,
      revision: input.revision,
      errors,
    };
  }
  const fingerprint = fingerprintTimelineDocument(working);
  return {
    ok: true,
    document: working,
    revision: {
      number: input.revision.number + 1,
      fingerprint,
      parentFingerprint: currentFingerprint,
    },
    inverse,
  };
}

export function commitTimelineCommands(
  state: TimelineEditorState,
  commands: TimelineEditorCommand[],
  label?: string,
): TimelineEditorState {
  const result = applyTimelineCommandBatch({
    document: state.document,
    revision: state.revision,
    expectedFingerprint: state.revision.fingerprint,
    commands,
  });
  if (!result.ok) throw new Error(result.errors.join('; '));
  const entry: TimelineHistoryEntry = {
    ...(label ? { label } : {}),
    forward: commands,
    inverse: result.inverse,
    beforeFingerprint: state.revision.fingerprint,
    afterFingerprint: result.revision.fingerprint,
  };
  return {
    document: result.document,
    revision: result.revision,
    undoStack: [...state.undoStack, entry],
    redoStack: [],
  };
}

export function undoTimelineCommands(state: TimelineEditorState): TimelineEditorState {
  const entry = state.undoStack[state.undoStack.length - 1];
  if (!entry) return state;
  const result = applyTimelineCommandBatch({
    document: state.document,
    revision: state.revision,
    expectedFingerprint: entry.afterFingerprint,
    commands: entry.inverse,
  });
  if (!result.ok) throw new Error(result.errors.join('; '));
  return {
    document: result.document,
    revision: result.revision,
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [entry, ...state.redoStack],
  };
}

export function redoTimelineCommands(state: TimelineEditorState): TimelineEditorState {
  const entry = state.redoStack[0];
  if (!entry) return state;
  const result = applyTimelineCommandBatch({
    document: state.document,
    revision: state.revision,
    expectedFingerprint: state.revision.fingerprint,
    commands: entry.forward,
  });
  if (!result.ok) throw new Error(result.errors.join('; '));
  return {
    document: result.document,
    revision: result.revision,
    undoStack: [...state.undoStack, entry],
    redoStack: state.redoStack.slice(1),
  };
}
