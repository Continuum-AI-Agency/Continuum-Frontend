import {
  type EditorAudioClip,
  type EditorEffectInstance,
  type EditorExportSettings,
  type EditorKeyframe,
  type EditorMediaSourceRef,
  type EditorOverlayClip,
  type EditorProjectV2,
  type EditorTextClip,
  type EditorTextStyle,
  type EditorTrack,
  type EditorTransform,
  type EditorTransition,
  type EditorVideoClip,
  editorProjectV2Schema,
  timelineAuthoringDocumentSchema,
  timelineDocumentFingerprint,
} from '@continuum/contracts';
import { type CaptionStyleOverride, resolveCaptionStyle } from '@/lib/clips/clipCaptionStyle';
import type { TimelineInputSource, TimelineItem } from '@/StudioCanvas/types';
import type { ClipEffectSpec } from '@/StudioCanvas/utils/render/effectSpec';
import { speedFor } from '@/StudioCanvas/utils/render/effectSpec';
import { resolveExportPreset } from '@/StudioCanvas/utils/render/exportPresets';
import type { ClipTransition } from '@/StudioCanvas/utils/render/transitions';
import { captionCueText, groupWordsIntoCues } from '@/StudioCanvas/utils/splice/captionCues';
import type { TimelineDocument } from './adapter';
import { computeLayout, effectiveItemDuration } from './useTimelineEditorModel';

const DEFAULT_TIMESTAMP = '1970-01-01T00:00:00.000Z';
const DEFAULT_WIDTH = 1080;
const DEFAULT_HEIGHT = 1920;
const DEFAULT_FRAME_RATE = { numerator: 30, denominator: 1 } as const;
const DEFAULT_SAMPLE_RATE_HZ = 48_000;

export interface EditorProjectV2ProjectionInput {
  document: TimelineDocument;
  pool: readonly TimelineInputSource[];
  sourceScope: 'canvas' | 'library';
  projectId: string;
  sequenceId?: string;
  title?: string;
  /**
   * A host with a durable monotonic revision should provide it. When omitted,
   * the projection uses a deterministic content-addressed revision. That fallback
   * is suitable for stale-read equality, not revision ordering.
   */
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
  sourceDimensions?: { width: number; height: number };
  frameRate?: { numerator: number; denominator: number };
  sampleRateHz?: number;
}

export interface EditorProjectV2Projection {
  project: EditorProjectV2;
  warnings: string[];
}

type LegacyTransform = NonNullable<ClipEffectSpec['transform']>;

function sourceRefFor(
  sourceNodeId: string,
  poolById: ReadonlyMap<string, TimelineInputSource>,
  sourceScope: EditorProjectV2ProjectionInput['sourceScope'],
): EditorMediaSourceRef {
  const source = poolById.get(sourceNodeId);
  if (sourceScope === 'library') {
    return {
      sourceType: 'library_asset',
      assetId: source?.sourceAssetId ?? source?.nodeId ?? sourceNodeId,
    };
  }
  return {
    sourceType: 'canvas_node',
    nodeId: source?.nodeId ?? sourceNodeId,
    ...(source?.sourceAssetId ? { assetId: source.sourceAssetId } : {}),
  };
}

function transformFor(
  effects: ClipEffectSpec | undefined,
  override?: LegacyTransform,
): EditorTransform {
  const transform = override ?? effects?.transform;
  const scale = transform?.scale ?? 1;
  return {
    position: {
      x: 0.5 + (transform?.offsetX ?? 0),
      y: 0.5 + (transform?.offsetY ?? 0),
      unit: 'normalized',
    },
    scaleX: scale * (effects?.flipH ? -1 : 1),
    scaleY: scale * (effects?.flipV ? -1 : 1),
    rotationDeg: transform?.rotate ?? 0,
    anchorX: 0.5,
    anchorY: 0.5,
    opacity: effects?.opacity ?? 1,
  };
}

function transformKeyframes(
  itemId: string,
  timelineStartSec: number,
  durationSec: number,
  effects: ClipEffectSpec | undefined,
): EditorKeyframe[] {
  const stops =
    effects?.keyframes && effects.keyframes.length > 0
      ? effects.keyframes
      : effects?.kenBurns
        ? [
            { t: 0, transform: effects.kenBurns.from },
            { t: 1, transform: effects.kenBurns.to },
          ]
        : [];
  const keyframes: EditorKeyframe[] = [];
  for (const [stopIndex, stop] of stops.entries()) {
    const at = timelineStartSec + Math.max(0, Math.min(1, stop.t)) * durationSec;
    const transformed = transformFor(effects, stop.transform);
    const prefix = `${itemId}:keyframe:${stopIndex}`;
    keyframes.push(
      {
        id: `${prefix}:position`,
        property: 'transform.position',
        timeSec: at,
        value: { x: transformed.position.x, y: transformed.position.y },
        interpolation: 'linear',
      },
      {
        id: `${prefix}:scale-x`,
        property: 'transform.scaleX',
        timeSec: at,
        value: transformed.scaleX,
        interpolation: 'linear',
      },
      {
        id: `${prefix}:scale-y`,
        property: 'transform.scaleY',
        timeSec: at,
        value: transformed.scaleY,
        interpolation: 'linear',
      },
      {
        id: `${prefix}:rotation`,
        property: 'transform.rotationDeg',
        timeSec: at,
        value: transformed.rotationDeg,
        interpolation: 'linear',
      },
    );
  }
  return keyframes;
}

function effectsFor(itemId: string, effects: ClipEffectSpec | undefined): EditorEffectInstance[] {
  if (!effects?.adjustments && !effects?.filterPreset) return [];
  const parameters: Record<string, string | number | boolean | number[] | string[]> = {};
  if (effects.filterPreset) parameters.filterPreset = effects.filterPreset;
  for (const [key, value] of Object.entries(effects.adjustments ?? {})) {
    if (typeof value === 'number') parameters[key] = value;
  }
  return [
    {
      id: `${itemId}:effect:look`,
      effectType: 'color_adjustment',
      effectId:
        effects.filterPreset && effects.filterPreset !== 'none' ? effects.filterPreset : 'manual',
      enabled: true,
      mix: 1,
      parameters,
    },
  ];
}

function clipSourceDuration(
  item: TimelineItem,
  poolById: ReadonlyMap<string, TimelineInputSource>,
): number | undefined {
  return poolById.get(item.sourceNodeId)?.durationSec;
}

function videoClipFor(input: {
  item: TimelineItem;
  timelineStartSec: number;
  durationSec: number;
  source: EditorMediaSourceRef;
}): EditorVideoClip {
  const { durationSec, item, source, timelineStartSec } = input;
  return {
    id: item.id,
    name: item.id,
    timelineStartSec,
    durationSec,
    enabled: true,
    locked: false,
    tags: [],
    kind: 'video',
    source,
    sourceInSec: item.trimStartSec ?? 0,
    playbackRate: speedFor(item.effects),
    reverse: false,
    transform: transformFor(item.effects),
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    blendMode: item.effects?.blendMode ?? 'normal',
    // Embedded audio is projected onto the typed audio track so gain/fades remain editable.
    audioEnabled: false,
    effects: effectsFor(item.id, item.effects),
    keyframes: transformKeyframes(item.id, timelineStartSec, durationSec, item.effects),
  };
}

function audioClipFor(input: {
  item: TimelineItem;
  timelineStartSec: number;
  durationSec: number;
  source: EditorMediaSourceRef;
}): EditorAudioClip {
  const { durationSec, item, source, timelineStartSec } = input;
  return {
    id: `audio:${item.id}`,
    name: `${item.id} audio`,
    timelineStartSec,
    durationSec,
    enabled: true,
    locked: false,
    tags: [],
    kind: 'audio',
    source,
    sourceInSec: item.trimStartSec ?? 0,
    playbackRate: speedFor(item.effects),
    reverse: false,
    volume: item.volume ?? 1,
    pan: 0,
    muted: item.muteAudio ?? false,
    fadeInSec: Math.min(durationSec, item.audioFadeInSec ?? 0),
    fadeOutSec: Math.min(durationSec, item.audioFadeOutSec ?? 0),
    effects: [],
    keyframes: [],
  };
}

function overlayClipFor(input: {
  id: string;
  item: TimelineItem;
  timelineStartSec: number;
  durationSec: number;
  source: EditorMediaSourceRef;
}): EditorOverlayClip {
  const { durationSec, id, item, source, timelineStartSec } = input;
  return {
    id,
    name: item.id,
    timelineStartSec,
    durationSec,
    enabled: true,
    locked: false,
    tags: [],
    kind: 'overlay',
    source,
    mediaKind: item.kind === 'image' ? 'image' : 'video',
    ...(item.kind === 'video' ? { sourceInSec: item.trimStartSec ?? 0 } : {}),
    transform: transformFor(item.effects),
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    blendMode: item.effects?.blendMode ?? 'normal',
    effects: effectsFor(id, item.effects),
    keyframes: transformKeyframes(id, timelineStartSec, durationSec, item.effects),
  };
}

function textClipsFor(
  parentId: string,
  timelineStartSec: number,
  durationSec: number,
  effects: ClipEffectSpec | undefined,
  canvasHeight: number,
): EditorTextClip[] {
  return (effects?.text ?? []).map((text) => ({
    id: `text:${parentId}:${text.id}`,
    name: text.id,
    timelineStartSec,
    durationSec,
    enabled: true,
    locked: false,
    tags: [],
    kind: 'text',
    text: text.text,
    style: {
      fontFamily: 'Arial',
      fontSizePx: Math.max(1, (text.sizeFrac ?? 0.05) * canvasHeight),
      fontWeight: text.fontWeight ?? 700,
      italic: false,
      underline: false,
      alignment: 'center',
      color: text.color ?? '#ffffff',
      ...(text.background ? { backgroundColor: text.background } : {}),
      outlineWidthPx: 0,
      shadowBlurPx: 0,
      lineHeight: 1.2,
      trackingEm: 0,
    },
    transform: {
      position: {
        x: text.xFrac ?? 0.5,
        y: text.yFrac ?? 0.5,
        unit: 'normalized',
      },
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      anchorX: 0.5,
      anchorY: 0.5,
      opacity: 1,
    },
    effects: [],
    keyframes: [],
  }));
}

function textStyleForCaption(
  document: TimelineDocument,
  override: CaptionStyleOverride | undefined,
  canvasHeight: number,
): EditorTextStyle {
  const resolved = resolveCaptionStyle(document.captionStyle, override);
  const fontSizePx = Math.max(1, (resolved.fontSizeFrac ?? 0.055) * canvasHeight);
  return {
    fontFamily: resolved.fontFamily ?? 'Arial',
    fontSizePx,
    fontWeight: 700,
    italic: false,
    underline: false,
    alignment: 'center',
    color: resolved.textColor,
    ...(resolved.backgroundColor ? { backgroundColor: resolved.backgroundColor } : {}),
    outlineColor: resolved.outlineColor,
    outlineWidthPx: Math.max(0, (resolved.outlineWidthFrac ?? 0.18) * fontSizePx),
    shadowBlurPx: 0,
    lineHeight: 1.2,
    trackingEm: 0,
  };
}

function transitionKind(
  transition: ClipTransition,
): Pick<EditorTransition, 'transitionType' | 'transitionId' | 'parameters'> {
  switch (transition.type) {
    case 'cut':
      return { transitionType: 'cut', parameters: {} };
    case 'crossDissolve':
      return { transitionType: 'crossfade', parameters: {} };
    case 'fade':
      return { transitionType: 'dip_to_black', parameters: {} };
    case 'dipWhite':
      return { transitionType: 'dip_to_white', parameters: {} };
    case 'slideLeft':
    case 'slideRight':
    case 'slideUp':
    case 'slideDown':
      return {
        transitionType: 'slide',
        transitionId: transition.type,
        parameters: { direction: transition.type.replace('slide', '').toLowerCase() },
      };
    case 'wipeLeft':
    case 'wipeRight':
      return {
        transitionType: 'wipe',
        transitionId: transition.type,
        parameters: { direction: transition.type.replace('wipe', '').toLowerCase() },
      };
    case 'zoomIn':
      return { transitionType: 'zoom', transitionId: transition.type, parameters: {} };
    case 'spin':
      return { transitionType: 'custom', transitionId: transition.type, parameters: {} };
  }
}

function exportSettingsFor(
  document: TimelineDocument,
  input: EditorProjectV2ProjectionInput,
): EditorExportSettings {
  const preset = resolveExportPreset(document.exportPresetId);
  const width = preset.width ?? input.sourceDimensions?.width ?? DEFAULT_WIDTH;
  const height = preset.height ?? input.sourceDimensions?.height ?? DEFAULT_HEIGHT;
  return {
    presetId: preset.id,
    width,
    height,
    frameRate: input.frameRate ?? DEFAULT_FRAME_RATE,
    format: 'mp4',
    videoCodec: 'h264',
    videoBitrateKbps: Math.round(preset.videoBitrate / 1_000),
    audioCodec: 'aac',
    audioBitrateKbps: 192,
    sampleRateHz: input.sampleRateHz ?? DEFAULT_SAMPLE_RATE_HZ,
    colorSpace: 'rec709',
    alpha: false,
    captionMode: document.captionsEnabled ? 'burn_in' : 'none',
    quality: 'high',
  };
}

function revisionFromFingerprint(fingerprint: string): number {
  return Number.parseInt(fingerprint.slice(0, 8), 16);
}

/**
 * Projects the current editor document into V2 without persisting V2 state.
 *
 * TimelineDocument remains the only canonical mutable document. Callers should
 * invoke this at an API/render/analysis boundary and discard the result afterward.
 */
export function projectTimelineDocumentToEditorProjectV2(
  input: EditorProjectV2ProjectionInput,
): EditorProjectV2Projection {
  const { document } = input;
  const warnings: string[] = [];
  const sequenceId = input.sequenceId ?? `${input.projectId}:main`;
  const poolById = new Map(input.pool.map((source) => [source.nodeId, source]));
  const authoringDocument = timelineAuthoringDocumentSchema.parse(document);
  const fingerprint = timelineDocumentFingerprint(authoringDocument);
  const exportSettings = exportSettingsFor(document, input);
  const sourceDurationFor = (item: TimelineItem) => clipSourceDuration(item, poolById);
  const baseLayout = computeLayout(
    document.items,
    (item) => effectiveItemDuration(item, sourceDurationFor(item)),
    1,
  );

  const videoClips: EditorVideoClip[] = [];
  const audioClips: EditorAudioClip[] = [];
  const baseImageClips: EditorOverlayClip[] = [];
  const textClips: EditorTextClip[] = [];
  const visualClipIdByLegacyId = new Map<string, string>();

  for (const placement of baseLayout.clips) {
    const source = sourceRefFor(placement.item.sourceNodeId, poolById, input.sourceScope);
    if (!poolById.has(placement.item.sourceNodeId)) {
      warnings.push(
        `Timeline source "${placement.item.sourceNodeId}" is absent from the media pool.`,
      );
    }
    if (placement.item.kind === 'image') {
      const id = `image:${placement.item.id}`;
      visualClipIdByLegacyId.set(placement.item.id, id);
      baseImageClips.push(
        overlayClipFor({
          id,
          item: placement.item,
          timelineStartSec: placement.startSec,
          durationSec: placement.durationSec,
          source,
        }),
      );
    } else {
      visualClipIdByLegacyId.set(placement.item.id, placement.item.id);
      videoClips.push(
        videoClipFor({
          item: placement.item,
          timelineStartSec: placement.startSec,
          durationSec: placement.durationSec,
          source,
        }),
      );
      audioClips.push(
        audioClipFor({
          item: placement.item,
          timelineStartSec: placement.startSec,
          durationSec: placement.durationSec,
          source,
        }),
      );
    }
    textClips.push(
      ...textClipsFor(
        placement.item.id,
        placement.startSec,
        placement.durationSec,
        placement.item.effects,
        exportSettings.height,
      ),
    );
  }

  const tracks: EditorTrack[] = [
    {
      id: `${sequenceId}:video`,
      name: 'Primary video',
      order: 0,
      enabled: true,
      locked: false,
      muted: false,
      solo: false,
      kind: 'video',
      clips: videoClips,
    },
    {
      id: `${sequenceId}:audio`,
      name: 'Embedded audio',
      order: 1,
      enabled: true,
      locked: false,
      muted: false,
      solo: false,
      kind: 'audio',
      clips: audioClips,
    },
  ];

  if (baseImageClips.length > 0) {
    tracks.push({
      id: `${sequenceId}:base-stills`,
      name: 'Primary stills',
      order: tracks.length,
      enabled: true,
      locked: false,
      muted: false,
      solo: false,
      kind: 'overlay',
      clips: baseImageClips,
    });
  }

  let furthestAudioSec = 0;
  for (const track of document.audioTracks ?? []) {
    const clips = track.items.map((item) => {
      const startSec = Math.max(0, item.startSec ?? 0);
      const durationSec = effectiveItemDuration(item, sourceDurationFor(item));
      furthestAudioSec = Math.max(furthestAudioSec, startSec + durationSec);
      if (!poolById.has(item.sourceNodeId)) {
        warnings.push(`Timeline source "${item.sourceNodeId}" is absent from the media pool.`);
      }
      return audioClipFor({
        item,
        timelineStartSec: startSec,
        durationSec,
        source: sourceRefFor(item.sourceNodeId, poolById, input.sourceScope),
      });
    });
    tracks.push({
      id: `${sequenceId}:audio:${track.id}`,
      name: track.id,
      order: tracks.length,
      enabled: true,
      locked: false,
      muted: false,
      solo: false,
      kind: 'audio',
      clips,
    });
  }

  let furthestOverlaySec = 0;
  for (const track of document.overlayTracks ?? []) {
    const clips = track.items.map((item) => {
      const startSec = item.startSec ?? 0;
      const durationSec = effectiveItemDuration(item, sourceDurationFor(item));
      furthestOverlaySec = Math.max(furthestOverlaySec, startSec + durationSec);
      const id = `overlay:${track.id}:${item.id}`;
      if (!poolById.has(item.sourceNodeId)) {
        warnings.push(`Timeline source "${item.sourceNodeId}" is absent from the media pool.`);
      }
      textClips.push(
        ...textClipsFor(item.id, startSec, durationSec, item.effects, exportSettings.height),
      );
      return overlayClipFor({
        id,
        item,
        timelineStartSec: startSec,
        durationSec,
        source: sourceRefFor(item.sourceNodeId, poolById, input.sourceScope),
      });
    });
    tracks.push({
      id: `${sequenceId}:overlay:${track.id}`,
      name: track.id,
      order: tracks.length,
      enabled: true,
      locked: false,
      muted: false,
      solo: false,
      kind: 'overlay',
      clips,
    });
  }

  if (textClips.length > 0) {
    tracks.push({
      id: `${sequenceId}:text`,
      name: 'Text overlays',
      order: tracks.length,
      enabled: true,
      locked: false,
      muted: false,
      solo: false,
      kind: 'text',
      clips: textClips,
    });
  }

  const cues =
    document.captionCues ??
    (document.captionWords?.length ? groupWordsIntoCues(document.captionWords) : []);
  let furthestCaptionSec = 0;
  const captionClips = cues.map((cue) => {
    const durationSec = Math.max(0.01, cue.endSec - cue.startSec);
    furthestCaptionSec = Math.max(furthestCaptionSec, cue.startSec + durationSec);
    const resolvedStyle = resolveCaptionStyle(document.captionStyle, cue.style);
    return {
      id: `caption:${cue.id}`,
      name: cue.id,
      timelineStartSec: cue.startSec,
      durationSec,
      enabled: true,
      locked: false,
      tags: [],
      kind: 'caption' as const,
      text: captionCueText(cue),
      language: 'und',
      words: cue.words,
      style: textStyleForCaption(document, cue.style, exportSettings.height),
      transform: {
        position: {
          x: resolvedStyle.position?.xFrac ?? 0.5,
          y: resolvedStyle.position?.yFrac ?? 0.88,
          unit: 'normalized' as const,
        },
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 0,
        anchorX: 0.5,
        anchorY: 0.5,
        opacity: 1,
      },
      highlightMode: 'word' as const,
    };
  });
  if (captionClips.length > 0) {
    tracks.push({
      id: `${sequenceId}:captions`,
      name: 'Captions',
      order: tracks.length,
      enabled: document.captionsEnabled ?? false,
      locked: false,
      muted: false,
      solo: false,
      kind: 'caption',
      clips: captionClips,
    });
  }

  const transitions: EditorTransition[] = [];
  const orderedBase = [...document.items].sort((left, right) => left.order - right.order);
  for (let index = 1; index < orderedBase.length; index += 1) {
    const incoming = orderedBase[index];
    const outgoing = orderedBase[index - 1];
    if (!incoming.transition) continue;
    const fromClipId = visualClipIdByLegacyId.get(outgoing.id);
    const toClipId = visualClipIdByLegacyId.get(incoming.id);
    if (!fromClipId || !toClipId) continue;
    transitions.push({
      id: `${sequenceId}:transition:${incoming.id}`,
      trackId: `${sequenceId}:video`,
      fromClipId,
      toClipId,
      ...transitionKind(incoming.transition),
      durationSec: Math.max(0.01, incoming.transition.durationSec),
      alignment: 'centered',
    });
  }
  if (orderedBase[0]?.transition && orderedBase[0].transition.type !== 'cut') {
    warnings.push('The current first-clip fade has no two-clip V2 transition equivalent.');
  }

  const markerMax = Math.max(0, ...(document.markers ?? []));
  const durationSec = Math.max(
    baseLayout.totalSec,
    furthestOverlaySec,
    furthestAudioSec,
    furthestCaptionSec,
    markerMax,
  );
  const timestamp = input.updatedAt ?? input.createdAt ?? DEFAULT_TIMESTAMP;
  const project = editorProjectV2Schema.parse({
    schemaVersion: 2,
    projectId: input.projectId,
    sequenceId,
    revision: input.revision ?? revisionFromFingerprint(fingerprint),
    fingerprint,
    title: input.title ?? 'Video Editor project',
    durationSec,
    canvas: {
      width: exportSettings.width,
      height: exportSettings.height,
      pixelAspectRatio: 1,
      backgroundColor: '#000000',
    },
    frameRate: exportSettings.frameRate,
    sampleRateHz: exportSettings.sampleRateHz,
    tracks,
    transitions,
    markers: (document.markers ?? []).map((timeSec, index) => ({
      id: `${sequenceId}:marker:${index}:${Math.round(timeSec * 1_000)}`,
      timeSec,
      label: `Marker ${index + 1}`,
    })),
    exportSettings,
    legacyTimelineFingerprint: fingerprint,
    createdAt: input.createdAt ?? DEFAULT_TIMESTAMP,
    updatedAt: timestamp,
  });

  return { project, warnings: [...new Set(warnings)] };
}
