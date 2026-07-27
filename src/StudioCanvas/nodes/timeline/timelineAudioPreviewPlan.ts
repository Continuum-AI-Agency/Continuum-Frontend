import type { TimelineInputSource, TimelineItem, TimelineTrack } from '../../types';
import { speedFor } from '../../utils/render/effectSpec';
import { headFadeFor, tailFadeFor } from '../../utils/render/transitions';
import type {
  TimelineAudioRenderItem,
  TimelineOverlayRenderItem,
  TimelineRenderItem,
} from '../../utils/splice/composeTimeline';
import { resolveTimelineAudioEnvelope } from '../../utils/splice/timelineAudioEnvelope';
import type { TimelineDocument } from './adapter';
import { audioItemDuration } from './audioTrackModel';
import type { TimelineLayout } from './useTimelineEditorModel';

const MIN_AUDIO_SEC = 0.005;

export type TimelinePreviewAudioKind = 'base' | 'overlay' | 'audio';

export interface TimelinePreviewAudioEvent {
  id: string;
  sourceKey: string;
  sourceNodeId: string;
  kind: TimelinePreviewAudioKind;
  blob: Blob;
  outputStartSec: number;
  outputEndSec: number;
  sourceStartSec: number;
  sourceEndSec: number;
  playbackRate: number;
  gain: number;
  fadeInSec: number;
  fadeOutSec: number;
}

export interface TimelinePreviewAudioPlan {
  events: TimelinePreviewAudioEvent[];
  totalDurationSec: number;
}

export interface TimelinePreviewResolvedMedia {
  base: TimelineRenderItem[];
  overlays: TimelineOverlayRenderItem[];
  audio: TimelineAudioRenderItem[];
}

function sourceKeyFor(
  item: TimelineItem,
  poolById: ReadonlyMap<string, TimelineInputSource>,
  blob: Blob,
): string {
  const source = poolById.get(item.sourceNodeId);
  const revision = source?.sourceAssetId ?? source?.previewUrl ?? `${blob.type}:${blob.size}`;
  return `${item.sourceNodeId}:${revision}`;
}

function positiveRange(startSec: number, endSec: number): boolean {
  return Number.isFinite(startSec) && Number.isFinite(endSec) && endSec - startSec >= MIN_AUDIO_SEC;
}

function findTrackItem(
  tracks: TimelineTrack[] | undefined,
  itemId: string,
): TimelineItem | undefined {
  return tracks?.flatMap((track) => track.items).find((item) => item.id === itemId);
}

export function buildTimelinePreviewAudioPlan(input: {
  document: TimelineDocument;
  layout: TimelineLayout;
  pool: TimelineInputSource[];
  sourceDurations: ReadonlyMap<string, number>;
  resolved: TimelinePreviewResolvedMedia;
}): TimelinePreviewAudioPlan {
  const poolById = new Map(input.pool.map((source) => [source.nodeId, source]));
  const baseById = new Map(input.resolved.base.map((item) => [item.itemId, item]));
  const overlayById = new Map(input.resolved.overlays.map((item) => [item.itemId, item]));
  const audioById = new Map(input.resolved.audio.map((item) => [item.itemId, item]));
  const events: TimelinePreviewAudioEvent[] = [];

  for (let index = 0; index < input.layout.clips.length; index += 1) {
    const clip = input.layout.clips[index];
    const item = clip.item;
    const media = baseById.get(item.id);
    if (!media || media.kind !== 'video' || item.muteAudio) continue;

    const playbackRate = speedFor(item.effects);
    const sourceStartSec = Math.max(0, item.trimStartSec ?? media.trimStartSec ?? 0);
    const sourceEndSec = Math.max(
      sourceStartSec,
      item.trimEndSec ?? media.trimEndSec ?? sourceStartSec + clip.durationSec * playbackRate,
    );
    if (!positiveRange(sourceStartSec, sourceEndSec)) continue;

    const previous = input.layout.clips[index - 1];
    const next = input.layout.clips[index + 1];
    const inOverlapSec = previous
      ? Math.max(0, previous.startSec + previous.durationSec - clip.startSec)
      : 0;
    const outOverlapSec = next ? Math.max(0, clip.startSec + clip.durationSec - next.startSec) : 0;
    const envelope = resolveTimelineAudioEnvelope({
      gain: item.volume,
      manualFadeInSec: item.audioFadeInSec,
      manualFadeOutSec: item.audioFadeOutSec,
      transitionFadeInSec: Math.max(
        inOverlapSec,
        headFadeFor(item.transition, index === 0)?.durationSec ?? 0,
      ),
      transitionFadeOutSec: Math.max(
        outOverlapSec,
        tailFadeFor(next?.item.transition)?.durationSec ?? 0,
      ),
    });

    events.push({
      id: item.id,
      sourceKey: sourceKeyFor(item, poolById, media.blob),
      sourceNodeId: item.sourceNodeId,
      kind: 'base',
      blob: media.blob,
      outputStartSec: clip.startSec,
      outputEndSec: clip.startSec + clip.durationSec,
      sourceStartSec,
      sourceEndSec,
      playbackRate,
      ...envelope,
    });
  }

  for (const media of input.resolved.overlays) {
    const item = findTrackItem(input.document.overlayTracks, media.itemId);
    if (!item || media.kind !== 'video' || item.muteAudio) continue;
    const sourceStartSec = Math.max(0, item.trimStartSec ?? media.trimStartSec ?? 0);
    const sourceDuration = input.sourceDurations.get(item.sourceNodeId);
    const outputStartSec = Math.max(0, item.startSec ?? media.startSec);
    const fallbackDuration = Math.max(MIN_AUDIO_SEC, input.layout.totalSec - outputStartSec);
    const sourceEndSec = Math.max(
      sourceStartSec,
      item.trimEndSec ?? media.trimEndSec ?? sourceDuration ?? sourceStartSec + fallbackDuration,
    );
    if (!positiveRange(sourceStartSec, sourceEndSec)) continue;
    const envelope = resolveTimelineAudioEnvelope({
      gain: item.volume,
      manualFadeInSec: item.audioFadeInSec,
      manualFadeOutSec: item.audioFadeOutSec,
    });
    events.push({
      id: item.id,
      sourceKey: sourceKeyFor(item, poolById, media.blob),
      sourceNodeId: item.sourceNodeId,
      kind: 'overlay',
      blob: media.blob,
      outputStartSec,
      outputEndSec: outputStartSec + (sourceEndSec - sourceStartSec),
      sourceStartSec,
      sourceEndSec,
      playbackRate: 1,
      ...envelope,
    });
  }

  for (const media of input.resolved.audio) {
    const item = findTrackItem(input.document.audioTracks, media.itemId);
    if (!item) continue;
    const sourceStartSec = Math.max(0, item.trimStartSec ?? media.trimStartSec ?? 0);
    const sourceDuration = input.sourceDurations.get(item.sourceNodeId);
    const outputStartSec = Math.max(0, item.startSec ?? media.startSec);
    const durationSec =
      sourceDuration !== undefined ||
      item.trimEndSec !== undefined ||
      media.trimEndSec !== undefined
        ? audioItemDuration(item, sourceDuration)
        : Math.max(MIN_AUDIO_SEC, input.layout.totalSec - outputStartSec);
    const sourceEndSec = Math.max(
      sourceStartSec,
      item.trimEndSec ?? media.trimEndSec ?? sourceStartSec + durationSec,
    );
    if (!positiveRange(sourceStartSec, sourceEndSec)) continue;
    const envelope = resolveTimelineAudioEnvelope({
      gain: item.volume ?? media.volume,
      manualFadeInSec: item.audioFadeInSec ?? media.fadeInSec,
      manualFadeOutSec: item.audioFadeOutSec ?? media.fadeOutSec,
    });
    events.push({
      id: item.id,
      sourceKey: sourceKeyFor(item, poolById, media.blob),
      sourceNodeId: item.sourceNodeId,
      kind: 'audio',
      blob: media.blob,
      outputStartSec,
      outputEndSec: outputStartSec + durationSec,
      sourceStartSec,
      sourceEndSec,
      playbackRate: 1,
      ...envelope,
    });
  }

  return {
    events: events.sort(
      (left, right) =>
        left.outputStartSec - right.outputStartSec || left.id.localeCompare(right.id),
    ),
    totalDurationSec: input.layout.totalSec,
  };
}
