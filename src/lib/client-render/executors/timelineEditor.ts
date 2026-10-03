import {
  CANVAS_MEDIA_SIGN_MAX_ITEMS,
  CANVAS_MEDIA_SIGN_ROUTE,
  type CanvasMediaSignResponse,
  type EditorCaptionClip,
  type EditorOverlayClip,
  type EditorParentMotionBinding,
  type EditorProjectV2,
  type EditorTextClip,
  type EditorTransition,
  type EditorVideoClip,
  parentPositionTracks,
  resolveNestedSequence,
} from '@continuum/contracts';
import { request } from '@/lib/api/http';
import { captionAnimationFromEditorId } from '@/lib/clips/captionAnimation';
import {
  type CaptionFontPayload,
  isRegistrableCaptionFont,
  loadCaptionFonts,
} from '@/lib/clips/captionFonts';
import {
  type CaptionStyle,
  type CaptionStyleOverride,
  DEFAULT_CAPTION_STYLE,
} from '@/lib/clips/clipCaptionStyle';
import { viewProjectForSequence } from '@/StudioCanvas/nodes/timeline/editorProjectV2AssemblyModel';
import { persistTimelineRender } from '@/StudioCanvas/utils/persistTimelineRender';
import type {
  ClipEffectSpec,
  ClipMotionChannels,
  ClipPropertyStop,
} from '@/StudioCanvas/utils/render/effectSpec';
import type { ClipTransition } from '@/StudioCanvas/utils/render/transitions';
import { overlapInSecFor } from '@/StudioCanvas/utils/render/transitions';
import { type CaptionCue, wordsForCaptionText } from '@/StudioCanvas/utils/splice/captionCues';
import type { TimelineNestedRenderGroup } from '@/StudioCanvas/utils/splice/composeTimeline';
import {
  editorAudioTracks,
  nestedAudioClips,
  volumeKeyframesOf,
} from '@/StudioCanvas/utils/splice/timelineAudioEnvelope';
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
  groups: TimelineNestedRenderGroup[];
  audioTracks: TimelineAudioWorkerItem[];
  captionCues: CaptionCue[];
  captionStyle: CaptionStyle;
  /** The faces the text and captions name, registered before the first draw. */
  captionFonts: CaptionFontPayload[];
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
    if (
      ![
        'transform.position',
        'transform.scaleX',
        'transform.scaleY',
        'transform.rotationDeg',
      ].includes(keyframe.property)
    )
      continue;
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

type EditorClipKeyframe = {
  property: string;
  timeSec: number;
  value: unknown;
  interpolation?: ClipPropertyStop['interpolation'];
  easing?: ClipPropertyStop['easing'];
  spring?: ClipPropertyStop['spring'];
  expression?: string;
};

const toStop = (
  keyframe: EditorClipKeyframe,
  durationSec: number,
  value: number,
): ClipPropertyStop => ({
  t: keyframe.timeSec / durationSec,
  value,
  interpolation: keyframe.interpolation ?? 'linear',
  ...(keyframe.easing ? { easing: keyframe.easing } : {}),
  ...(keyframe.spring ? { spring: keyframe.spring } : {}),
  ...(keyframe.expression ? { expression: keyframe.expression } : {}),
});

const numericStopsFor = (
  clip: { durationSec: number; keyframes?: EditorClipKeyframe[] },
  property: string,
): ClipPropertyStop[] | undefined => {
  if (clip.durationSec <= 0) return undefined;
  const stops: ClipPropertyStop[] = [];
  for (const keyframe of clip.keyframes ?? []) {
    if (keyframe.property !== property || typeof keyframe.value !== 'number') continue;
    stops.push(toStop(keyframe, clip.durationSec, keyframe.value));
  }
  return stops.length > 0 ? stops : undefined;
};

const opacityStopsFor = (clip: {
  durationSec: number;
  keyframes?: EditorClipKeyframe[];
}): ClipPropertyStop[] | undefined => numericStopsFor(clip, 'transform.opacity');

const motionChannelsFor = (clip: {
  durationSec: number;
  keyframes?: EditorClipKeyframe[];
}): ClipMotionChannels | undefined => {
  if (clip.durationSec <= 0) return undefined;
  const offsetX: ClipPropertyStop[] = [];
  const offsetY: ClipPropertyStop[] = [];
  for (const keyframe of clip.keyframes ?? []) {
    if (keyframe.property !== 'transform.position' || typeof keyframe.value !== 'object') continue;
    if (
      !keyframe.value ||
      !('x' in keyframe.value) ||
      !('y' in keyframe.value) ||
      typeof keyframe.value.x !== 'number' ||
      typeof keyframe.value.y !== 'number'
    ) {
      continue;
    }
    offsetX.push(toStop(keyframe, clip.durationSec, keyframe.value.x - 0.5));
    offsetY.push(toStop(keyframe, clip.durationSec, keyframe.value.y - 0.5));
  }
  const scaleX = numericStopsFor(clip, 'transform.scaleX');
  const scaleY = numericStopsFor(clip, 'transform.scaleY');
  const rotate = numericStopsFor(clip, 'transform.rotationDeg');
  const rotateX = numericStopsFor(clip, 'transform.rotateXDeg');
  const rotateY = numericStopsFor(clip, 'transform.rotateYDeg');
  const opacity = opacityStopsFor(clip);
  const channels: ClipMotionChannels = {
    ...(opacity ? { opacity } : {}),
    ...(offsetX.length ? { offsetX } : {}),
    ...(offsetY.length ? { offsetY } : {}),
    ...(scaleX ? { scaleX } : {}),
    ...(scaleY ? { scaleY } : {}),
    ...(rotate ? { rotate } : {}),
    ...(rotateX ? { rotateX } : {}),
    ...(rotateY ? { rotateY } : {}),
  };
  return Object.keys(channels).length > 0 ? channels : undefined;
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
export const clipEffectSpecFromEditorClip = (
  clip: {
    id?: string;
    parentClipId?: string;
    parentMotionBinding?: EditorParentMotionBinding;
    timelineStartSec: number;
    durationSec: number;
    playbackRate?: number;
    transform?: {
      position: { x: number; y: number };
      scaleX: number;
      scaleY: number;
      rotationDeg: number;
      rotateXDeg?: number;
      rotateYDeg?: number;
      perspective?: number;
      opacity: number;
      anchorX?: number;
      anchorY?: number;
    };
    crop?: ClipEffectSpec['crop'];
    blendMode?: ClipEffectSpec['blendMode'];
    effects?: Array<{
      enabled: boolean;
      effectType: string;
      effectId: string;
      mix?: number;
      parameters: Record<string, unknown>;
    }>;
    keyframes?: EditorClipKeyframe[];
    keyframeOffsetSec?: number;
  },
  project?: EditorProjectV2,
): ClipEffectSpec => ({
  ...(project && clip.id && (clip.parentClipId || clip.parentMotionBinding)
    ? {
        parentPositionTracks: parentPositionTracks(project, clip.id),
        motionDurationSec: clip.durationSec,
      }
    : {}),
  ...(clip.keyframes?.length
    ? { motionDurationSec: clip.durationSec, keyframeOffsetSec: clip.keyframeOffsetSec }
    : {}),
  ...(clip.playbackRate && clip.playbackRate !== 1 ? { speed: clip.playbackRate } : {}),
  ...(clip.transform
    ? {
        opacity: clip.transform.opacity,
        transform: {
          scale: Math.max(Math.abs(clip.transform.scaleX), Math.abs(clip.transform.scaleY)),
          scaleX: clip.transform.scaleX,
          scaleY: clip.transform.scaleY,
          offsetX: clip.transform.position.x - 0.5,
          offsetY: clip.transform.position.y - 0.5,
          rotate: clip.transform.rotationDeg,
          rotateX: clip.transform.rotateXDeg ?? 0,
          rotateY: clip.transform.rotateYDeg ?? 0,
          perspective: clip.transform.perspective ?? 0,
          anchorX: clip.transform.anchorX,
          anchorY: clip.transform.anchorY,
        },
      }
    : {}),
  ...(clip.crop && Object.values(clip.crop).some((value) => value !== 0)
    ? { crop: clip.crop }
    : {}),
  ...(clip.blendMode ? { blendMode: clip.blendMode } : {}),
  ...(() => {
    // Every enabled look counts, not just the first: a clip with a VHS look (itself a
    // video_filter) and then a black-and-white filter plays both, and a blur look sits
    // beside a filter preset. The first instance to name a preset or an adjustment wins it.
    const looks =
      clip.effects?.filter(
        (candidate) =>
          candidate.enabled &&
          (candidate.effectType === 'color_adjustment' ||
            candidate.effectType === 'video_filter' ||
            candidate.effectType === 'blur'),
      ) ?? [];
    if (looks.length === 0) return {};
    const filterPreset = looks
      .map((look) => stringParameter(look.parameters.filterPreset ?? look.effectId))
      .find((preset) => preset !== undefined && FILTER_PRESET_IDS.includes(preset));
    const first = (name: string) =>
      looks
        .map((look) => numberParameter(look.parameters[name]))
        .find((value) => value !== undefined);
    const adjustments = {
      brightness: first('brightness'),
      contrast: first('contrast'),
      saturation: first('saturation'),
      grayscale: first('grayscale'),
      sepia: first('sepia'),
      hueRotate: first('hueRotate'),
      blur: first('blur'),
      invert: first('invert'),
    };
    return {
      ...(filterPreset
        ? {
            filterPreset: filterPreset as NonNullable<ClipEffectSpec['filterPreset']>,
            filterStrength:
              looks.find((look) => (look.parameters.filterPreset ?? look.effectId) === filterPreset)
                ?.mix ?? 1,
          }
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
    const amountFor = (effectId: string): number | undefined => {
      const effect = clip.effects?.find(
        (candidate) => candidate.enabled && candidate.effectId === effectId,
      );
      return effect ? numberParameter(effect.parameters.amount) : undefined;
    };
    const blockPx = (() => {
      const effect = clip.effects?.find(
        (candidate) => candidate.enabled && candidate.effectId === 'pixelate',
      );
      return effect ? numberParameter(effect.parameters.blockPx) : undefined;
    })();
    const vignette = amountFor('vignette');
    const filmGrain = amountFor('film_grain');
    const chromaticAberration = amountFor('chromatic_aberration');
    const vhs = amountFor('vhs');
    return {
      ...(vignette !== undefined && vignette > 0 ? { vignette: { amount: vignette } } : {}),
      ...(filmGrain !== undefined && filmGrain > 0 ? { filmGrain: { amount: filmGrain } } : {}),
      ...(blockPx !== undefined && blockPx >= 2 ? { pixelate: { blockPx } } : {}),
      ...(chromaticAberration !== undefined && chromaticAberration > 0
        ? { chromaticAberration: { amount: chromaticAberration } }
        : {}),
      ...(vhs !== undefined && vhs > 0 ? { vhs: { amount: vhs } } : {}),
    };
  })(),
  ...(() => {
    const corner = clip.effects?.find(
      (candidate) => candidate.enabled && candidate.effectId === 'corner_radius',
    );
    const radiusFrac = corner ? numberParameter(corner.parameters.radiusFrac) : undefined;
    return radiusFrac !== undefined && radiusFrac > 0 ? { cornerRadiusFrac: radiusFrac } : {};
  })(),
  ...(transformKeyframesFor(clip) ? { keyframes: transformKeyframesFor(clip) } : {}),
  ...(opacityStopsFor(clip) ? { opacityStops: opacityStopsFor(clip) } : {}),
  ...(motionChannelsFor(clip) ? { motionChannels: motionChannelsFor(clip) } : {}),
});

const FILTER_PRESET_IDS = ['none', 'bw', 'vintage', 'vivid', 'cool', 'warm', 'noir', 'dream'];

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

/** The part of a clip's render spec that moves a text clip: transform, opacity, keyframes. */
const textMotionFor = (
  clip: Parameters<typeof clipEffectSpecFromEditorClip>[0],
  project?: EditorProjectV2,
) => {
  const {
    transform,
    opacity,
    motionChannels,
    motionDurationSec,
    keyframeOffsetSec,
    parentPositionTracks,
  } = clipEffectSpecFromEditorClip(clip, project);
  return {
    ...(transform ? { transform } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
    ...(motionChannels ? { motionChannels, motionDurationSec, keyframeOffsetSec } : {}),
    ...(parentPositionTracks?.length ? { parentPositionTracks, motionDurationSec } : {}),
  };
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
      shadowColor?: string;
      shadowBlurPx: number;
    };
    transform: { position: { x: number; y: number } };
    highlightColor?: string;
  },
  canvasHeight: number,
): CaptionStyleOverride => ({
  textColor: clip.style.color,
  highlightColor:
    'highlightMode' in clip && clip.highlightMode !== 'none'
      ? (clip.highlightColor ?? DEFAULT_CAPTION_STYLE.highlightColor)
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
  ...(clip.style.shadowColor && clip.style.shadowBlurPx > 0 && clip.style.fontSizePx > 0
    ? {
        shadow: {
          color: clip.style.shadowColor,
          blurFrac: clip.style.shadowBlurPx / clip.style.fontSizePx,
          offsetYFrac: TEXT_SHADOW_OFFSET_FRAC,
        },
      }
    : {}),
});

/** A drop shadow falls a little below the glyphs, as a fraction of the font size. */
const TEXT_SHADOW_OFFSET_FRAC = 0.06;

/**
 * A text clip as the caption cue the compositor draws: its look, its entrance and exit, and
 * its transform and keyframes, which move the whole line as they move a video clip. The one
 * mapping — the export plan and the workspace stage both draw text through it.
 */
export function textCueFor(
  clip: EditorTextClip,
  canvasHeight: number,
  project?: EditorProjectV2,
): CaptionCue {
  const endSec = clip.timelineStartSec + clip.durationSec;
  return {
    id: clip.id,
    startSec: clip.timelineStartSec,
    endSec,
    words: wordsForCaptionText(clip.text, clip.timelineStartSec, endSec),
    ...(clip.textAnimationClock ? { animationClock: clip.textAnimationClock } : {}),
    style: {
      ...captionStyleFor(clip, canvasHeight),
      animation: captionAnimationFromEditorId(clip.animationIn),
      exitAnimation: captionAnimationFromEditorId(clip.animationOut),
    },
    motion: textMotionFor(clip, project),
  };
}

/** Clip-relative speech words and motion, shared by the native stage and burn-in. */
export function captionCueFor(
  clip: EditorCaptionClip,
  canvasHeight: number,
  project?: EditorProjectV2,
): CaptionCue {
  const endSec = clip.timelineStartSec + clip.durationSec;
  return {
    id: clip.id,
    startSec: clip.timelineStartSec,
    endSec,
    words: clip.words.length
      ? clip.words.map((word) => ({
          text: word.text,
          startSec: clip.timelineStartSec + word.startSec,
          endSec: clip.timelineStartSec + word.endSec,
          ...(word.emphasis ? { emphasis: true } : {}),
        }))
      : wordsForCaptionText(clip.text, clip.timelineStartSec, endSec),
    style: captionStyleFor(clip, canvasHeight),
    motion: textMotionFor(clip, project),
  };
}

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
  const allTracks = [
    ...input.project.tracks,
    ...input.project.nestedSequences.flatMap((sequence) => sequence.tracks),
  ];
  const pinByClip = new Map(
    allTracks.flatMap((track) =>
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
  // Keyed by stored file, not clip: a first cut of one interview is a dozen clips over the
  // same file, and one Blob per clip was a dozen downloads and a dozen copies in memory.
  const blobByFile = new Map<string, Promise<Blob>>();
  const blobFor = (clipId: string): Promise<Blob> => {
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
    const file = signKey(source.storage.bucket, source.storage.path);
    const cached = blobByFile.get(file);
    if (cached) return cached;
    const url = input.signedUrls.get(file);
    if (!url) throw new Error(`Render source for clip "${clipId}" could not be signed.`);
    const result = fetch(url, { signal: input.signal }).then((response) => {
      if (!response.ok)
        throw new Error(`Could not download clip "${clipId}" (${response.status}).`);
      return response.blob();
    });
    blobByFile.set(file, result);
    return result;
  };

  // `muted` silences a video track; only `enabled` takes its picture away.
  const videoTracks = input.project.tracks
    .filter(isVideoTrack)
    .filter((track) => track.enabled)
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
  const audibleTracks = new Set(editorAudioTracks(input.project).map((track) => track.id));
  const items: TimelineWorkerItem[] = await Promise.all(
    primaryClips.map(async (clip) => ({
      itemId: clip.id,
      kind: 'video' as const,
      blob: await blobFor(clip.id),
      trimStartSec: clip.sourceInSec,
      trimEndSec: clip.sourceInSec + clip.durationSec * clip.playbackRate,
      durationSec: clip.durationSec,
      muteAudio: !clip.audioEnabled || !audibleTracks.has(primary.id),
      volume: clip.volume,
      audioFadeClock: clip.audioFadeClock,
      audioFadeInSec: clip.fadeInSec,
      audioFadeOutSec: clip.fadeOutSec,
      volumeKeyframes: volumeKeyframesOf(clip.keyframes),
      keyframeOffsetSec: clip.keyframeOffsetSec,
      effects: effectsFor(clip, input.project),
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
  const overlayFor = async (
    clip: EditorOverlayClip | EditorVideoClip,
    space: EditorProjectV2,
  ): Promise<TimelineOverlayWorkerItem> => ({
    itemId: clip.id,
    kind: clip.kind === 'overlay' && clip.mediaKind === 'image' ? 'image' : 'video',
    blob: await blobFor(clip.id),
    startSec: clip.timelineStartSec,
    trimStartSec: clip.sourceInSec,
    ...(clip.kind === 'video' || clip.mediaKind === 'video'
      ? {
          trimEndSec:
            (clip.sourceInSec ?? 0) +
            clip.durationSec * (clip.kind === 'video' ? clip.playbackRate : 1),
        }
      : {}),
    durationSec: clip.durationSec,
    muteAudio: true,
    effects: effectsFor(clip, space),
  });
  const overlays = await Promise.all(
    overlayClips.filter((clip) => clip.enabled).map((clip) => overlayFor(clip, input.project)),
  );

  const audioTracks: TimelineAudioWorkerItem[] = await Promise.all(
    editorAudioTracks(input.project)
      .filter(isAudioTrack)
      .filter((track) => track.enabled && !track.muted)
      .flatMap((track) => track.clips)
      .filter((clip) => clip.enabled && !clip.muted)
      .map(async (clip) => {
        const volumeKeyframes = volumeKeyframesOf(clip.keyframes);
        return {
          itemId: clip.id,
          blob: await blobFor(clip.id),
          startSec: clip.timelineStartSec,
          trimStartSec: clip.sourceInSec,
          trimEndSec: clip.sourceInSec + clip.durationSec * clip.playbackRate,
          speed: clip.playbackRate,
          volume: clip.volume,
          audioFadeClock: clip.audioFadeClock,
          fadeInSec: clip.fadeInSec,
          fadeOutSec: clip.fadeOutSec,
          ...(volumeKeyframes.length > 0
            ? { volumeKeyframes, keyframeOffsetSec: clip.keyframeOffsetSec }
            : {}),
        };
      }),
  );

  audioTracks.push(
    ...(await Promise.all(
      nestedAudioClips(input.project).map(async (item) => {
        const clip = item.clock;
        return {
          itemId: item.id,
          blob: await blobFor(item.sourceClipId),
          startSec: item.outputStartSec,
          trimStartSec: item.sourceStartSec,
          trimEndSec: item.sourceEndSec,
          speed: item.playbackRate,
          volume: clip.volume,
          audioFadeClock: clip.audioFadeClock,
          fadeInSec: clip.fadeInSec,
          fadeOutSec: clip.fadeOutSec,
          volumeKeyframes: volumeKeyframesOf(clip.keyframes),
          keyframeOffsetSec: clip.keyframeOffsetSec,
          groupVolumeKeyframes: item.groupVolumeKeyframes,
          groupKeyframeOffsetSec: item.groupKeyframeOffsetSec,
        };
      }),
    )),
  );

  const captionCues: CaptionCue[] = [];
  if (input.project.exportSettings.captionMode === 'burn_in') {
    for (const track of input.project.tracks.filter(isCaptionTrack)) {
      if (!track.enabled || track.muted) continue;
      for (const clip of track.clips.filter((candidate) => candidate.enabled)) {
        captionCues.push(captionCueFor(clip, input.project.canvas.height, input.project));
      }
    }
  }
  for (const track of input.project.tracks.filter(isTextTrack)) {
    if (!track.enabled || track.muted) continue;
    for (const clip of track.clips.filter((candidate) => candidate.enabled)) {
      captionCues.push(textCueFor(clip, input.project.canvas.height, input.project));
    }
  }
  captionCues.sort((left, right) => left.startSec - right.startSec);
  const fontCues = [...captionCues];
  const groups: TimelineNestedRenderGroup[] = [];
  for (const track of input.project.tracks) {
    if (track.kind !== 'nested_sequence' || !track.enabled) continue;
    for (const instance of track.clips) {
      if (!instance.enabled) continue;
      const nested = resolveNestedSequence(input.project, instance);
      if (!nested)
        throw new Error(`Nested instance "${instance.id}" has no available local sequence.`);
      if (nested.tracks.some((lane) => lane.kind === 'nested_sequence'))
        throw new Error(
          `Nested sequence "${nested.id}": another nested sequence is not supported.`,
        );
      const child = viewProjectForSequence(input.project, nested.id);
      if (nested.transitions.length)
        throw new Error(`Nested sequence "${nested.id}": child transitions are not supported yet.`);
      if (
        child.tracks.some(
          (lane) =>
            lane.kind === 'effect' &&
            lane.enabled &&
            !lane.muted &&
            lane.clips.some((clip) => clip.enabled),
        )
      )
        throw new Error(`Nested sequence "${nested.id}": effect tracks are not supported yet.`);
      const visible = child.tracks
        .filter((lane) => lane.enabled && (lane.kind === 'video' || !lane.muted))
        .toSorted((left, right) => left.order - right.order);
      const childOverlays = await Promise.all(
        visible
          .flatMap((lane) =>
            lane.kind === 'overlay' || lane.kind === 'video'
              ? lane.clips.filter((clip) => clip.enabled)
              : [],
          )
          .map((clip) => overlayFor(clip, child)),
      );
      const cues = visible
        .flatMap((lane) =>
          lane.kind === 'text'
            ? lane.clips
                .filter((clip) => clip.enabled)
                .map((clip) => textCueFor(clip, nested.canvas.height, child))
            : lane.kind === 'caption' && input.project.exportSettings.captionMode === 'burn_in'
              ? lane.clips
                  .filter((clip) => clip.enabled)
                  .map((clip) => captionCueFor(clip, nested.canvas.height, child))
              : [],
        )
        .sort((left, right) => left.startSec - right.startSec);
      fontCues.push(...cues);
      groups.push({
        itemId: instance.id,
        startSec: instance.timelineStartSec,
        durationSec: instance.durationSec,
        sourceInSec: instance.sourceInSec,
        playbackRate: instance.playbackRate,
        childDurationSec: nested.durationSec,
        width: nested.canvas.width,
        height: nested.canvas.height,
        effects: effectsFor(instance, input.project),
        overlays: childOverlays,
        captionCues: cues,
      });
    }
  }
  // The export draws text in the faces the preview does. Without their bytes the worker
  // (or Render's headless Chrome) falls back to whatever the platform has, and the type
  // metrics change between the browser and the server. A face that will not load fails
  // the export rather than silently burning in a substitute.
  const captionFonts = await loadCaptionFonts(
    fontCues.flatMap((cue) =>
      isRegistrableCaptionFont(cue.style?.fontFamily) ? [cue.style?.fontFamily ?? ''] : [],
    ),
  );
  return {
    items,
    overlays,
    groups,
    audioTracks,
    captionCues,
    captionStyle: DEFAULT_CAPTION_STYLE,
    captionFonts,
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
