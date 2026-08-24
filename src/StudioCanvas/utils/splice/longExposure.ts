import { loadMediabunny, throwIfAborted } from './appendRange';

// Long exposure: every sampled frame of a clip blended into ONE still.
//
// The catalog marks `video.longExposure` `sync`/`image`, so this runs in the page
// beside `video.extractFrames` rather than in the splicer worker — there is no
// re-encode here, only a decode and a stack of `drawImage` calls.
//
// Three blends, one draw loop:
//   average — the running mean, drawn as frame k at globalAlpha 1/k (see below)
//   lighten — keep the brightest pixel seen; this is the light-trail look
//   darken  — keep the darkest; the inverse, useful over a bright sky

type MediabunnyModule = Awaited<ReturnType<typeof loadMediabunny>>;

export type LongExposureMode = 'average' | 'lighten' | 'darken';

export interface LongExposureOptions {
  blob: Blob;
  /** Registry default is `average`. `darken` is implemented but not yet in the op's
   *  frozen enum — see the handoff. */
  mode?: LongExposureMode;
  /** Frames sampled per second of source. Registry default 12. */
  sampleFps?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export interface LongExposureResult {
  /** The accumulator itself, not a re-encoded copy: `runAction`'s image branch already
   *  takes an `OffscreenCanvas`, so a PNG round-trip here would be encoded once and
   *  decoded again for nothing. */
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  /** How many frames actually landed in the blend — the number the mode averaged. */
  frameCount: number;
}

const DEFAULT_SAMPLE_FPS = 12;
const MAX_SAMPLES = 600;

/**
 * The timestamps to sample, inclusive of 0 and stopping before `durationSec`.
 *
 * Capped: a 10-minute clip at 60fps is 36,000 decodes for a single still, and the
 * blend stops changing visibly long before that. The cap is reported through
 * `frameCount` rather than hidden.
 */
export function sampleTimestamps(durationSec: number, sampleFps: number): number[] {
  if (!(durationSec > 0)) return [0];
  const fps = Number.isFinite(sampleFps) && sampleFps > 0 ? sampleFps : DEFAULT_SAMPLE_FPS;
  const step = 1 / fps;
  const count = Math.min(MAX_SAMPLES, Math.max(1, Math.ceil(durationSec / step)));
  // Re-derive the step from the capped count so a long clip is sampled ACROSS its whole
  // length rather than densely over its first few seconds.
  const spacing = durationSec / count;
  return Array.from({ length: count }, (_, index) => index * spacing);
}

/**
 * How to draw the `index`-th sampled frame onto the accumulator.
 *
 * The average is a RUNNING mean, which is why it needs no second pass to count frames
 * first: drawing frame k at alpha 1/k over the mean of the previous k−1 gives
 * `C(k−1)·(1 − 1/k) + f(k)·(1/k)` — exactly the mean of k frames. Getting this wrong
 * (a constant 1/n with an n nobody knows yet) is the reason the naive version needs
 * to decode the clip twice.
 */
export function accumulationStep(
  mode: LongExposureMode,
  index: number,
): { globalAlpha: number; composite: 'source-over' | 'lighten' | 'darken' } {
  if (mode === 'average') return { globalAlpha: 1 / (index + 1), composite: 'source-over' };
  return { globalAlpha: 1, composite: mode };
}

/** The colour the accumulator starts on, so the first blend has something to beat. */
export function baseFillFor(mode: LongExposureMode): string | null {
  if (mode === 'lighten') return '#000000';
  if (mode === 'darken') return '#ffffff';
  // The average's first frame is drawn at alpha 1, so it IS the base.
  return null;
}

export async function renderLongExposure(
  options: LongExposureOptions,
): Promise<LongExposureResult> {
  const { blob, signal } = options;
  const mode: LongExposureMode = options.mode ?? 'average';
  const mb: MediabunnyModule = await loadMediabunny();
  throwIfAborted(signal);

  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('The connected clip has no video track');

    const width = await videoTrack.getCodedWidth();
    const height = await videoTrack.getCodedHeight();
    if (width <= 0 || height <= 0) throw new Error('The connected clip has no readable size');

    const durationSec = await input.computeDuration();
    const timestamps = sampleTimestamps(durationSec, options.sampleFps ?? DEFAULT_SAMPLE_FPS);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');

    const baseFill = baseFillFor(mode);
    if (baseFill) {
      ctx.fillStyle = baseFill;
      ctx.fillRect(0, 0, width, height);
    }

    // Sorted timestamps let mediabunny decode each packet at most once, which is the
    // whole reason this samples a list rather than seeking frame by frame.
    const sink = new mb.CanvasSink(videoTrack);
    let frameCount = 0;
    for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
      throwIfAborted(signal);
      if (!wrapped) continue;
      const { globalAlpha, composite } = accumulationStep(mode, frameCount);
      ctx.globalAlpha = globalAlpha;
      ctx.globalCompositeOperation = composite;
      ctx.drawImage(wrapped.canvas, 0, 0, width, height);
      frameCount += 1;
      options.onProgress?.(Math.min(1, frameCount / timestamps.length));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (frameCount === 0) throw new Error('No frames could be decoded from the connected clip');

    return { canvas, width, height, frameCount };
  } finally {
    try {
      (input as unknown as { dispose?: () => void }).dispose?.();
    } catch {
      // noop
    }
  }
}
