import { appendRange, fillSilence, loadMediabunny, throwIfAborted } from './appendRange';
import { drawLetterboxed } from './letterbox';
import type { SpliceProgress, SpliceResult } from './spliceClips';

// Reverse playback for the `video.reverse` / `video.boomerang` actions.
//
// Why this cannot ride `appendRange`: that helper walks a `CanvasSink` iterator
// FORWARD and emits each frame as it arrives, which is the only shape a streaming
// decode has. Reversal is the one time op that needs frames the decoder has not
// reached yet, so it must buffer. `appendRange.ts` is frozen and, more to the point,
// should not grow a "hold every frame in memory" branch that its four other callers
// would carry forever.
//
// Audio follows the same buffer-and-reverse rule as video. Samples are decoded into
// planar PCM, emitted in reverse chunk/frame order, and padded only when the source has
// no audio or codec padding leaves the audio fractionally shorter than the video.

type MediabunnyModule = Awaited<ReturnType<typeof loadMediabunny>>;
type MbInput = InstanceType<MediabunnyModule['Input']>;
type MbCanvasSource = InstanceType<MediabunnyModule['CanvasSource']>;
type MbAudioSampleSource = InstanceType<MediabunnyModule['AudioSampleSource']>;

const DEFAULT_VIDEO_BITRATE = 6_000_000;
const DEFAULT_AUDIO_BITRATE = 192_000;
/**
 * Seconds of frames held in memory at once.
 *
 * ponytail: 0.5s is ~15 frames, so peak is ~15 × w × h × 4 bytes — about 125 MB at
 * 1080p. Reversal has to buffer SOMETHING; the alternative (seeking backwards frame by
 * frame) re-decodes from the preceding keyframe on every step and is far worse. If a
 * 4K reverse ever OOMs, the upgrade path is chunking by frame COUNT off the track's
 * packet stats, not a smaller constant.
 */
const DEFAULT_CHUNK_SEC = 0.5;
/** Matches `appendRange`'s floor for a frame with no reported duration. */
const MIN_FRAME_DURATION_SEC = 1 / 240;
const EPSILON = 1e-6;

export interface ReverseChunk {
  startSec: number;
  endSec: number;
}

/** Concatenate planar channels after reversing frame order inside each channel. */
export function reversePlanarAudio(planes: readonly Float32Array[]): Float32Array {
  const frameCount = planes[0]?.length ?? 0;
  const reversed = new Float32Array(frameCount * planes.length);
  for (const [channel, plane] of planes.entries()) {
    if (plane.length !== frameCount) throw new Error('Audio channel lengths do not match');
    const offset = channel * frameCount;
    for (let frame = 0; frame < frameCount; frame += 1) {
      reversed[offset + frame] = plane[frameCount - frame - 1];
    }
  }
  return reversed;
}

/**
 * `[startSec, endSec)` cut into chunks, LAST ONE FIRST — the order a reverse pass
 * consumes them. Pure, so the ordering that makes reversal correct is testable without
 * a decoder.
 */
export function reverseChunks(
  startSec: number,
  endSec: number,
  chunkSec = DEFAULT_CHUNK_SEC,
): ReverseChunk[] {
  const span = endSec - startSec;
  if (!(span > 0)) return [];
  const size = Number.isFinite(chunkSec) && chunkSec > 0 ? chunkSec : DEFAULT_CHUNK_SEC;
  const count = Math.max(1, Math.ceil(span / size));
  const chunks: ReverseChunk[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    chunks.push({
      startSec: startSec + index * size,
      endSec: index === count - 1 ? endSec : startSec + (index + 1) * size,
    });
  }
  return chunks;
}

export interface AppendReversedRangeParams {
  mb: MediabunnyModule;
  input: MbInput;
  range: { startSec: number; endSec: number };
  ctx: OffscreenCanvasRenderingContext2D;
  videoSource: MbCanvasSource;
  targetWidth: number;
  targetHeight: number;
  cumulativeOffset: number;
  chunkSec?: number;
  signal?: AbortSignal;
  onRangeProgress?: (processedSecInRange: number) => void;
}

/**
 * Append `range` to the output backwards, chunk by chunk.
 *
 * Returns the output seconds emitted, which is what the caller needs to place anything
 * after it (and, for a plain reverse, IS the clip's duration).
 */
export async function appendReversedRange(params: AppendReversedRangeParams): Promise<number> {
  const {
    mb,
    input,
    range,
    ctx,
    videoSource,
    targetWidth,
    targetHeight,
    cumulativeOffset,
    signal,
  } = params;

  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) throw new Error('Range has no video track');
  const sourceWidth = await videoTrack.getCodedWidth();
  const sourceHeight = await videoTrack.getCodedHeight();

  const sink = new mb.CanvasSink(videoTrack);
  let emitted = 0;

  for (const chunk of reverseChunks(range.startSec, range.endSec, params.chunkSec)) {
    throwIfAborted(signal);
    // No `poolSize` on the sink, so every yielded canvas is its own allocation and is
    // safe to hold. With a pool they would be recycled under us and the whole chunk
    // would replay as the last frame N times.
    const held: { canvas: CanvasImageSource; duration: number }[] = [];
    for await (const wrapped of sink.canvases(chunk.startSec, chunk.endSec)) {
      throwIfAborted(signal);
      // `canvases()` starts at the last frame at or BEFORE the start timestamp, so a
      // chunk boundary would otherwise re-emit the previous chunk's final frame.
      if (wrapped.timestamp < chunk.startSec - EPSILON) continue;
      held.push({
        canvas: wrapped.canvas,
        duration: Math.max(wrapped.duration, MIN_FRAME_DURATION_SEC),
      });
    }

    for (let index = held.length - 1; index >= 0; index -= 1) {
      throwIfAborted(signal);
      const frame = held[index];
      drawLetterboxed(ctx, frame.canvas, sourceWidth, sourceHeight, targetWidth, targetHeight);
      await videoSource.add(cumulativeOffset + emitted, frame.duration);
      emitted += frame.duration;
      params.onRangeProgress?.(emitted);
    }
  }

  return emitted;
}

async function appendReversedAudioRange(params: {
  mb: MediabunnyModule;
  input: MbInput;
  audioSource: MbAudioSampleSource;
  range: { startSec: number; endSec: number };
  cumulativeOffset: number;
  signal?: AbortSignal;
}): Promise<number | null> {
  const audioTrack = await params.input.getPrimaryAudioTrack();
  if (!audioTrack) return null;

  const decoded: Array<{
    planes: Float32Array[];
    sampleRate: number;
    numberOfChannels: number;
  }> = [];
  const sink = new params.mb.AudioSampleSink(audioTrack);
  for await (const sample of sink.samples(params.range.startSec, params.range.endSec)) {
    throwIfAborted(params.signal);
    try {
      const planes = Array.from({ length: sample.numberOfChannels }, (_, planeIndex) => {
        const plane = new Float32Array(sample.numberOfFrames);
        sample.copyTo(plane, { planeIndex, format: 'f32-planar' });
        return plane;
      });
      decoded.push({
        planes,
        sampleRate: sample.sampleRate,
        numberOfChannels: sample.numberOfChannels,
      });
    } finally {
      sample.close();
    }
  }

  let emitted = 0;
  for (let index = decoded.length - 1; index >= 0; index -= 1) {
    throwIfAborted(params.signal);
    const chunk = decoded[index];
    const output = new params.mb.AudioSample({
      data: reversePlanarAudio(chunk.planes),
      format: 'f32-planar',
      sampleRate: chunk.sampleRate,
      numberOfChannels: chunk.numberOfChannels,
      timestamp: params.cumulativeOffset + emitted,
    });
    try {
      await params.audioSource.add(output);
      emitted += output.duration;
    } finally {
      output.close();
    }
  }
  return emitted;
}

export interface RenderReverseOptions {
  blob: Blob;
  /** Play the clip forward first, then backward. */
  boomerang?: boolean;
  /** Boomerang only: seconds trimmed off the START of the reverse pass, so the
   *  turnaround frame is not held twice. */
  overlapSec?: number;
  chunkSec?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  signal?: AbortSignal;
  onProgress?: (progress: SpliceProgress) => void;
}

/**
 * Encode one clip reversed — or forward-then-reversed for a boomerang — into a new MP4.
 *
 * Self-contained rather than routed through `composeTimeline`: that renderer's item
 * vocabulary is trim/effect/transition, all of which run time FORWARD. Threading a
 * "backwards" flag through it would touch a frozen file for one op's sake.
 */
export async function renderReverse(options: RenderReverseOptions): Promise<SpliceResult> {
  const { blob, signal } = options;
  const mb = await loadMediabunny();
  throwIfAborted(signal);

  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });
  let cancelOutput: (() => Promise<void>) | undefined;
  let outputFinalized = false;

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('The connected clip has no video track');
    // avc requires even dimensions — same rounding `composeTimeline` applies.
    const codedWidth = await videoTrack.getCodedWidth();
    const codedHeight = await videoTrack.getCodedHeight();
    const targetWidth = codedWidth - (codedWidth % 2);
    const targetHeight = codedHeight - (codedHeight % 2);
    if (targetWidth <= 0 || targetHeight <= 0) {
      throw new Error('The connected clip has no readable size');
    }

    const sourceDuration = await input.computeDuration();
    if (!(sourceDuration > 0)) throw new Error('The connected clip has no duration');

    const offscreen = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = offscreen.getContext('2d');
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');

    const output = new mb.Output({
      format: new mb.Mp4OutputFormat(),
      target: new mb.BufferTarget(),
    });
    cancelOutput = () => output.cancel();
    const videoSource = new mb.CanvasSource(offscreen, {
      codec: 'avc',
      bitrate: options.videoBitrate ?? DEFAULT_VIDEO_BITRATE,
    });
    output.addVideoTrack(videoSource);
    const audioSource = new mb.AudioSampleSource({
      codec: 'aac',
      bitrate: options.audioBitrate ?? DEFAULT_AUDIO_BITRATE,
      transform: { numberOfChannels: 2, sampleRate: 48_000 },
    });
    output.addAudioTrack(audioSource);

    await output.start();
    throwIfAborted(signal);

    // The turnaround trim only makes sense with a forward pass to turn around from.
    const overlapSec = options.boomerang
      ? Math.min(Math.max(0, options.overlapSec ?? 0), sourceDuration)
      : 0;
    const reverseSpan = sourceDuration - overlapSec;
    const plannedTotal = (options.boomerang ? sourceDuration : 0) + reverseSpan;
    const report = (processed: number, stage: number) =>
      options.onProgress?.({
        progress: Math.min(0.99, plannedTotal > 0 ? processed / plannedTotal : 0),
        processedClips: stage,
        totalClips: options.boomerang ? 2 : 1,
      });

    let emitted = 0;
    if (options.boomerang) {
      await appendRange({
        mb,
        input,
        range: { startSec: 0, endSec: sourceDuration, durationSec: sourceDuration },
        ctx,
        videoSource,
        audioSource,
        targetWidth,
        targetHeight,
        cumulativeOffset: 0,
        muteAudio: false,
        skipAudio: false,
        signal,
        onRangeProgress: (processed) => report(processed, 0),
      });
      emitted = sourceDuration;
    }

    if (reverseSpan > 0) {
      const reverseOffset = emitted;
      const reversed = await appendReversedRange({
        mb,
        input,
        range: { startSec: 0, endSec: reverseSpan },
        ctx,
        videoSource,
        targetWidth,
        targetHeight,
        cumulativeOffset: emitted,
        chunkSec: options.chunkSec,
        signal,
        onRangeProgress: (processed) => report(emitted + processed, options.boomerang ? 1 : 0),
      });
      emitted += reversed;
      const reversedAudio = await appendReversedAudioRange({
        mb,
        input,
        audioSource,
        range: { startSec: 0, endSec: reverseSpan },
        cumulativeOffset: reverseOffset,
        signal,
      });
      const audioDuration = reversedAudio ?? 0;
      if (audioDuration < reversed) {
        await fillSilence(
          mb,
          audioSource,
          reversed - audioDuration,
          reverseOffset + audioDuration,
          signal,
        );
      }
    }
    throwIfAborted(signal);

    await output.finalize();
    outputFinalized = true;

    const buffer = output.target.buffer;
    if (!buffer) throw new Error('Output buffer was not produced');
    const mimeType = await output.getMimeType().catch(() => 'video/mp4');
    const result = new Blob([buffer], { type: mimeType });

    options.onProgress?.({
      progress: 1,
      processedClips: options.boomerang ? 2 : 1,
      totalClips: options.boomerang ? 2 : 1,
    });

    return {
      blob: result,
      objectUrl: URL.createObjectURL(result),
      durationSec: emitted,
      width: targetWidth,
      height: targetHeight,
    };
  } finally {
    if (cancelOutput && !outputFinalized) {
      await cancelOutput().catch(() => undefined);
    }
    try {
      (input as unknown as { dispose?: () => void }).dispose?.();
    } catch {
      // noop
    }
  }
}
