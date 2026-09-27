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

export function buildTemporalMetrics(
  samples: readonly Uint8Array[],
  sampleFps: number,
  scenes: readonly ReviewScene[],
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
  const frozenIntervals: HyperframesTemporalMetrics['frozenIntervals'] = [];
  let frozenStart: number | null = null;
  adjacentFrameMad.forEach((difference, index) => {
    if (difference <= DUPLICATE_MAD && frozenStart === null) frozenStart = index / sampleFps;
    if (difference > DUPLICATE_MAD && frozenStart !== null) {
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
    const moving = adjacentFrameMad.some((difference, index) => {
      const timestamp = (index + 1) / sampleFps;
      return (
        timestamp >= scene.start_seconds && timestamp <= entranceEnd && difference > DUPLICATE_MAD
      );
    });
    return moving ? [scene.id] : [];
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

/** 32×18 Rec. 709 luma of a frame: the temporal metrics' sample. */
export const canvasLuma = (source: HTMLCanvasElement | OffscreenCanvas): Uint8Array => {
  const sample = createCanvas(32, 18);
  const context = sample.getContext('2d') as Canvas2D | null;
  if (!context) throw new Error('Review sample context is unavailable.');
  context.drawImage(source, 0, 0, 32, 18);
  const pixels = context.getImageData(0, 0, 32, 18).data;
  const luma = new Uint8Array(32 * 18);
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
export const measureLayout = (doc: Document, view: Window): HyperframesLayoutMetrics => {
  const clippedTextIds = new Set<string>();
  const lowContrastTextIds = new Set<string>();
  for (const element of Array.from(doc.querySelectorAll<HTMLElement>('[data-hf-copy]'))) {
    const id = element.dataset.hfId ?? element.id;
    const rect = element.getBoundingClientRect();
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
