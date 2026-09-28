import type { HyperframesLayoutMetrics, HyperframesTemporalMetrics } from '../hyperframes-agent';

/**
 * The HyperFrames review evidence the canvas agent's review/repair loop reads — frames,
 * the scene contact sheet, dense temporal metrics and the copy's layout — computed by the
 * SAME functions whether the browser or Continuum Render produced the frames. Browser-only
 * (canvas, DOM): not exported from the package root.
 */

const DUPLICATE_MAD = 1.5;
const SCENE_CHANGE_MAD = 12;
const REVIEW_SAMPLE_FPS = 10;
/**
 * Motion is read at 480 px on the long side, per pixel, before any shader: a mean over the
 * 32x18 sample (the MAD) cannot see a thin progress bar or a small entrance, so films with
 * both were judged frozen; and film grain re-seeds every frame, so it is sampled first.
 * A frame is still when fewer than MOTION_MIN_PIXELS moved more than MOTION_PIXEL_DELTA.
 */
const MOTION_LONG_SIDE = 480;
const MOTION_PIXEL_DELTA = 2;
const MOTION_MIN_PIXELS = 3;

type ReviewScene = { id: string; start_seconds: number; duration_seconds: number };
type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const createCanvas = (
  width: number,
  height: number,
): HTMLCanvasElement | OffscreenCanvas => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

/** Pixels of two motion samples that differ past the noise floor. */
export const changedPixels = (previous: Uint8Array, current: Uint8Array): number => {
  let changed = 0;
  for (let pixel = 0; pixel < current.length; pixel += 1) {
    if (Math.abs((current[pixel] ?? 0) - (previous[pixel] ?? 0)) > MOTION_PIXEL_DELTA) changed += 1;
  }
  return changed;
};

/**
 * `motionPixels[i]`: pixels changed between dense samples i and i + 1 (`changedPixels` over
 * `motionLuma`). Without it, frozen intervals and entrances fall back to the frame mean.
 */
export function buildTemporalMetrics(
  samples: readonly Uint8Array[],
  sampleFps: number,
  scenes: readonly ReviewScene[],
  motionPixels?: readonly number[],
): HyperframesTemporalMetrics {
  const adjacentFrameMad = samples.slice(1).map((sample, index) => {
    const previous = samples[index];
    if (!previous || previous.length !== sample.length || sample.length === 0) return 0;
    let difference = 0;
    for (let pixel = 0; pixel < sample.length; pixel += 1) {
      difference += Math.abs((sample[pixel] ?? 0) - (previous[pixel] ?? 0));
    }
    return difference / sample.length;
  });
  const moving = (index: number): boolean =>
    motionPixels
      ? (motionPixels[index] ?? 0) >= MOTION_MIN_PIXELS
      : (adjacentFrameMad[index] ?? 0) > DUPLICATE_MAD;
  const frozenIntervals: HyperframesTemporalMetrics['frozenIntervals'] = [];
  let frozenStart: number | null = null;
  adjacentFrameMad.forEach((_, index) => {
    if (!moving(index) && frozenStart === null) frozenStart = index / sampleFps;
    if (moving(index) && frozenStart !== null) {
      frozenIntervals.push({
        startSeconds: frozenStart,
        durationSeconds: index / sampleFps - frozenStart,
      });
      frozenStart = null;
    }
  });
  if (frozenStart !== null) {
    frozenIntervals.push({
      startSeconds: frozenStart,
      durationSeconds: adjacentFrameMad.length / sampleFps - frozenStart,
    });
  }
  const entranceMotionSceneIds = scenes.flatMap((scene) => {
    const entranceEnd = scene.start_seconds + Math.min(1, scene.duration_seconds);
    const entered = adjacentFrameMad.some((_, index) => {
      const timestamp = (index + 1) / sampleFps;
      return timestamp >= scene.start_seconds && timestamp <= entranceEnd && moving(index);
    });
    return entered ? [scene.id] : [];
  });
  return {
    sampleFps,
    adjacentFrameMad,
    sceneChanges: adjacentFrameMad.filter((difference) => difference >= SCENE_CHANGE_MAD).length,
    duplicateFrameCount: adjacentFrameMad.filter((difference) => difference <= DUPLICATE_MAD)
      .length,
    longestFrozenSeconds: Math.max(
      0,
      ...frozenIntervals.map((interval) => interval.durationSeconds),
    ),
    frozenIntervals,
    entranceMotionSceneIds,
  };
}

export const contactSheetSampleIndexes = (
  scenes: readonly { start_seconds: number; duration_seconds: number }[],
  sampleFps: number,
  sampleCount: number,
): number[] =>
  scenes.map((scene) =>
    Math.min(
      sampleCount - 1,
      Math.round((scene.start_seconds + scene.duration_seconds / 2) * sampleFps),
    ),
  );

/**
 * Which times a review visits: a dense 10 fps sampling for the temporal metrics and the
 * contact sheet, plus the requested stills, of which at most four (first, last, every
 * odd one between) come back as frames and are measured for layout.
 */
export function reviewPlan(durationSeconds: number, timestampsSeconds: readonly number[]) {
  const sampleFps = REVIEW_SAMPLE_FPS;
  const last = Math.max(0, durationSeconds - 1 / sampleFps);
  const denseTimestamps = Array.from(
    { length: Math.max(1, Math.ceil(durationSeconds * sampleFps)) },
    (_, index) => Math.min(last, index / sampleFps),
  );
  const timestamps = [...new Set([...denseTimestamps, ...timestampsSeconds])].sort(
    (left, right) => left - right,
  );
  const frameTimestampsSeconds = timestampsSeconds
    .filter((_, index, values) => index === 0 || index === values.length - 1 || index % 2 === 1)
    .slice(0, 4);
  return { sampleFps, denseTimestamps, timestamps, frameTimestampsSeconds };
}

const lumaAt = (
  source: HTMLCanvasElement | OffscreenCanvas,
  width: number,
  height: number,
): Uint8Array => {
  const sample = createCanvas(width, height);
  const context = sample.getContext('2d') as Canvas2D | null;
  if (!context) throw new Error('Review sample context is unavailable.');
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const luma = new Uint8Array(width * height);
  for (let index = 0; index < luma.length; index += 1) {
    const offset = index * 4;
    luma[index] = Math.round(
      (pixels[offset] ?? 0) * 0.2126 +
        (pixels[offset + 1] ?? 0) * 0.7152 +
        (pixels[offset + 2] ?? 0) * 0.0722,
    );
  }
  return luma;
};

/** 32×18 Rec. 709 luma of a frame: the sample for scene changes and duplicates. */
export const canvasLuma = (source: HTMLCanvasElement | OffscreenCanvas): Uint8Array =>
  lumaAt(source, 32, 18);

/** Luma at MOTION_LONG_SIDE on the long side: the sample `changedPixels` compares. */
export const motionLuma = (source: HTMLCanvasElement | OffscreenCanvas): Uint8Array => {
  const scale = MOTION_LONG_SIDE / Math.max(source.width, source.height);
  return lumaAt(
    source,
    Math.max(1, Math.round(source.width * scale)),
    Math.max(1, Math.round(source.height * scale)),
  );
};

/** The scene contact sheet: six 240×180 tiles a row, each drawn from its scene's midpoint sample. */
export function motionStrip(
  scenes: readonly ReviewScene[],
  sampleFps: number,
  sampleCount: number,
) {
  const tiles = contactSheetSampleIndexes(scenes, sampleFps, sampleCount);
  const canvas = createCanvas(1440, Math.ceil(tiles.length / 6) * 180);
  const context = canvas.getContext('2d') as Canvas2D | null;
  if (!context) throw new Error('Review motion-strip context is unavailable.');
  context.fillStyle = '#0b0b0b';
  context.fillRect(0, 0, canvas.width, canvas.height);
  return {
    canvas,
    /** Draw dense sample `sampleIndex` into every tile that chose it. */
    draw(
      source: HTMLCanvasElement | OffscreenCanvas,
      sampleIndex: number,
      width: number,
      height: number,
    ) {
      for (const [tile, selected] of tiles.entries()) {
        if (selected !== sampleIndex) continue;
        const scale = Math.min(240 / width, 180 / height);
        const x = (tile % 6) * 240;
        const y = Math.floor(tile / 6) * 180;
        context.drawImage(
          source,
          x + (240 - width * scale) / 2,
          y + (180 - height * scale) / 2,
          width * scale,
          height * scale,
        );
        context.fillStyle = 'rgba(0,0,0,0.75)';
        context.fillRect(x, y + 158, 240, 22);
        context.fillStyle = '#ffffff';
        context.font = '12px sans-serif';
        context.fillText(`${tile + 1}. ${scenes[tile]?.id ?? ''}`, x + 6, y + 173);
      }
    },
  };
}

const parseRgb = (value: string): [number, number, number] | null => {
  const channels = value
    .match(/[\d.]+/g)
    ?.slice(0, 3)
    .map(Number);
  return channels?.length === 3 ? (channels as [number, number, number]) : null;
};

const relativeLuminance = ([red, green, blue]: [number, number, number]): number =>
  [red, green, blue]
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
    .reduce((sum, channel, index) => sum + channel * ([0.2126, 0.7152, 0.0722][index] ?? 0), 0);

const contrastRatio = (foreground: string, background: string): number | null => {
  const foregroundRgb = parseRgb(foreground);
  const backgroundRgb = parseRgb(background);
  if (!foregroundRgb || !backgroundRgb) return null;
  const [bright, dark] = [relativeLuminance(foregroundRgb), relativeLuminance(backgroundRgb)].sort(
    (left, right) => right - left,
  );
  return ((bright ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
};

/** Every `[data-hf-copy]` element at the document's current time: out of frame, or under 3:1. */
/**
 * Copy the viewer can see at this instant: rendered, not visibility-hidden, at least half
 * opaque through its ancestors, with a box. Copy in a scene outside its window is hidden and
 * often parked off-frame for its entrance, so judging it reported clipped, unreadable titles
 * that were never on screen. Render's probeLayout applies the same rule.
 */
export const isShownCopy = (
  chain: readonly Pick<CSSStyleDeclaration, 'display' | 'visibility' | 'opacity'>[],
  box: { width: number; height: number },
): boolean =>
  chain.every((style) => style.display !== 'none' && style.visibility !== 'hidden') &&
  chain.reduce((opacity, style) => opacity * Number(style.opacity), 1) >= 0.5 &&
  box.width >= 2 &&
  box.height >= 2;

export const measureLayout = (doc: Document, view: Window): HyperframesLayoutMetrics => {
  const clippedTextIds = new Set<string>();
  const lowContrastTextIds = new Set<string>();
  for (const element of Array.from(doc.querySelectorAll<HTMLElement>('[data-hf-copy]'))) {
    const id = element.dataset.hfId ?? element.id;
    const rect = element.getBoundingClientRect();
    const chain: CSSStyleDeclaration[] = [];
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      chain.push(view.getComputedStyle(node));
    }
    if (!isShownCopy(chain, rect)) continue;
    if (
      rect.left < 0 ||
      rect.top < 0 ||
      rect.right > view.innerWidth ||
      rect.bottom > view.innerHeight
    ) {
      clippedTextIds.add(id);
    }
    const style = view.getComputedStyle(element);
    let background = 'rgb(255, 255, 255)';
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const candidate = view.getComputedStyle(parent).backgroundColor;
      if (candidate && candidate !== 'rgba(0, 0, 0, 0)' && candidate !== 'transparent') {
        background = candidate;
        break;
      }
    }
    const ratio = contrastRatio(style.color, background);
    if (ratio !== null && ratio < 3) lowContrastTextIds.add(id);
  }
  return {
    clippedTextIds: [...clippedTextIds],
    lowContrastTextIds: [...lowContrastTextIds],
    missingFontFamilies: doc.fonts.status === 'loaded' ? [] : ['document-fonts'],
  };
};
