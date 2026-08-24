import type { DrawableImage } from './imageOps';

// Frame extraction behind the `video.extractFrames` and `video.frameGrid` action ops.
// The sampling plan, the scene-change maths and the tile geometry are pure functions —
// that is the part that can be tested without a browser, and the part that actually
// gets a frame count wrong. Decoding goes through mediabunny, which is loaded lazily
// (`await import('mediabunny')`) because a static import drags the whole demuxer into
// the page bundle for every canvas visitor, extracting frames or not.

type MediabunnyModule = typeof import('mediabunny');

async function loadMediabunny(): Promise<MediabunnyModule> {
  return import('mediabunny');
}

/** The last decodable timestamp sits just inside the duration, never on it. */
const TAIL_EPSILON = 0.001;
/** ponytail: a hard sample ceiling. 240 stills is already more than any node renders; lift it when a caller proves it needs to. */
const MAX_FRAMES = 240;
/** Probe density for scene detection — dense enough to catch a cut, cheap at 64px wide. */
const SCENE_PROBES_PER_SECOND = 4;
/** Empirical: mean-abs-diff on a 64px probe. Below ~0.08 lighting flicker registers as a cut; above ~0.2 slow dissolves are missed. */
const DEFAULT_SCENE_THRESHOLD = 0.12;
const DEFAULT_PROBE_WIDTH = 64;
/** ponytail: caps a 3x3 sheet of 1080p stills at 1440px wide instead of 5760. Pass `cellWidth` for a bigger sheet. */
const DEFAULT_CELL_WIDTH = 480;

export type FrameMode = 'single' | 'evenly' | 'interval' | 'sceneChange';

export interface FrameTimesConfig {
  readonly mode: FrameMode;
  /** `evenly`: how many frames. */
  readonly count?: number;
  /** `interval`: seconds between frames — 1, 2 and 3 are the PRD's headline cases. */
  readonly intervalSec?: number;
  /** `single`: the timestamp to grab. Defaults to the midpoint. */
  readonly atSec?: number;
}

/** `count` evenly spaced bucket midpoints across `durationSec`. */
function bucketMidpoints(durationSec: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => (durationSec * (index + 0.5)) / count);
}

/** Clamps into the decodable range, drops duplicates, sorts ascending, never returns empty. */
function finalise(times: readonly number[], durationSec: number): number[] {
  const last = Math.max(0, durationSec - TAIL_EPSILON);
  const clamped = times
    .filter((time) => Number.isFinite(time))
    .map((time) => Math.min(last, Math.max(0, time)));
  const unique = [...new Set(clamped)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : [0];
}

/** The timestamps to sample, in ascending order. Never empty for a positive duration. */
export function planFrameTimes(durationSec: number, config: FrameTimesConfig): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [0];

  switch (config.mode) {
    case 'single':
      return finalise([config.atSec ?? durationSec / 2], durationSec);

    case 'interval': {
      const interval = config.intervalSec;
      // A non-positive interval would loop forever; the opening frame is the honest answer.
      if (interval === undefined || !Number.isFinite(interval) || interval <= 0) return [0];
      const times: number[] = [];
      for (let index = 0; index < MAX_FRAMES; index += 1) {
        const time = index * interval;
        // Strictly inside the duration, so a D-second clip on an i-second interval
        // yields exactly ceil(D / i) frames: 3.0s at 1s is 0,1,2 — not 0,1,2,3.
        if (time >= durationSec - 1e-9) break;
        times.push(time);
      }
      return finalise(times, durationSec);
    }

    case 'sceneChange': {
      // The DENSE PROBE GRID the detector diffs, not the final cuts — `pickSceneChanges`
      // narrows it down to the frames that actually changed.
      const probes = Math.min(
        MAX_FRAMES,
        Math.max(2, Math.ceil(durationSec * SCENE_PROBES_PER_SECOND)),
      );
      return finalise(bucketMidpoints(durationSec, probes), durationSec);
    }

    default: {
      // Midpoints of `count` equal buckets: the first frame is never at 0 and the last is
      // never at `duration`, both of which routinely fail to decode (a leading black frame,
      // a trailing timestamp past the final packet).
      const requested = config.count;
      const count =
        requested !== undefined && Number.isFinite(requested)
          ? Math.min(MAX_FRAMES, Math.max(1, Math.floor(requested)))
          : 1;
      return finalise(bucketMidpoints(durationSec, count), durationSec);
    }
  }
}

/**
 * Mean absolute per-channel difference between two equal-length RGBA buffers, 0..1.
 * The alpha byte of each quad is skipped: it is a constant 255 for opaque video and
 * would dilute every diff by a fourth, silently mis-scaling the threshold.
 */
export function meanAbsDiff(
  a: Uint8ClampedArray | Uint8Array,
  b: Uint8ClampedArray | Uint8Array,
): number {
  if (a.length !== b.length) {
    throw new Error(`Cannot diff frames of different sizes: ${a.length} vs ${b.length} bytes`);
  }
  let total = 0;
  let counted = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (index % 4 === 3) continue;
    total += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
    counted += 1;
  }
  return counted === 0 ? 0 : total / (counted * 255);
}

/**
 * Indices in `frames` where the diff against the previous frame reaches `threshold`.
 * `diffs` is parallel to the frames — `diffs[i]` is frame i against frame i-1, so
 * `diffs[0]` has no meaning and is ignored. Index 0 is ALWAYS included: the opening
 * shot is a scene.
 */
export function pickSceneChanges(diffs: readonly number[], threshold: number): number[] {
  const cuts = [0];
  for (let index = 1; index < diffs.length; index += 1) {
    const diff = diffs[index] ?? 0;
    if (diff >= threshold) cuts.push(index);
  }
  return cuts;
}

export interface FrameGridLayout {
  readonly width: number;
  readonly height: number;
  readonly cells: readonly { x: number; y: number; width: number; height: number }[];
  /**
   * Frames the grid had no room for. `cellCount` above columns×rows is TRUNCATED, and
   * this is how the caller sees it — a silent drop is the failure mode to avoid.
   */
  readonly dropped: number;
}

const positiveInt = (value: number, fallback: number): number =>
  Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;

/**
 * Tile geometry for `cellCount` frames of aspect `cellAspect` (w/h) in a rows×columns grid.
 * Gap convention: OUTER GUTTER — `gap` sits between every pair of cells AND around the
 * edge, so width is `columns*cellWidth + (columns+1)*gap`.
 */
export function computeFrameGridLayout(config: {
  cellCount: number;
  columns: number;
  rows: number;
  cellWidth: number;
  cellAspect: number;
  gap: number;
}): FrameGridLayout {
  const columns = positiveInt(config.columns, 1);
  const rows = positiveInt(config.rows, 1);
  const cellWidth = positiveInt(config.cellWidth, 1);
  const gap = Number.isFinite(config.gap) && config.gap > 0 ? Math.round(config.gap) : 0;
  const aspect =
    Number.isFinite(config.cellAspect) && config.cellAspect > 0 ? config.cellAspect : 1;
  const cellHeight = Math.max(1, Math.round(cellWidth / aspect));

  const capacity = columns * rows;
  const requested = Number.isFinite(config.cellCount)
    ? Math.max(0, Math.floor(config.cellCount))
    : 0;
  const count = Math.min(requested, capacity);

  const cells = Array.from({ length: count }, (_, index) => ({
    x: gap + (index % columns) * (cellWidth + gap),
    y: gap + Math.floor(index / columns) * (cellHeight + gap),
    width: cellWidth,
    height: cellHeight,
  }));

  return {
    width: columns * cellWidth + (columns + 1) * gap,
    height: rows * cellHeight + (rows + 1) * gap,
    cells,
    dropped: requested - count,
  };
}

// ── browser-only from here down ───────────────────────────────────────────────
// COVERAGE GAP, on purpose: everything below decodes or draws, and the test
// environment (bun + happy-dom) has neither WebCodecs nor OffscreenCanvas, so a test
// of it would only assert that the stub throws. The maths above is what actually gets
// a frame count or a tile position wrong, and it is tested exhaustively. These three
// are covered by running the node, not by this file.

type MbVideoTrack = InstanceType<MediabunnyModule['InputVideoTrack']>;
type SinkCanvas = HTMLCanvasElement | OffscreenCanvas;

/** The sink may hand back a pooled canvas it reuses on the next pull, so kept frames are copied out. */
function copyCanvas(source: SinkCanvas): OffscreenCanvas {
  const canvas = new OffscreenCanvas(source.width, source.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not create a 2D canvas context');
  context.drawImage(source, 0, 0);
  return canvas;
}

function readPixels(canvas: SinkCanvas): Uint8ClampedArray {
  const context = (canvas as HTMLCanvasElement).getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser could not create a 2D canvas context');
  return context.getImageData(0, 0, canvas.width, canvas.height).data;
}

const sinkOptions = (width?: number) =>
  width && width > 0 ? { width: Math.floor(width), fit: 'contain' as const } : {};

/** Decodes the given ascending timestamps in one pass — the sink decodes each packet at most once. */
async function decodeAt(
  mb: MediabunnyModule,
  track: MbVideoTrack,
  times: readonly number[],
  maxWidth: number | undefined,
): Promise<OffscreenCanvas[]> {
  const sink = new mb.CanvasSink(track, sinkOptions(maxWidth));
  const frames: OffscreenCanvas[] = [];
  for await (const wrapped of sink.canvasesAtTimestamps(times)) {
    if (wrapped) frames.push(copyCanvas(wrapped.canvas));
  }
  return frames;
}

/** Decoded stills at the planned timestamps. Each is an independent OffscreenCanvas. */
export async function extractFrames(
  blob: Blob,
  config: FrameTimesConfig & { maxWidth?: number },
): Promise<OffscreenCanvas[]> {
  const mb = await loadMediabunny();
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('This clip has no video track to pull frames from');
    const duration = await input.computeDuration();
    return await decodeAt(mb, track, planFrameTimes(duration, config), config.maxWidth);
  } finally {
    input.dispose();
  }
}

/**
 * Scene-change stills: probe densely, diff consecutive downscaled samples, keep the cuts.
 * The diff runs on a `probeWidth`-wide decode, which is what makes mean-abs-diff both
 * cheap and robust to sensor noise and compression mush at full resolution.
 */
export async function extractSceneChangeFrames(
  blob: Blob,
  config?: { threshold?: number; maxWidth?: number; probeWidth?: number },
): Promise<OffscreenCanvas[]> {
  const threshold = config?.threshold ?? DEFAULT_SCENE_THRESHOLD;
  const probeWidth = config?.probeWidth ?? DEFAULT_PROBE_WIDTH;

  const mb = await loadMediabunny();
  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('This clip has no video track to pull frames from');
    const duration = await input.computeDuration();
    const probeTimes = planFrameTimes(duration, { mode: 'sceneChange' });

    const probeSink = new mb.CanvasSink(track, sinkOptions(probeWidth));
    const diffs: number[] = [];
    let previous: Uint8ClampedArray | null = null;
    for await (const wrapped of probeSink.canvasesAtTimestamps(probeTimes)) {
      if (!wrapped) {
        // Keep the array parallel to `probeTimes`; a missing probe is simply not a cut.
        diffs.push(0);
        continue;
      }
      const pixels = readPixels(wrapped.canvas);
      diffs.push(previous ? meanAbsDiff(previous, pixels) : 0);
      previous = pixels;
    }

    const cuts = pickSceneChanges(diffs, threshold)
      .map((index) => probeTimes[index])
      .filter((time): time is number => time !== undefined);
    // ponytail: two decode passes — a cheap probe pass, then the cuts at output size.
    // One pass keeping every full-resolution probe would hold 240 stills in memory.
    return await decodeAt(mb, track, cuts, config?.maxWidth);
  } finally {
    input.dispose();
  }
}

/** Tile stills into one contact sheet. */
export function buildFrameGrid(
  frames: readonly DrawableImage[],
  config: {
    columns: number;
    rows: number;
    cellWidth?: number;
    gap?: number;
    background?: string;
  },
): OffscreenCanvas {
  const first = frames[0];
  if (!first) throw new Error('A frame grid needs at least one frame');

  const layout = computeFrameGridLayout({
    cellCount: frames.length,
    columns: config.columns,
    rows: config.rows,
    cellWidth: config.cellWidth ?? Math.min(first.width, DEFAULT_CELL_WIDTH),
    cellAspect: first.height > 0 ? first.width / first.height : 1,
    gap: config.gap ?? 0,
  });

  const canvas = new OffscreenCanvas(layout.width, layout.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser could not create a 2D canvas context');

  const background = config.background ?? '#000000';
  if (background !== 'transparent') {
    context.fillStyle = background;
    context.fillRect(0, 0, layout.width, layout.height);
  }
  layout.cells.forEach((cell, index) => {
    const frame = frames[index];
    if (frame) context.drawImage(frame, cell.x, cell.y, cell.width, cell.height);
  });
  return canvas;
}
