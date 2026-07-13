// The pure converter between the Video Editor's runtime document and the
// persisted draft wire format (media.timeline_drafts.document).
//
// The two disagree on one name: a runtime TimelineItem points at its media with
// `sourceNodeId` (on the canvas that is a React Flow node id), while the wire
// format calls it `sourceId`. Renaming the runtime field would rewrite every
// timeline already persisted inside canvas_sessions jsonb, so the seam converts
// instead. In the Library a source id IS a media.assets uuid.
//
// `effects` and `captionStyle` are opaque on the wire (z.record). They round-trip
// byte-for-byte: this module never inspects, defaults, or prunes their keys, so a
// timeline authored by a newer editor survives an older one loading it.

import type {
  MediaAsset,
  TimelineDraftDocument,
  TimelineDraftItem,
  TimelineDraftPoolMedia,
  TimelineDraftPoolSource,
  TimelineDraftTrack,
} from '@continuum/contracts';
import { TIMELINE_DRAFT_SCHEMA_VERSION } from '@continuum/contracts';
import { v4 as uuidv4 } from 'uuid';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import type { TimelineDocument } from '@/StudioCanvas/nodes/timeline/adapter';
import type { TimelineInputSource, TimelineItem, TimelineTrack } from '@/StudioCanvas/types';
import type { ClipEffectSpec } from '@/StudioCanvas/utils/render/effectSpec';

// A bin member in the Library. Nothing is added to the canonical pool shape — the
// alias exists so this module's signatures read as "a Library media-bin source",
// and because a Library source's `nodeId` is always a media.assets uuid.
export type LibraryPoolSource = TimelineInputSource;

// The editor's own shapes are interfaces without index signatures, so the trip
// through the opaque wire record needs an explicit widening. It is a cast, not a
// copy: nothing is read, so unknown keys pass through untouched.
function toOpaque<T>(value: T | undefined): Record<string, unknown> | undefined {
  return value as unknown as Record<string, unknown> | undefined;
}

function fromOpaque<T>(value: Record<string, unknown> | undefined): T | undefined {
  return value as unknown as T | undefined;
}

// jsonb should not carry explicit nulls for absent optionals.
function compact<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

export function itemToDraftItem(item: TimelineItem): TimelineDraftItem {
  return compact({
    id: item.id,
    order: item.order,
    sourceId: item.sourceNodeId,
    kind: item.kind,
    trimStartSec: item.trimStartSec,
    trimEndSec: item.trimEndSec,
    durationSec: item.durationSec,
    muteAudio: item.muteAudio,
    volume: item.volume,
    audioFadeInSec: item.audioFadeInSec,
    audioFadeOutSec: item.audioFadeOutSec,
    startSec: item.startSec,
    transition: item.transition,
    effects: toOpaque<ClipEffectSpec>(item.effects),
  }) satisfies TimelineDraftItem;
}

export function draftItemToItem(item: TimelineDraftItem): TimelineItem {
  return compact({
    id: item.id,
    order: item.order,
    sourceNodeId: item.sourceId,
    kind: item.kind,
    trimStartSec: item.trimStartSec,
    trimEndSec: item.trimEndSec,
    durationSec: item.durationSec,
    muteAudio: item.muteAudio,
    volume: item.volume,
    audioFadeInSec: item.audioFadeInSec,
    audioFadeOutSec: item.audioFadeOutSec,
    startSec: item.startSec,
    transition: item.transition,
    effects: fromOpaque<ClipEffectSpec>(item.effects),
  }) satisfies TimelineItem;
}

function trackToDraftTrack(track: TimelineTrack): TimelineDraftTrack {
  return { id: track.id, kind: track.kind, items: track.items.map(itemToDraftItem) };
}

function draftTrackToTrack(track: TimelineDraftTrack): TimelineTrack {
  return { id: track.id, kind: track.kind, items: track.items.map(draftItemToItem) };
}

// Only image/video are placeable. A pool member whose asset row is a 'file' (or
// whose row is gone) has no kind to render, so it is kept as a video tile rather
// than silently dropped — a missing tile is visible, a missing clip is not.
function poolKind(kind: string | null | undefined): 'video' | 'image' {
  return kind === 'image' ? 'image' : 'video';
}

export function poolSourceToDraft(source: LibraryPoolSource): TimelineDraftPoolSource {
  return compact({
    assetId: source.nodeId,
    kind: source.kind,
    label: source.label,
    durationSec: source.durationSec,
  }) satisfies TimelineDraftPoolSource;
}

// Rehydrates a persisted bin. The durable draft holds only asset ids + labels;
// playback URLs expire, so the server re-mints them into `poolMedia` on every
// load and they are merged back in here.
export function draftPoolToSources(
  pool: readonly TimelineDraftPoolSource[],
  poolMedia: readonly TimelineDraftPoolMedia[],
): LibraryPoolSource[] {
  const mediaById = new Map(poolMedia.map((media) => [media.assetId, media]));
  return pool.map((source) => {
    const media = mediaById.get(source.assetId);
    const durationSec =
      source.durationSec ?? (media?.durationMs != null ? media.durationMs / 1000 : undefined);
    return compact({
      nodeId: source.assetId,
      kind: source.kind,
      label: source.label,
      previewUrl: media?.signedUrl ?? undefined,
      durationSec,
    }) satisfies LibraryPoolSource;
  });
}

export function toDraftDocument(input: {
  sourceAssetId: string;
  pool: readonly LibraryPoolSource[];
  document: TimelineDocument;
}): TimelineDraftDocument {
  const { document, pool, sourceAssetId } = input;
  return compact({
    schemaVersion: TIMELINE_DRAFT_SCHEMA_VERSION,
    sourceAssetId,
    pool: pool.map(poolSourceToDraft),
    items: document.items.map(itemToDraftItem),
    overlayTracks: document.overlayTracks?.map(trackToDraftTrack),
    exportPresetId: document.exportPresetId,
    markers: document.markers,
    captionsEnabled: document.captionsEnabled,
    captionWords: document.captionWords,
    captionStyle: toOpaque<CaptionStyle>(document.captionStyle),
  }) satisfies TimelineDraftDocument;
}

export function fromDraftDocument(draft: TimelineDraftDocument): TimelineDocument {
  return compact({
    items: draft.items.map(draftItemToItem),
    overlayTracks: draft.overlayTracks?.map(draftTrackToTrack),
    exportPresetId: draft.exportPresetId,
    markers: draft.markers,
    captionsEnabled: draft.captionsEnabled,
    captionWords: draft.captionWords,
    captionStyle: fromOpaque<CaptionStyle>(draft.captionStyle),
  }) satisfies TimelineDocument;
}

// The starting cut for an asset with no saved draft: the video alone on the base
// track, untrimmed. No row is written until the first edit — opening the editor
// and closing it again must not litter the table.
export function seedTimelineDocumentFromAsset(asset: MediaAsset): {
  document: TimelineDocument;
  pool: LibraryPoolSource[];
} {
  const source: LibraryPoolSource = compact({
    nodeId: asset.id,
    kind: poolKind(asset.kind),
    label: asset.title ?? asset.fileName,
    previewUrl: asset.signedUrl ?? undefined,
    durationSec: asset.durationMs != null ? asset.durationMs / 1000 : undefined,
  });
  const item: TimelineItem = {
    id: uuidv4(),
    order: 0,
    sourceNodeId: asset.id,
    kind: source.kind,
  };
  return { document: { items: [item] }, pool: [source] };
}
