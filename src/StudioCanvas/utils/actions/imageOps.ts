import { buildDataUrl } from '../dataUrl';
import { parseHexColor, type RgbColor } from '../pixel/chromaKey';
import { planCropToAspect, planPadToAspect } from '../pixel/cropPad';
import { type ClipAdjustments, filterString, warmthAdjustments } from '../render/effectSpec';

// Canvas-backed still operations behind the `image.*` action ops. Everything here
// draws through OffscreenCanvas so a runner can use it off the main thread later
// without a rewrite. The geometry and the colour tables are split out into pure
// helpers — that is the part that can be tested without a browser.
//
// The colour vocabulary is `effectSpec`'s `ClipAdjustments` + `filterString`, NOT a
// second one: an `image.grade` and a `video.grade` with the same numbers must produce
// the same pixels, and they can only do that if they compile to the same CSS filter
// string. `effectSpec` is frozen and read-only from here.
//
// ponytail: every per-pixel op below is a plain JS loop over `ImageData`. That is the
// right ceiling for stills — a 4K frame is ~8M iterations, tens of milliseconds. If a
// realtime preview ever needs these, the upgrade path is a WebGL fragment shader, not
// a faster loop.

/** Degrees folded into [0, 360). `-90`, `270` and `630` are one rotation. */
const normaliseDegrees = (degrees: number): number => ((degrees % 360) + 360) % 360;

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export interface Bounds {
  readonly width: number;
  readonly height: number;
}

/** The canvas a `width` × `height` rectangle needs once rotated by `degrees`. */
export function rotatedBounds(width: number, height: number, degrees: number): Bounds {
  const angle = normaliseDegrees(degrees);

  // Quarter turns are exact by definition. Routing them through sin/cos would hand
  // back a 1919.9999999999998px canvas and a half-pixel blur on every 90° rotate —
  // the single most common case.
  if (angle === 0 || angle === 180) return { width, height };
  if (angle === 90 || angle === 270) return { width: height, height: width };

  const radians = (angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return {
    width: Math.round(width * cos + height * sin),
    height: Math.round(width * sin + height * cos),
  };
}

/** A decoded still the 2D context can draw, with its intrinsic size known. */
export type DrawableImage = CanvasImageSource & { width: number; height: number };

type Ctx2d = OffscreenCanvasRenderingContext2D;

/** One canvas + its context, or a clear failure. Every op starts here. */
function createCanvas(width: number, height: number): { canvas: OffscreenCanvas; ctx: Ctx2d } {
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(width)),
    Math.max(1, Math.round(height)),
  );
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create a 2D canvas context');
  return { canvas, ctx };
}

/** `willReadFrequently` on the per-pixel path: without it Chromium keeps the canvas
 *  GPU-backed and every `getImageData` pays a readback. */
function createReadableCanvas(
  width: number,
  height: number,
): { canvas: OffscreenCanvas; ctx: Ctx2d } {
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(width)),
    Math.max(1, Math.round(height)),
  );
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This browser could not create a 2D canvas context');
  return { canvas, ctx };
}

/** A copy of `source`, optionally through a CSS filter string. */
function drawToCanvas(source: DrawableImage, filter?: string): OffscreenCanvas {
  const { canvas, ctx } = createCanvas(source.width, source.height);
  if (filter) ctx.filter = filter;
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function readPixels(source: DrawableImage): {
  canvas: OffscreenCanvas;
  ctx: Ctx2d;
  image: ImageData;
} {
  const { canvas, ctx } = createReadableCanvas(source.width, source.height);
  ctx.drawImage(source, 0, 0);
  return { canvas, ctx, image: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

/** Rec. 709 luma, 0..1. The weighting humans actually see, not a channel mean. */
const luma = (r: number, g: number, b: number): number =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** The largest possible RGB distance — mirrors `chromaKey.ts` so the two agree. */
const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 * 255);

/** 0..1 distance of one pixel from `key`, on the same scale a chroma key uses. */
const colorDistance = (r: number, g: number, b: number, key: RgbColor): number =>
  Math.sqrt((r - key.r) ** 2 + (g - key.g) ** 2 + (b - key.b) ** 2) / MAX_RGB_DISTANCE;

/**
 * How strongly a pixel counts as "this colour": 1 inside `tolerance`, ramping to 0
 * across `softness`. The complement of the alpha a chroma key would leave, so an
 * isolate and a remove of the same colour are exact opposites rather than two
 * independently-tuned thresholds that disagree at the edges.
 */
export function colorMembership(distance: number, tolerance: number, softness: number): number {
  if (distance <= tolerance) return 1;
  const outer = tolerance + softness;
  if (distance >= outer) return 0;
  return 1 - (distance - tolerance) / softness;
}

// ---------------------------------------------------------------------------
// Colour grade
// ---------------------------------------------------------------------------

export interface ColorGradeConfig {
  readonly brightness?: number;
  readonly contrast?: number;
  readonly saturation?: number;
  readonly hueRotate?: number;
  readonly sepia?: number;
  readonly grayscale?: number;
  readonly invert?: number;
  readonly opacity?: number;
  /**
   * −1 (cold) … +1 (warm). NOT in `ClipAdjustments`, because CSS has no warmth
   * primitive: it compiles to a sepia + hue-rotate pair below, which is the closest
   * a filter chain gets to a colour-temperature shift.
   */
  readonly warmth?: number;
}

// Moved to `effectSpec` when `ClipEffectSpec` grew its own `warmth`: one scale, one
// place. Re-exported so the `image.grade` call sites here keep their import.
export { warmthAdjustments };

/** Merge two adjustment sets, `over` winning per key. */
function mergeAdjustments(base: ClipAdjustments, over: ClipAdjustments): ClipAdjustments {
  const merged: ClipAdjustments = { ...base };
  for (const [key, value] of Object.entries(over)) {
    if (value !== undefined) (merged as Record<string, number>)[key] = value;
  }
  return merged;
}

/** The eight `filterString` adjustments a grade config carries, plus warmth. */
export function gradeAdjustments(config: ColorGradeConfig): ClipAdjustments {
  const explicit: ClipAdjustments = {
    brightness: config.brightness,
    contrast: config.contrast,
    saturation: config.saturation,
    hueRotate: config.hueRotate,
    sepia: config.sepia,
    grayscale: config.grayscale,
    invert: config.invert,
  };
  // Warmth is the BASE: an explicit hueRotate or sepia the user typed must win over
  // the one warmth derived, otherwise the two controls fight and the visible one loses.
  return mergeAdjustments(warmthAdjustments(config.warmth ?? 0), explicit);
}

export function applyColorGrade(source: DrawableImage, config: ColorGradeConfig): OffscreenCanvas {
  const { canvas, ctx } = createCanvas(source.width, source.height);
  const filter = filterString(gradeAdjustments(config));
  if (filter) ctx.filter = filter;
  const opacity = config.opacity ?? 1;
  if (opacity !== 1) ctx.globalAlpha = clamp01(opacity);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// Named filter presets
// ---------------------------------------------------------------------------

/**
 * A duotone pair. Applied as multiply(highlight) over screen(shadow) on a grayscale
 * base: multiply carries white toward the highlight tone, screen lifts black toward
 * the shadow tone. A true duotone remaps luminance through a two-stop gradient; this
 * is the two-composite approximation of it, and it is what CapCut-class filters do.
 */
export interface DuotonePair {
  readonly shadow: string;
  readonly highlight: string;
}

export interface ColorFilterPreset {
  readonly label: string;
  readonly adjustments: ClipAdjustments;
  readonly duotone?: DuotonePair;
}

/**
 * Every named look, keyed by the id the action config carries.
 *
 * The table is the UNION of the PRD's names and the ids the frozen registry enum
 * allows today (`noir | vivid | faded | warm | cool | mono`), so widening that enum is
 * a one-line contracts patch with zero work here. `mono`/`grayscale` and
 * `faded`/`fade` are deliberate aliases rather than one canonical name plus a mapper.
 */
export const COLOR_FILTER_PRESETS: Readonly<Record<string, ColorFilterPreset>> = {
  none: { label: 'None', adjustments: {} },
  grayscale: { label: 'Grayscale', adjustments: { grayscale: 1 } },
  mono: { label: 'Mono', adjustments: { grayscale: 1 } },
  sepia: { label: 'Sepia', adjustments: { sepia: 1 } },
  duotone: {
    label: 'Duotone',
    adjustments: { grayscale: 1, contrast: 1.1 },
    duotone: { shadow: '#2b1e66', highlight: '#f5c518' },
  },
  clarendon: {
    label: 'Clarendon',
    adjustments: { contrast: 1.2, saturation: 1.35, brightness: 1.1 },
  },
  moon: { label: 'Moon', adjustments: { grayscale: 1, contrast: 1.1, brightness: 1.1 } },
  nashville: {
    label: 'Nashville',
    adjustments: { sepia: 0.2, contrast: 1.2, brightness: 1.05, saturation: 1.2 },
    duotone: { shadow: '#24476e', highlight: '#f7d9b0' },
  },
  noir: { label: 'Noir', adjustments: { grayscale: 1, contrast: 1.35, brightness: 0.92 } },
  fade: { label: 'Fade', adjustments: { saturation: 0.75, contrast: 0.85, brightness: 1.1 } },
  faded: { label: 'Faded', adjustments: { saturation: 0.75, contrast: 0.85, brightness: 1.1 } },
  vivid: { label: 'Vivid', adjustments: { saturation: 1.4, contrast: 1.12 } },
  warm: { label: 'Warm', adjustments: { sepia: 0.3, saturation: 1.2, brightness: 1.03 } },
  cool: { label: 'Cool', adjustments: { hueRotate: -12, saturation: 1.1, brightness: 1.02 } },
};

/** Where each adjustment sits when nothing is applied — what intensity 0 must reach. */
const ADJUSTMENT_IDENTITY: Required<
  Pick<
    ClipAdjustments,
    | 'brightness'
    | 'contrast'
    | 'saturation'
    | 'grayscale'
    | 'sepia'
    | 'hueRotate'
    | 'blur'
    | 'invert'
  >
> = {
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
 * A preset dialled back toward doing nothing. Each adjustment is interpolated from its
 * IDENTITY value, not from zero — scaling `brightness: 1.1` by 0.5 has to give 1.05,
 * and multiplying it would give 0.55, i.e. a preset that darkens as you weaken it.
 */
export function scaleAdjustments(adjustments: ClipAdjustments, intensity: number): ClipAdjustments {
  const amount = clamp01(intensity);
  const scaled: ClipAdjustments = {};
  for (const [key, value] of Object.entries(adjustments)) {
    if (typeof value !== 'number') continue;
    const identity = ADJUSTMENT_IDENTITY[key as keyof typeof ADJUSTMENT_IDENTITY] ?? 0;
    (scaled as Record<string, number>)[key] = identity + (value - identity) * amount;
  }
  return scaled;
}

export interface ColorFilterConfig {
  readonly preset: string;
  readonly intensity?: number;
}

export function applyColorFilter(
  source: DrawableImage,
  config: ColorFilterConfig,
): OffscreenCanvas {
  const preset = COLOR_FILTER_PRESETS[config.preset] ?? COLOR_FILTER_PRESETS.none;
  const intensity = config.intensity ?? 1;
  const graded = drawToCanvas(
    source,
    filterString(scaleAdjustments(preset.adjustments, intensity)),
  );
  if (!preset.duotone || intensity <= 0) return graded;

  const { canvas, ctx } = createCanvas(graded.width, graded.height);
  ctx.drawImage(graded, 0, 0);
  ctx.globalAlpha = clamp01(intensity);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = preset.duotone.highlight;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = preset.duotone.shadow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Both fills painted the whole rect, transparent pixels included. Masking back to
  // the source alpha is what keeps a duotone off a knocked-out background.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(graded, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// Tint
// ---------------------------------------------------------------------------

/** The blend modes a tint offers. All four are canvas `globalCompositeOperation`
 *  values AND CSS `mix-blend-mode` values, so a preview could show them unchanged. */
export type TintBlend = 'multiply' | 'screen' | 'overlay' | 'soft-light';

export interface ColorTintConfig {
  readonly color: string;
  /** 0..1. The registry calls this `amount`; both names are accepted below. */
  readonly intensity?: number;
  readonly amount?: number;
  readonly blend?: TintBlend;
}

export function applyColorTint(source: DrawableImage, config: ColorTintConfig): OffscreenCanvas {
  const amount = clamp01(config.intensity ?? config.amount ?? 0);
  const { canvas, ctx } = createCanvas(source.width, source.height);
  ctx.drawImage(source, 0, 0);
  if (amount <= 0) return canvas;

  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = config.blend ?? 'multiply';
  ctx.fillStyle = config.color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // `fillRect` ignores the source's alpha channel, so a tint would otherwise paint a
  // solid slab over everything the image left transparent.
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(source, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// Filter colour — isolate / replace / remove
// ---------------------------------------------------------------------------

export type FilterColorMode = 'remove' | 'isolate' | 'replace';

export interface FilterColorConfig {
  readonly color: string;
  readonly tolerance?: number;
  readonly softness?: number;
  readonly mode?: FilterColorMode;
  /** `replace` only: what the matched pixels become. */
  readonly replacement?: string;
}

/**
 * One colour, three verbs — the same membership function each time, so the three modes
 * agree pixel for pixel about what "this colour" means.
 *
 *   remove  — background removal / greenscreen: matched pixels lose alpha.
 *   isolate — keep only the matched colour, everything else goes transparent.
 *   replace — colour swap: matched pixels take `replacement`, alpha untouched.
 */
export function applyFilterColor(
  source: DrawableImage,
  config: FilterColorConfig,
): OffscreenCanvas {
  const key = parseHexColor(config.color);
  const { canvas, ctx, image } = readPixels(source);
  // An unparseable colour is a no-op rather than a failed render: stored node config
  // must never take a canvas down.
  if (!key) return canvas;

  const tolerance = clamp01(config.tolerance ?? 0.3);
  const softness = clamp01(config.softness ?? 0.1);
  const mode = config.mode ?? 'remove';
  const replacement = mode === 'replace' ? parseHexColor(config.replacement ?? '') : undefined;
  const { data } = image;

  for (let i = 0; i < data.length; i += 4) {
    const membership = colorMembership(
      colorDistance(data[i], data[i + 1], data[i + 2], key),
      tolerance,
      softness,
    );
    if (membership <= 0 && mode !== 'isolate') continue;

    if (mode === 'remove') {
      data[i + 3] = data[i + 3] * (1 - membership);
    } else if (mode === 'isolate') {
      data[i + 3] = data[i + 3] * membership;
    } else if (replacement) {
      data[i] = data[i] + (replacement.r - data[i]) * membership;
      data[i + 1] = data[i + 1] + (replacement.g - data[i + 1]) * membership;
      data[i + 2] = data[i + 2] + (replacement.b - data[i + 2]) * membership;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// Blur family
// ---------------------------------------------------------------------------

export type BlurKind =
  | 'gaussian'
  | 'box'
  | 'motion'
  | 'radial'
  | 'bilateral'
  | 'bokeh'
  | 'tiltShift'
  | 'targetColor';

export interface BlurConfig {
  readonly kind?: BlurKind;
  readonly radiusPx: number;
  /** `motion`: the direction of travel, degrees clockwise from horizontal. */
  readonly angleDeg?: number;
  /** `radial`: the point everything blurs away from, 0..1 of each axis. */
  readonly centerX?: number;
  readonly centerY?: number;
  /** `tiltShift`: the in-focus band, 0..1 of the height. */
  readonly focusY?: number;
  readonly focusHeight?: number;
  /** `bilateral`: how big a luma step counts as an edge worth preserving, 0..1. */
  readonly edgeThreshold?: number;
  /** `targetColor`: which colour gets blurred. */
  readonly color?: string;
  readonly tolerance?: number;
  readonly softness?: number;
}

/** The browser's own Gaussian. The only exact member of the family. */
function gaussianBlur(source: DrawableImage, radius: number): OffscreenCanvas {
  return drawToCanvas(source, radius > 0 ? `blur(${radius}px)` : undefined);
}

/**
 * A true separable box blur — two running-sum passes, O(pixels) regardless of radius.
 *
 * Not an approximation of a box blur; it IS one, and it is visibly different from
 * Gaussian (harder edges, a faint cross artefact on point highlights), which is the
 * reason to offer both.
 *
 * ponytail: channels are summed un-premultiplied. On a fully opaque still that is
 * exact; on a partially transparent one it lets colour bleed out of transparent
 * pixels. Premultiply first if that ever shows up.
 */
export function boxBlurImageData(image: ImageData, radius: number): void {
  const r = Math.max(0, Math.floor(radius));
  if (r === 0) return;
  const { data, width, height } = image;
  const span = r * 2 + 1;
  const scratch = new Uint8ClampedArray(data.length);

  const pass = (src: Uint8ClampedArray, dst: Uint8ClampedArray, horizontal: boolean): void => {
    const outer = horizontal ? height : width;
    const inner = horizontal ? width : height;
    const step = horizontal ? 4 : width * 4;
    for (let o = 0; o < outer; o += 1) {
      const base = horizontal ? o * width * 4 : o * 4;
      const sums = [0, 0, 0, 0];
      // Prime the window with the clamped-edge neighbourhood of index 0.
      for (let k = -r; k <= r; k += 1) {
        const index = base + Math.min(inner - 1, Math.max(0, k)) * step;
        for (let c = 0; c < 4; c += 1) sums[c] += src[index + c];
      }
      for (let i = 0; i < inner; i += 1) {
        const out = base + i * step;
        for (let c = 0; c < 4; c += 1) dst[out + c] = sums[c] / span;
        const leaving = base + Math.min(inner - 1, Math.max(0, i - r)) * step;
        const entering = base + Math.min(inner - 1, Math.max(0, i + r + 1)) * step;
        for (let c = 0; c < 4; c += 1) sums[c] += src[entering + c] - src[leaving + c];
      }
    }
  };

  pass(data, scratch, true);
  pass(scratch, data, false);
}

function boxBlur(source: DrawableImage, radius: number): OffscreenCanvas {
  const { canvas, ctx, image } = readPixels(source);
  boxBlurImageData(image, radius);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * The number of taps a directional blur samples. The kernel IS the tap set, so one tap
 * per pixel of travel is exact; the cap is what keeps a 200px radius from costing 200
 * full-frame draws.
 */
const tapsFor = (radius: number): number => Math.max(2, Math.min(48, Math.round(radius)));

/**
 * `globalAlpha` for a running mean: the i-th of n draws must contribute 1/(i+1) for
 * the accumulated result to be the average of all i+1. A constant 1/n instead
 * over-weights the last taps and leaves a visible ghost at one end of the streak.
 */
const runningMeanAlpha = (index: number): number => 1 / (index + 1);

function motionBlur(source: DrawableImage, radius: number, angleDeg: number): OffscreenCanvas {
  const { canvas, ctx } = createCanvas(source.width, source.height);
  const taps = tapsFor(radius);
  const radians = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(radians) * radius;
  const dy = Math.sin(radians) * radius;
  for (let i = 0; i < taps; i += 1) {
    const t = i / (taps - 1) - 0.5;
    ctx.globalAlpha = runningMeanAlpha(i);
    ctx.drawImage(source, dx * t, dy * t);
  }
  return canvas;
}

function radialBlur(
  source: DrawableImage,
  radius: number,
  centerX: number,
  centerY: number,
): OffscreenCanvas {
  const { canvas, ctx } = createCanvas(source.width, source.height);
  const taps = tapsFor(radius);
  const cx = centerX * source.width;
  const cy = centerY * source.height;
  // Radius expressed as a zoom: 100px of blur on a 1000px frame is a 10% push.
  const maxScale = 1 + radius / Math.max(1, Math.min(source.width, source.height));
  for (let i = 0; i < taps; i += 1) {
    const scale = 1 + (maxScale - 1) * (i / (taps - 1));
    ctx.save();
    ctx.globalAlpha = runningMeanAlpha(i);
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  }
  return canvas;
}

/**
 * Edge-preserving smoothing in one pass: blur everything, then fade the blur back out
 * wherever the local luma changed a lot.
 *
 * Honest about what it is not: a real bilateral filter weights every tap in the kernel
 * by both distance AND intensity difference. This blends two finished images by their
 * luma delta, which preserves strong edges (its whole point) but cannot stop colour
 * bleeding across a soft one. Good enough for skin/sky smoothing on a still; not a
 * denoiser.
 */
function bilateralBlur(
  source: DrawableImage,
  radius: number,
  edgeThreshold: number,
): OffscreenCanvas {
  const blurred = gaussianBlur(source, radius);
  const original = readPixels(source);
  const blurRead = readPixels(blurred);
  const a = original.image.data;
  const b = blurRead.image.data;
  const edge = Math.max(0.01, clamp01(edgeThreshold));

  for (let i = 0; i < a.length; i += 4) {
    const delta = Math.abs(luma(a[i], a[i + 1], a[i + 2]) - luma(b[i], b[i + 1], b[i + 2]));
    // 1 in flat regions (take the blur), 0 at an edge (keep the original).
    const weight = 1 - Math.min(1, delta / edge);
    a[i] += (b[i] - a[i]) * weight;
    a[i + 1] += (b[i + 1] - a[i + 1]) * weight;
    a[i + 2] += (b[i + 2] - a[i + 2]) * weight;
  }
  original.ctx.putImageData(original.image, 0, 0);
  return original.canvas;
}

/**
 * Blur plus a bloom on the highlights.
 *
 * Honest about what it is not: real bokeh takes the SHAPE of the lens aperture, so
 * point highlights become hexagons or circles. This blurs a brightness-thresholded
 * copy and screens it back, which reproduces the glow but not the shape.
 */
function bokehBlur(source: DrawableImage, radius: number): OffscreenCanvas {
  const base = gaussianBlur(source, radius);
  const highlights = drawToCanvas(source, `brightness(1.7) contrast(3) blur(${radius * 1.4}px)`);
  const { canvas, ctx } = createCanvas(base.width, base.height);
  ctx.drawImage(base, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.35;
  ctx.drawImage(highlights, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/** Sharp inside a horizontal band, blurred above and below it — the miniature look. */
function tiltShiftBlur(
  source: DrawableImage,
  radius: number,
  focusY: number,
  focusHeight: number,
): OffscreenCanvas {
  const blurred = gaussianBlur(source, radius);
  const height = source.height;
  const centre = clamp01(focusY) * height;
  const half = Math.max(1, (clamp01(focusHeight) * height) / 2);

  // The blurred layer, masked to fade OUT across the focus band.
  const masked = createCanvas(source.width, height);
  masked.ctx.drawImage(blurred, 0, 0);
  masked.ctx.globalCompositeOperation = 'destination-out';
  const gradient = masked.ctx.createLinearGradient(0, 0, 0, height);
  const stops: [number, string][] = [
    [0, 'rgba(0,0,0,0)'],
    [clamp01((centre - half * 2) / height), 'rgba(0,0,0,0)'],
    [clamp01((centre - half) / height), 'rgba(0,0,0,1)'],
    [clamp01((centre + half) / height), 'rgba(0,0,0,1)'],
    [clamp01((centre + half * 2) / height), 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0)'],
  ];
  // addColorStop throws on an out-of-order offset, which a tall focus band can produce.
  let previous = -1;
  for (const [offset, colour] of stops) {
    const at = Math.max(previous, offset);
    gradient.addColorStop(at, colour);
    previous = at;
  }
  masked.ctx.fillStyle = gradient;
  masked.ctx.fillRect(0, 0, source.width, height);

  const { canvas, ctx } = createCanvas(source.width, height);
  ctx.drawImage(source, 0, 0);
  ctx.drawImage(masked.canvas, 0, 0);
  return canvas;
}

/** Blur only what matches a colour — the sibling of `filterColor`, same membership. */
function targetColorBlur(source: DrawableImage, config: BlurConfig): OffscreenCanvas {
  const key = parseHexColor(config.color ?? '');
  if (!key) return gaussianBlur(source, config.radiusPx);

  const blurred = readPixels(gaussianBlur(source, config.radiusPx));
  const original = readPixels(source);
  const tolerance = clamp01(config.tolerance ?? 0.3);
  const softness = clamp01(config.softness ?? 0.1);
  const a = original.image.data;
  const b = blurred.image.data;

  for (let i = 0; i < a.length; i += 4) {
    const membership = colorMembership(
      colorDistance(a[i], a[i + 1], a[i + 2], key),
      tolerance,
      softness,
    );
    if (membership <= 0) continue;
    a[i] += (b[i] - a[i]) * membership;
    a[i + 1] += (b[i + 1] - a[i + 1]) * membership;
    a[i + 2] += (b[i + 2] - a[i + 2]) * membership;
  }
  original.ctx.putImageData(original.image, 0, 0);
  return original.canvas;
}

export function applyBlur(source: DrawableImage, config: BlurConfig): OffscreenCanvas {
  const radius = Math.max(0, config.radiusPx);
  if (radius === 0) return drawToCanvas(source);

  switch (config.kind ?? 'gaussian') {
    case 'box':
      return boxBlur(source, radius);
    case 'motion':
      return motionBlur(source, radius, config.angleDeg ?? 0);
    case 'radial':
      return radialBlur(source, radius, config.centerX ?? 0.5, config.centerY ?? 0.5);
    case 'bilateral':
      return bilateralBlur(source, radius, config.edgeThreshold ?? 0.12);
    case 'bokeh':
      return bokehBlur(source, radius);
    case 'tiltShift':
      return tiltShiftBlur(source, radius, config.focusY ?? 0.5, config.focusHeight ?? 0.25);
    case 'targetColor':
      return targetColorBlur(source, config);
    default:
      return gaussianBlur(source, radius);
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export interface RotateOptions {
  /** Grow the canvas to the rotated bounding box. Off = keep the source's dimensions
   *  and let the corners fall outside. Defaults on. */
  readonly expand?: boolean;
  /** Fill behind the rotated frame. Undefined leaves the corners transparent. */
  readonly background?: string;
}

/** Rotates a decoded image by `degrees` clockwise, returning a new bitmap-backed canvas. */
export async function rotateImage(
  source: DrawableImage,
  degrees: number,
  options?: RotateOptions,
): Promise<OffscreenCanvas> {
  const expand = options?.expand ?? true;
  const bounds = expand
    ? rotatedBounds(source.width, source.height, degrees)
    : { width: source.width, height: source.height };
  const { canvas, ctx } = createCanvas(bounds.width, bounds.height);

  if (options?.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, bounds.width, bounds.height);
  }

  // Rotate about the output centre and draw the source centred on it, so the
  // corners land inside the bounding box computed above whatever the angle.
  ctx.translate(bounds.width / 2, bounds.height / 2);
  ctx.rotate((normaliseDegrees(degrees) * Math.PI) / 180);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return canvas;
}

export interface FlipConfig {
  readonly horizontal?: boolean;
  readonly vertical?: boolean;
}

export function flipImage(source: DrawableImage, config: FlipConfig): OffscreenCanvas {
  const { canvas, ctx } = createCanvas(source.width, source.height);
  const sx = config.horizontal ? -1 : 1;
  const sy = config.vertical ? -1 : 1;
  ctx.translate(sx < 0 ? source.width : 0, sy < 0 ? source.height : 0);
  ctx.scale(sx, sy);
  ctx.drawImage(source, 0, 0);
  return canvas;
}

/** Crop the centre of the image to `aspectRatio` (`16:9`). Never upscales. */
export function cropToAspect(source: DrawableImage, aspect: number): OffscreenCanvas {
  const plan = planCropToAspect(source.width, source.height, aspect);
  const { canvas, ctx } = createCanvas(plan.width, plan.height);
  ctx.drawImage(
    source,
    plan.source.x,
    plan.source.y,
    plan.source.width,
    plan.source.height,
    plan.destination.x,
    plan.destination.y,
    plan.destination.width,
    plan.destination.height,
  );
  return canvas;
}

/** Fit the image inside `aspectRatio`, filling the new margins. Never upscales. */
export function padToAspect(
  source: DrawableImage,
  aspect: number,
  background: string,
): OffscreenCanvas {
  const plan = planPadToAspect(source.width, source.height, aspect);
  const { canvas, ctx } = createCanvas(plan.width, plan.height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, plan.width, plan.height);
  ctx.drawImage(
    source,
    plan.destination.x,
    plan.destination.y,
    plan.destination.width,
    plan.destination.height,
  );
  return canvas;
}

// ---------------------------------------------------------------------------
// Duplicate
// ---------------------------------------------------------------------------

/** How many copies a duplicate op may emit. The collection fan-out caps at 100, so a
 *  larger number would be silently truncated downstream — refuse it here instead. */
export const MAX_DUPLICATE_COPIES = 100;

/**
 * N copies of one value. A pure graph op: the pixels are not touched, only the arity
 * of the wire is. Deliberately NOT a canvas op — duplicating bytes N times to prove a
 * node emitted N items is pure waste; downstream consumers each get the same reference
 * and each does its own work.
 */
export function duplicateValue<T>(value: T, count: number): T[] {
  const copies = Math.max(1, Math.min(MAX_DUPLICATE_COPIES, Math.floor(count) || 1));
  return Array.from({ length: copies }, () => value);
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** Chunked so a large frame does not blow the argument limit of String.fromCharCode. */
function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

/** The bridge from an op's canvas output to the data URL a `NodeOutput` carries. */
export async function canvasToDataUrl(
  canvas: OffscreenCanvas,
  mimeType = 'image/png',
): Promise<string> {
  const blob = await canvas.convertToBlob({ type: mimeType });
  // `blob.type` wins: a browser that cannot encode the requested type silently
  // hands back a PNG, and mislabelling that would break every consumer downstream.
  return buildDataUrl(
    blob.type || mimeType,
    bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
  );
}
