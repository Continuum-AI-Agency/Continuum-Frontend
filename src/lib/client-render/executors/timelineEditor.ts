import {
  CANVAS_MEDIA_SIGN_MAX_ITEMS,
  CANVAS_MEDIA_SIGN_ROUTE,
  type CanvasMediaSignResponse,
  type EditorProjectV2,
  type EditorTransition,
} from '@continuum/contracts';
import { request } from '@/lib/api/http';
import {
  type CaptionStyle,
  type CaptionStyleOverride,
  DEFAULT_CAPTION_STYLE,
} from '@/lib/clips/clipCaptionStyle';
import { persistTimelineRender } from '@/StudioCanvas/utils/persistTimelineRender';
import type { ClipEffectSpec } from '@/StudioCanvas/utils/render/effectSpec';
import type { ClipTransition } from '@/StudioCanvas/utils/render/transitions';
import { overlapInSecFor } from '@/StudioCanvas/utils/render/transitions';
import { type CaptionCue, wordsForCaptionText } from '@/StudioCanvas/utils/splice/captionCues';
import { runTimelineInWorker } from '@/StudioCanvas/workers/spliceWorkerClient';
import type {
  TimelineAudioWorkerItem,
  TimelineOverlayWorkerItem,
  TimelineWorkerItem,
} from '@/StudioCanvas/workers/spliceWorkerProtocol';
import type { ClientRenderExecutor } from '../executorRegistry';

type RenderPlan = {
  items: TimelineWorkerItem[];
  overlays: TimelineOverlayWorkerItem[];
  audioTracks: TimelineAudioWorkerItem[];
  captionCues: CaptionCue[];
  captionStyle: CaptionStyle;
};
type ProjectTrack = EditorProjectV2['tracks'][number];
const isVideoTrack = (track: ProjectTrack): track is Extract<ProjectTrack, { kind: 'video' }> =>
  track.kind === 'video';
const isOverlayTrack = (track: ProjectTrack): track is Extract<ProjectTrack, { kind: 'overlay' }> =>
  track.kind === 'overlay';
const isAudioTrack = (track: ProjectTrack): track is Extract<ProjectTrack, { kind: 'audio' }> =>
  track.kind === 'audio';
const isCaptionTrack = (track: ProjectTrack): track is Extract<ProjectTrack, { kind: 'caption' }> =>
  track.kind === 'caption';
const isTextTrack = (track: ProjectTrack): track is Extract<ProjectTrack, { kind: 'text' }> =>
  track.kind === 'text';

const signKey = (bucket: string, path: string): string => `${bucket}\n${path}`;

const numberParameter = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const stringParameter = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const transformKeyframesFor = (clip: {
  durationSec: number;
  transform?: {
    position: { x: number; y: number };
    scaleX: number;
    scaleY: number;
    rotationDeg: number;
  };
  keyframes?: Array<{
    property: string;
    timeSec: number;
    value: unknown;
  }>;
}): NonNullable<ClipEffectSpec['keyframes']> | undefined => {
  const grouped = new Map<number, NonNullable<ClipEffectSpec['keyframes']>[number]['transform']>();
  for (const keyframe of clip.keyframes ?? []) {
    if (!keyframe.property.startsWith('transform.')) continue;
    // V2 keyframe times are local to their clip (split commands shift the right
    // clip's stops back to zero), while the worker consumes normalized clip time.
    const at = Math.max(0, Math.min(1, keyframe.timeSec / clip.durationSec));
    const current = grouped.get(at) ?? {
      scale: clip.transform
        ? Math.max(Math.abs(clip.transform.scaleX), Math.abs(clip.transform.scaleY))
        : 1,
      offsetX: clip.transform ? clip.transform.position.x - 0.5 : 0,
      offsetY: clip.transform ? clip.transform.position.y - 0.5 : 0,
      rotate: clip.transform?.rotationDeg ?? 0,
    };
    if (
      keyframe.property === 'transform.position' &&
      typeof keyframe.value === 'object' &&
      keyframe.value !== null &&
      'x' in keyframe.value &&
      'y' in keyframe.value &&
      typeof keyframe.value.x === 'number' &&
      typeof keyframe.value.y === 'number'
    ) {
      current.offsetX = keyframe.value.x - 0.5;
      current.offsetY = keyframe.value.y - 0.5;
    }
    if (
      (keyframe.property === 'transform.scaleX' || keyframe.property === 'transform.scaleY') &&
      typeof keyframe.value === 'number'
    ) {
      current.scale = Math.abs(keyframe.value);
    }
    if (keyframe.property === 'transform.rotationDeg' && typeof keyframe.value === 'number') {
      current.rotate = keyframe.value;
    }
    grouped.set(at, current);
  }
  const keyframes = [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([t, transform]) => ({ t, transform }));
  return keyframes.length >= 2 ? keyframes : undefined;
};

/**
 * A V2 clip's effect instances back into the render spec `composeTimeline` consumes.
 *
 * Exported because it is the seam where a declared effect becomes a rendered one, and
 * a bench that re-implemented it would be proving a copy works. Paired with
 * `effectsFor` in `nodes/timeline/editorProjectV2Projection.ts` — that writes these
 * instances, this reads them; changing one without the other reopens the gap where
 * `chroma_key` sat in the schema for a whole release and never moved a pixel.
 */
export const clipEffectSpecFromEditorClip = (clip: {
  timelineStartSec: number;
  durationSec: number;
  playbackRate?: number;
  transform?: {
    position: { x: number; y: number };
    scaleX: number;
    scaleY: number;
    rotationDeg: number;
    opacity: number;
  };
  blendMode?: ClipEffectSpec['blendMode'];
  effects?: Array<{
    enabled: boolean;
    effectType: string;
    effectId: string;
    parameters: Record<string, unknown>;
  }>;
  keyframes?: Array<{ property: string; timeSec: number; value: unknown }>;
}): ClipEffectSpec => ({
  ...(clip.playbackRate && clip.playbackRate !== 1 ? { speed: clip.playbackRate } : {}),
  ...(clip.transform
    ? {
        opacity: clip.transform.opacity,
        transform: {
          scale: Math.max(Math.abs(clip.transform.scaleX), Math.abs(clip.transform.scaleY)),
          offsetX: clip.transform.position.x - 0.5,
          offsetY: clip.transform.position.y - 0.5,
          rotate: clip.transform.rotationDeg,
        },
        flipH: clip.transform.scaleX < 0,
        flipV: clip.transform.scaleY < 0,
      }
    : {}),
  ...(clip.blendMode ? { blendMode: clip.blendMode } : {}),
  ...(() => {
    const effect = clip.effects?.find(
      (candidate) =>
        candidate.enabled &&
        (candidate.effectType === 'color_adjustment' ||
          candidate.effectType === 'video_filter' ||
          candidate.effectType === 'blur'),
    );
    if (!effect) return {};
    const parameters = effect.parameters;
    const filterPreset = stringParameter(parameters.filterPreset ?? effect.effectId);
    const adjustments = {
      brightness: numberParameter(parameters.brightness),
      contrast: numberParameter(parameters.contrast),
      saturation: numberParameter(parameters.saturation),
      grayscale: numberParameter(parameters.grayscale),
      sepia: numberParameter(parameters.sepia),
      hueRotate: numberParameter(parameters.hueRotate),
      blur: numberParameter(parameters.blur),
      invert: numberParameter(parameters.invert),
    };
    return {
      ...(filterPreset &&
      ['none', 'bw', 'vintage', 'vivid', 'cool', 'warm', 'noir', 'dream'].includes(filterPreset)
        ? { filterPreset: filterPreset as NonNullable<ClipEffectSpec['filterPreset']> }
        : {}),
      ...(Object.values(adjustments).some((value) => value !== undefined) ? { adjustments } : {}),
    };
  })(),
  ...(() => {
    // `background_removal` is treated as a green-screen key, because that is what this
    // pipeline can actually do — no segmentation model ships in the browser renderer.
    // Defaults are `chromaKeyConfig`'s own, so an instance stored with no parameters
    // keys green rather than silently doing nothing.
    const key = clip.effects?.find(
      (candidate) =>
        candidate.enabled &&
        (candidate.effectType === 'chroma_key' || candidate.effectType === 'background_removal'),
    );
    if (!key) return {};
    return {
      chromaKey: {
        color: stringParameter(key.parameters.color) ?? '#00ff00',
        tolerance: numberParameter(key.parameters.tolerance) ?? 0.3,
        softness: numberParameter(key.parameters.softness) ?? 0.1,
      },
    };
  })(),
  ...(() => {
    const tint = clip.effects?.find(
      (candidate) => candidate.enabled && candidate.effectId === 'tint',
    );
    const color = tint ? stringParameter(tint.parameters.color) : undefined;
    const amount = tint ? numberParameter(tint.parameters.amount) : undefined;
    return color && amount !== undefined && amount > 0 ? { tint: { color, amount } } : {};
  })(),
  ...(() => {
    const corner = clip.effects?.find(
      (candidate) => candidate.enabled && candidate.effectId === 'corner_radius',
    );
    const radiusFrac = corner ? numberParameter(corner.parameters.radiusFrac) : undefined;
    return radiusFrac !== undefined && radiusFrac > 0 ? { cornerRadiusFrac: radiusFrac } : {};
  })(),
  ...(transformKeyframesFor(clip) ? { keyframes: transformKeyframesFor(clip) } : {}),
});

const effectsFor = clipEffectSpecFromEditorClip;

const transitionFor = (transition: EditorTransition | undefined): ClipTransition | undefined => {
  if (!transition || transition.transitionType === 'cut') return undefined;
  const direction = stringParameter(transition.parameters.direction);
  const type: ClipTransition['type'] = (() => {
    switch (transition.transitionType) {
      case 'crossfade':
        return 'crossDissolve';
      case 'dip_to_black':
        return 'fade';
      case 'dip_to_white':
        return 'dipWhite';
      case 'slide':
        if (direction === 'right') return 'slideRight';
        if (direction === 'up') return 'slideUp';
        if (direction === 'down') return 'slideDown';
        return 'slideLeft';
      case 'wipe':
        return direction === 'left' ? 'wipeLeft' : 'wipeRight';
      case 'zoom':
        return 'zoomIn';
      case 'custom':
        return transition.transitionId === 'spin' ? 'spin' : 'crossDissolve';
      default:
        return 'crossDissolve';
    }
  })();
  return { type, durationSec: transition.durationSec };
};

const captionStyleFor = (
  clip: {
    style: {
      fontFamily: string;
      fontSizePx: number;
      color: string;
      backgroundColor?: string;
      outlineColor?: string;
      outlineWidthPx: number;
      fontWeight: number;
    };
    transform: { position: { x: number; y: number } };
  },
  canvasHeight: number,
): CaptionStyleOverride => ({
  textColor: clip.style.color,
  highlightColor:
    'highlightMode' in clip && clip.highlightMode === 'word'
      ? DEFAULT_CAPTION_STYLE.highlightColor
      : clip.style.color,
  outlineColor: clip.style.outlineColor ?? '#000000',
  fontFamily: clip.style.fontFamily,
  fontWeight: clip.style.fontWeight,
  fontSizeFrac: clip.style.fontSizePx / canvasHeight,
  outlineWidthFrac:
    clip.style.fontSizePx > 0 ? clip.style.outlineWidthPx / clip.style.fontSizePx : 0,
  position: {
    xFrac: clip.transform.position.x,
    yFrac: clip.transform.position.y,
  },
  ...(clip.style.backgroundColor
    ? { backgroundColor: clip.style.backgroundColor, backgroundOpacity: 1 }
    : {}),
});

async function signedUrlsFor(
  brandId: string,
  inputs: Array<{ storage?: { bucket: string; path: string } }>,
): Promise<Map<string, string>> {
  const coordinates = [
    ...new Map(
      inputs.flatMap((input) =>
        input.storage
          ? [[signKey(input.storage.bucket, input.storage.path), input.storage] as const]
          : [],
      ),
    ).values(),
  ];
  const signed = new Map<string, string>();
  for (let index = 0; index < coordinates.length; index += CANVAS_MEDIA_SIGN_MAX_ITEMS) {
    const response = await request<CanvasMediaSignResponse>({
      path: CANVAS_MEDIA_SIGN_ROUTE,
      method: 'POST',
      body: {
        brandProfileId: brandId,
        items: coordinates.slice(index, index + CANVAS_MEDIA_SIGN_MAX_ITEMS),
      },
    });
    for (const item of response.items) signed.set(signKey(item.bucket, item.path), item.signedUrl);
  }
  return signed;
}

/**
 * The browser compositor currently has one explicit, deterministic master
 * profile. Reject every setting it cannot actually guarantee instead of
 * silently producing an MP4/H.264/AAC file for a different requested preset.
 */
export function assertSupportedTimelineEditorExport(project: EditorProjectV2): void {
  const settings = project.exportSettings;
  const unsupported: string[] = [];
  const frameRate = settings.frameRate.numerator / settings.frameRate.denominator;
  const projectFrameRate = project.frameRate.numerator / project.frameRate.denominator;

  if (settings.width % 2 !== 0 || settings.height % 2 !== 0) {
    unsupported.push('width and height must be even');
  }
  if (Math.abs(frameRate - 30) > Number.EPSILON) unsupported.push('frameRate must be 30 fps');
  if (Math.abs(projectFrameRate - frameRate) > Number.EPSILON) {
    unsupported.push('project and export frameRate must match');
  }
  if (settings.format !== 'mp4') unsupported.push('format must be mp4');
  if (settings.videoCodec !== 'h264') unsupported.push('videoCodec must be h264');
  if (settings.audioCodec !== 'aac') unsupported.push('audioCodec must be aac');
  if (settings.sampleRateHz !== 48_000) unsupported.push('sampleRateHz must be 48000');
  if (project.sampleRateHz !== settings.sampleRateHz) {
    unsupported.push('project and export sampleRateHz must match');
  }
  if (settings.colorSpace !== 'rec709') unsupported.push('colorSpace must be rec709');
  if (settings.alpha) unsupported.push('alpha must be false');
  if (settings.captionMode === 'sidecar') unsupported.push('sidecar captions are not supported');

  if (unsupported.length > 0) {
    throw new Error(`Unsupported Video Editor export settings: ${unsupported.join('; ')}.`);
  }
}

export async function buildTimelineEditorRenderPlan(input: {
  project: EditorProjectV2;
  jobInputs: Array<{
    sourceId: string;
    sourceAssetId?: string;
    sourceRevision?: string;
    storage?: { bucket: string; path: string };
  }>;
  signedUrls: ReadonlyMap<string, string>;
  signal: AbortSignal;
}): Promise<RenderPlan> {
  assertSupportedTimelineEditorExport(input.project);
  const inputByClip = new Map(input.jobInputs.map((entry) => [entry.sourceId, entry]));
  const pinByClip = new Map(
    input.project.tracks.flatMap((track) =>
      track.clips.flatMap((clip) =>
        'source' in clip && clip.source.sourceType === 'library_asset'
          ? [
              [
                clip.id,
                { assetId: clip.source.assetId, versionId: clip.source.renditionId },
              ] as const,
            ]
          : [],
      ),
    ),
  );
  const blobByClip = new Map<string, Promise<Blob>>();
  const blobFor = (clipId: string): Promise<Blob> => {
    const cached = blobByClip.get(clipId);
    if (cached) return cached;
    const source = inputByClip.get(clipId);
    if (!source?.storage) throw new Error(`Render source for clip "${clipId}" is missing.`);
    const pin = pinByClip.get(clipId);
    if (
      pin &&
      (!pin.versionId ||
        source.sourceAssetId !== pin.assetId ||
        source.sourceRevision !== pin.versionId)
    ) {
      throw new Error(`Render source for clip "${clipId}" does not match its pinned version.`);
    }
    const url = input.signedUrls.get(signKey(source.storage.bucket, source.storage.path));
    if (!url) throw new Error(`Render source for clip "${clipId}" could not be signed.`);
    const result = fetch(url, { signal: input.signal }).then((response) => {
      if (!response.ok)
        throw new Error(`Could not download clip "${clipId}" (${response.status}).`);
      return response.blob();
    });
    blobByClip.set(clipId, result);
    return result;
  };

  const videoTracks = input.project.tracks
    .filter(isVideoTrack)
    .filter((track) => track.enabled && !track.muted)
    .sort((left, right) => left.order - right.order);
  const primary = videoTracks[0];
  if (!primary) throw new Error('The editor project has no enabled video track.');
  const incomingTransitionByClip = new Map(
    input.project.transitions
      .filter((transition) => transition.trackId === primary.id)
      .map((transition) => [transition.toClipId, transition] as const),
  );
  const primaryClips = primary.clips
    .filter((clip) => clip.enabled)
    .sort((left, right) => left.timelineStartSec - right.timelineStartSec);
  let expectedStartSec = 0;
  for (const [index, clip] of primaryClips.entries()) {
    const transition = transitionFor(incomingTransitionByClip.get(clip.id));
    if (index > 0) expectedStartSec -= overlapInSecFor(transition);
    if (Math.abs(clip.timelineStartSec - expectedStartSec) > 0.001) {
      throw new Error(
        `Primary clip "${clip.id}" starts at ${clip.timelineStartSec}s; the canonical sequence requires ${expectedStartSec}s.`,
      );
    }
    expectedStartSec += clip.durationSec;
  }
  if (Math.abs(input.project.durationSec - expectedStartSec) > 0.001) {
    throw new Error(
      `Project duration ${input.project.durationSec}s does not match the canonical sequence duration ${expectedStartSec}s.`,
    );
  }
  const items: TimelineWorkerItem[] = await Promise.all(
    primaryClips.map(async (clip) => ({
      itemId: clip.id,
      kind: 'video' as const,
      blob: await blobFor(clip.id),
      trimStartSec: clip.sourceInSec,
      trimEndSec: clip.sourceInSec + clip.durationSec * clip.playbackRate,
      durationSec: clip.durationSec,
      muteAudio: !clip.audioEnabled,
      effects: effectsFor(clip),
      transition: transitionFor(incomingTransitionByClip.get(clip.id)),
    })),
  );

  const overlayClips = [
    ...input.project.tracks
      .filter(isOverlayTrack)
      .filter((track) => track.enabled && !track.muted)
      .flatMap((track) => track.clips),
    ...videoTracks
      .slice(1)
      .flatMap((track) => track.clips.map((clip) => ({ ...clip, mediaKind: 'video' as const }))),
  ];
  const overlays: TimelineOverlayWorkerItem[] = await Promise.all(
    overlayClips
      .filter((clip) => clip.enabled)
      .map(async (clip) => ({
        itemId: clip.id,
        kind: clip.mediaKind === 'image' ? ('image' as const) : ('video' as const),
        blob: await blobFor(clip.id),
        startSec: clip.timelineStartSec,
        trimStartSec: clip.sourceInSec,
        ...(clip.mediaKind === 'video'
          ? {
              trimEndSec:
                (clip.sourceInSec ?? 0) +
                clip.durationSec *
                  ('playbackRate' in clip && typeof clip.playbackRate === 'number'
                    ? clip.playbackRate
                    : 1),
            }
          : {}),
        durationSec: clip.durationSec,
        muteAudio: true,
        effects: effectsFor(clip),
      })),
  );

  const audioTracks: TimelineAudioWorkerItem[] = await Promise.all(
    input.project.tracks
      .filter(isAudioTrack)
      .filter((track) => track.enabled && !track.muted)
      .flatMap((track) => track.clips)
      .filter((clip) => clip.enabled && !clip.muted)
      .map(async (clip) => ({
        itemId: clip.id,
        blob: await blobFor(clip.id),
        startSec: clip.timelineStartSec,
        trimStartSec: clip.sourceInSec,
        trimEndSec: clip.sourceInSec + clip.durationSec * clip.playbackRate,
        speed: clip.playbackRate,
        volume: clip.volume,
        fadeInSec: clip.fadeInSec,
        fadeOutSec: clip.fadeOutSec,
      })),
  );

  const captionCues: CaptionCue[] = [];
  if (input.project.exportSettings.captionMode === 'burn_in') {
    for (const track of input.project.tracks.filter(isCaptionTrack)) {
      if (!track.enabled || track.muted) continue;
      for (const clip of track.clips.filter((candidate) => candidate.enabled)) {
        captionCues.push({
          id: clip.id,
          startSec: clip.timelineStartSec,
          endSec: clip.timelineStartSec + clip.durationSec,
          words:
            clip.words.length > 0
              ? clip.words.map((word) => ({
                  text: word.text,
                  startSec: word.startSec,
                  endSec: word.endSec,
                }))
              : wordsForCaptionText(
                  clip.text,
                  clip.timelineStartSec,
                  clip.timelineStartSec + clip.durationSec,
                ),
          style: captionStyleFor(clip, input.project.canvas.height),
        });
      }
    }
  }
  for (const track of input.project.tracks.filter(isTextTrack)) {
    if (!track.enabled || track.muted) continue;
    for (const clip of track.clips.filter((candidate) => candidate.enabled)) {
      captionCues.push({
        id: clip.id,
        startSec: clip.timelineStartSec,
        endSec: clip.timelineStartSec + clip.durationSec,
        words: wordsForCaptionText(
          clip.text,
          clip.timelineStartSec,
          clip.timelineStartSec + clip.durationSec,
        ),
        style: captionStyleFor(clip, input.project.canvas.height),
      });
    }
  }
  captionCues.sort((left, right) => left.startSec - right.startSec);
  return {
    items,
    overlays,
    audioTracks,
    captionCues,
    captionStyle: DEFAULT_CAPTION_STYLE,
  };
}

export const executeTimelineEditorClientRender: ClientRenderExecutor = async (context) => {
  const spec = context.job.executionSpec;
  if (spec.kind !== 'timeline_editor') {
    throw new Error('The Video Editor executor received the wrong render job kind.');
  }
  await context.update({ state: 'rendering', progress: 0, phase: 'Refreshing timeline media' });
  const signedUrls = await signedUrlsFor(context.job.brandId, context.job.inputs);
  const plan = await buildTimelineEditorRenderPlan({
    project: spec.project,
    jobInputs: context.job.inputs,
    signedUrls,
    signal: context.signal,
  });
  const rendered = await runTimelineInWorker({
    ...plan,
    videoBitrate: spec.project.exportSettings.videoBitrateKbps * 1_000,
    audioBitrate: spec.project.exportSettings.audioBitrateKbps * 1_000,
    frameRate:
      spec.project.exportSettings.frameRate.numerator /
      spec.project.exportSettings.frameRate.denominator,
    targetWidth: spec.project.exportSettings.width,
    targetHeight: spec.project.exportSettings.height,
    signal: context.signal,
    onProgress: ({ progress }) => {
      void context
        .update({ state: 'rendering', progress, phase: 'Rendering master' })
        .catch(() => undefined);
    },
  });
  try {
    await context.update({ state: 'saving', progress: 1, phase: 'Saving master to Library' });
    const persisted = await persistTimelineRender({
      blob: rendered.blob,
      brandId: context.job.brandId,
      nodeId: spec.projectId,
    });
    return {
      resultAssetIds: [persisted.assetId],
      title: 'Video master finished',
      description: 'The approved 1080p edit is saved to Library.',
    };
  } finally {
    URL.revokeObjectURL(rendered.objectUrl);
  }
};
