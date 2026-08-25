import type { TimelineWorkerItem } from '../../workers/spliceWorkerProtocol';
import {
  parseAspectRatio as parseAspectRatioString,
  planCropToAspect,
  planPadToAspect,
} from '../pixel/cropPad';
import {
  type ClipAdjustments,
  type ClipEffectSpec,
  FILTER_PRESETS,
  type FilterPreset,
  type TransformKeyframe,
} from '../render/effectSpec';
import { computeLetterboxRect } from '../splice/letterbox';
import {
  type LongExposureMode,
  type LongExposureResult,
  renderLongExposure,
} from '../splice/longExposure';

// Config → payload glue for the video half of the action catalog.
//
// Everything here is PURE and mediabunny-free on purpose. `actionEngines.ts` pulls
// composeTimeline (and with it mediabunny), so anything the page might want — the node
// UI, `runAction`'s sync branch — has to be able to reach these mappers without
// dragging the encoder into the page bundle. That is the same reason `runAction.ts`
// keeps its own copy of the engine id list.
//
// Every mapper takes the op's ALREADY-PARSED config (`Record<string, unknown>` — the
// worker parses it against the op's zod schema before the engine sees it) and still
// re-reads each field defensively. A schema parse guarantees the shape of a config
// that WAS stored; it says nothing about an engine called from a bench or a test.

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const str = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

// ---------------------------------------------------------------------------
// Colour: grade / filter / blur
// ---------------------------------------------------------------------------

/** `video.grade` — the eight registry knobs are `ClipAdjustments` plus opacity. */
export function gradeEffects(config: Record<string, unknown>): ClipEffectSpec {
  return {
    adjustments: {
      brightness: num(config.brightness, 1),
      contrast: num(config.contrast, 1),
      saturation: num(config.saturation, 1),
      hueRotate: num(config.hueRotate, 0),
      sepia: num(config.sepia, 0),
      grayscale: num(config.grayscale, 0),
      invert: num(config.invert, 0),
    },
    opacity: num(config.opacity, 1),
  };
}

/**
 * The registry's filter names → the render spec's. Two vocabularies exist because the
 * registry was written for the menu ("faded", "mono") and `effectSpec` for the editor
 * ("vintage", "bw"); this table is the ONE place they meet, so neither has to move.
 */
export const FILTER_PRESET_MAP = {
  none: 'none',
  noir: 'noir',
  vivid: 'vivid',
  faded: 'vintage',
  warm: 'warm',
  cool: 'cool',
  mono: 'bw',
} as const satisfies Record<string, FilterPreset>;

/** The value each adjustment holds when it does nothing. */
const IDENTITY_ADJUSTMENTS: Required<ClipAdjustments> = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  grayscale: 0,
  sepia: 0,
  hueRotate: 0,
  blur: 0,
  invert: 0,
};

/**
 * A preset dialled back toward "no effect" by `intensity`.
 *
 * `filterPreset` on the spec would apply the look at full strength — the registry's
 * `intensity` knob would silently do nothing. Interpolating the adjustments here and
 * emitting them directly is what makes the slider real.
 */
export function scaleAdjustments(preset: ClipAdjustments, intensity: number): ClipAdjustments {
  const k = clamp01(intensity);
  const scaled: ClipAdjustments = {};
  for (const key of Object.keys(preset) as (keyof ClipAdjustments)[]) {
    const target = preset[key];
    if (typeof target !== 'number') continue;
    const identity = IDENTITY_ADJUSTMENTS[key];
    scaled[key] = identity + (target - identity) * k;
  }
  return scaled;
}

/** `video.filter` — a named look at `intensity`. */
export function filterEffects(config: Record<string, unknown>): ClipEffectSpec {
  const name = str(config.preset, 'none') as keyof typeof FILTER_PRESET_MAP;
  const preset = FILTER_PRESET_MAP[name] ?? 'none';
  if (preset === 'none') return {};
  return { adjustments: scaleAdjustments(FILTER_PRESETS[preset], num(config.intensity, 1)) };
}

/** `video.blur` — one adjustment, in pixels. */
export function blurEffects(config: Record<string, unknown>): ClipEffectSpec {
  return { adjustments: { blur: Math.max(0, num(config.radiusPx, 8)) } };
}

// ---------------------------------------------------------------------------
// Motion: Ken Burns / camera shake / the effect preset table
// ---------------------------------------------------------------------------

/** `video.kenBurns` — a push, a pull, or a pan, as a from/to transform pair. */
export function kenBurnsEffects(config: Record<string, unknown>): ClipEffectSpec {
  const amount = clamp01(num(config.amount, 0.2));
  const direction = str(config.direction, 'in');
  if (direction === 'in') return { kenBurns: { from: { scale: 1 }, to: { scale: 1 + amount } } };
  if (direction === 'out') return { kenBurns: { from: { scale: 1 + amount }, to: { scale: 1 } } };

  // A pan needs headroom or it would drag black in from the edge. At scale 1+amount the
  // slack on each side is exactly amount/2, which is therefore the widest safe travel.
  const scale = 1 + amount;
  const travel = amount / 2;
  const axis = direction === 'left' || direction === 'right' ? 'offsetX' : 'offsetY';
  // "left" means the CONTENT moves left, so the frame starts pushed right.
  const sign = direction === 'left' || direction === 'up' ? 1 : -1;
  return {
    kenBurns: {
      from: { scale, [axis]: travel * sign },
      to: { scale, [axis]: -travel * sign },
    },
  };
}

/**
 * Deterministic jitter in -1..1. A seeded PRNG would need state threaded through the
 * worker; a hashed sinusoid is stateless and gives the same shake every render, which
 * is what makes a re-run of the same node produce the same bytes.
 */
function shakeOffset(index: number, axis: number): number {
  const hashed = Math.sin(index * 12.9898 + axis * 78.233) * 43758.5453;
  return (hashed - Math.floor(hashed)) * 2 - 1;
}

const SHAKE_STOPS = 12;

/** Camera shake as transform keyframes — `effectSpec` already interpolates these. */
export function cameraShakeKeyframes(amount: number, stops = SHAKE_STOPS): TransformKeyframe[] {
  const magnitude = 0.02 * clamp01(amount);
  return Array.from({ length: stops }, (_, index) => ({
    t: stops > 1 ? index / (stops - 1) : 0,
    transform: {
      // Scale up by twice the travel so the jitter never exposes an edge.
      scale: 1 + magnitude * 2,
      offsetX: shakeOffset(index, 0) * magnitude,
      offsetY: shakeOffset(index, 1) * magnitude,
    },
  }));
}

/**
 * The `video.effect` presets that ride the SHIPPED effect spec — no engine work, no
 * new draw primitive, just a config mapping.
 *
 * `video.effect`'s config is `preset: z.string()`, not an enum, so this list (not the
 * schema) is what an unknown preset is checked against.
 */
export const VIDEO_EFFECT_PRESETS = [
  'none',
  'bw',
  'vintage',
  'vivid',
  'cool',
  'warm',
  'noir',
  'dream',
  'blur',
  'cameraShake',
  'zoomIn',
  'zoomOut',
  'vignette',
  'filmGrain',
  'pixelate',
  'chromaticAberration',
  'vhs',
] as const;

/**
 * The presets asked for that `effectSpec` cannot express TODAY.
 *
 * Every one of them needs a per-pixel or per-frame draw step that has no CSS `filter`
 * equivalent, which is the line `effectSpec` is built on (preview == export). They are
 * refused BY NAME rather than silently rendering as a passthrough — a node that claims
 * "VHS" and emits the untouched clip is the failure mode this list prevents.
 */
/** Empty since Wave 4 — the five per-pixel presets landed as frameDraw primitives.
 *  Kept as the seam a future spec-less preset must name itself in, never silently. */
export const EFFECT_PRESETS_NEEDING_SPEC_WORK = [] as const;

/** `video.effect` — the preset's spec, or a refusal that says which kind of gap it is. */
export function effectPresetEffects(config: Record<string, unknown>): ClipEffectSpec {
  const preset = str(config.preset, 'none');
  const intensity = clamp01(num(config.intensity, 1));

  if (preset === 'none') return {};
  if (preset in FILTER_PRESETS) {
    return {
      adjustments: scaleAdjustments(
        FILTER_PRESETS[preset as keyof typeof FILTER_PRESETS],
        intensity,
      ),
    };
  }
  if (preset === 'blur') return { adjustments: { blur: 20 * intensity } };
  if (preset === 'cameraShake') return { keyframes: cameraShakeKeyframes(intensity) };
  if (preset === 'zoomIn') return kenBurnsEffects({ direction: 'in', amount: 0.25 * intensity });
  if (preset === 'zoomOut') return kenBurnsEffects({ direction: 'out', amount: 0.25 * intensity });
  if (preset === 'vignette') return { vignette: { amount: intensity } };
  if (preset === 'filmGrain') return { filmGrain: { amount: intensity } };
  if (preset === 'pixelate') return { pixelate: { blockPx: Math.round(2 + 30 * intensity) } };
  if (preset === 'chromaticAberration') return { chromaticAberration: { amount: intensity } };
  if (preset === 'vhs') {
    return {
      vhs: { amount: intensity },
      adjustments: scaleAdjustments({ saturation: 1.25, contrast: 1.1 }, intensity),
    };
  }

  if ((EFFECT_PRESETS_NEEDING_SPEC_WORK as readonly string[]).includes(preset)) {
    throw new Error(
      `The "${preset}" effect needs a new draw primitive in the clip effect spec — no canvas filter covers it`,
    );
  }
  throw new Error(`Unknown effect "${preset}". Available: ${VIDEO_EFFECT_PRESETS.join(', ')}`);
}

// ---------------------------------------------------------------------------
// Aspect ratio: crop (cover) and pad (contain)
// ---------------------------------------------------------------------------

export interface Dimensions {
  width: number;
  height: number;
}

/**
 * `"9:16"` → 0.5625, from the SHARED parser in `utils/pixel/cropPad.ts`.
 *
 * That module is the image half of the same two ops, and its `planCropToAspect` /
 * `planPadToAspect` are the same geometry this file needs. Reimplementing either here
 * would give `image.crop` and `video.crop` two answers to "what size is 4:5 of this",
 * which is exactly the drift `letterbox.ts` was frozen to stop.
 */
export function parseAspectRatio(value: unknown): number | undefined {
  return typeof value === 'string' ? parseAspectRatioString(value) : undefined;
}

/** The largest frame of `ratio` that fits INSIDE the source — a crop never upscales. */
export function cropDimensions(
  sourceWidth: number,
  sourceHeight: number,
  ratio: number,
): Dimensions {
  const plan = planCropToAspect(sourceWidth, sourceHeight, ratio);
  return { width: plan.width, height: plan.height };
}

/** The smallest frame of `ratio` that CONTAINS the source — a pad never crops. */
export function padDimensions(
  sourceWidth: number,
  sourceHeight: number,
  ratio: number,
): Dimensions {
  const plan = planPadToAspect(sourceWidth, sourceHeight, ratio);
  return { width: plan.width, height: plan.height };
}

/**
 * The scale that turns the shared letterbox (a CONTAIN fit) into a COVER fit.
 *
 * `drawClipFrame` always letterboxes; the only lever the frozen draw path exposes is
 * the clip transform. Because a contain fit already pins one axis to the target, the
 * cover factor is just how far the OTHER axis falls short — which is what this returns,
 * and why crop needs no new draw code at all. (`cropPad.computeCoverRect` answers the
 * same question in SOURCE pixels, which is what a `drawImage` crop needs and a canvas
 * transform cannot use.)
 */
export function coverScale(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): number {
  const rect = computeLetterboxRect(sourceWidth, sourceHeight, targetWidth, targetHeight);
  if (rect.width <= 0 || rect.height <= 0) return 1;
  return Math.max(targetWidth / rect.width, targetHeight / rect.height);
}

/** `video.crop` — cover the target frame, letting the overflow fall off the edge. */
export function cropEffects(
  sourceWidth: number,
  sourceHeight: number,
  target: Dimensions,
): ClipEffectSpec {
  return {
    transform: { scale: coverScale(sourceWidth, sourceHeight, target.width, target.height) },
  };
}

// ---------------------------------------------------------------------------
// Keying
// ---------------------------------------------------------------------------

/**
 * `video.greenscreen` — the registry's chroma config IS the spec's, by design, so this
 * only re-reads the fields rather than translating them.
 */
export function chromaKeyEffects(config: Record<string, unknown>): ClipEffectSpec {
  return {
    chromaKey: {
      color: str(config.color, '#00ff00'),
      tolerance: clamp01(num(config.tolerance, 0.3)),
      softness: clamp01(num(config.softness, 0.1)),
    },
  };
}

// ---------------------------------------------------------------------------
// Assembly: stitch and split
// ---------------------------------------------------------------------------

/** `video.stitch` — clips in wiring order, the transition attached to the incoming one. */
export function stitchItems(blobs: Blob[], config: Record<string, unknown>): TimelineWorkerItem[] {
  const transition = str(config.transition, 'none');
  const durationSec = Math.max(0, num(config.transitionSec, 0.5));
  const overlapping = transition === 'crossDissolve' && durationSec > 0;
  return blobs.map((blob, index) => ({
    itemId: `action-stitch-${index}`,
    kind: 'video' as const,
    blob,
    // A transition belongs to the boundary BEFORE a clip, so the first clip has none.
    ...(index > 0 && overlapping
      ? { transition: { type: 'crossDissolve' as const, durationSec } }
      : {}),
  }));
}

export interface SplitRange {
  startSec: number;
  endSec: number;
}

/**
 * `video.split` — the cut points, as ranges over the source.
 *
 * The frozen registry config is `{ atSec }`: ONE cut, two parts. Equal-parts, fixed-
 * duration and scene-detect splitting were asked for but cannot be expressed by that
 * schema, and `action-registry.ts` is frozen this wave — see the handoff. The range
 * math is written to take any number of cuts so widening the config later is a config
 * change, not an engine change.
 */
export function splitRanges(durationSec: number, config: Record<string, unknown>): SplitRange[] {
  if (!(durationSec > 0)) throw new Error('The connected clip has no duration to split');
  const at = num(config.atSec, 1);
  return splitAtCuts(durationSec, [at]);
}

/** Ranges between `cuts` over a clip of `durationSec`. Rejects a cut outside the clip. */
export function splitAtCuts(durationSec: number, cuts: number[]): SplitRange[] {
  const ordered = [...new Set(cuts)].sort((a, b) => a - b);
  for (const cut of ordered) {
    if (!(cut > 0) || cut >= durationSec) {
      throw new Error(`Split point ${cut}s is outside the clip (0–${durationSec.toFixed(2)}s)`);
    }
  }
  const bounds = [0, ...ordered, durationSec];
  return bounds.slice(0, -1).map((startSec, index) => ({ startSec, endSec: bounds[index + 1] }));
}

// ---------------------------------------------------------------------------
// The one sync video op
// ---------------------------------------------------------------------------

/**
 * `video.longExposure` — the catalog marks it `sync`/`image`, so it runs IN THE PAGE
 * next to `video.extractFrames`, not in the splicer worker. Its entry belongs in
 * `runAction.ts`'s `SYNC_OPS`, which this shell does not own — see the handoff.
 */
export function runLongExposureAction(
  blob: Blob,
  config: Record<string, unknown>,
  options?: { signal?: AbortSignal; onProgress?: (fraction: number) => void },
): Promise<LongExposureResult> {
  return renderLongExposure({
    blob,
    mode: str(config.mode, 'average') as LongExposureMode,
    sampleFps: num(config.sampleFps, 12),
    signal: options?.signal,
    onProgress: options?.onProgress,
  });
}
