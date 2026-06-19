import { drawLetterboxed } from './letterbox';

// Shared per-range concat mechanics for the mediabunny splice engines. Both
// spliceClips (multi-input) and spliceSingleSource (one input, N ranges) append
// each trim range through here so the timestamp-offset + silence-fill logic lives
// in exactly one place. No-op letterbox at native dims keeps source aspect.

type MediabunnyModule = typeof import('mediabunny');
type MbInput = InstanceType<MediabunnyModule['Input']>;
type MbCanvasSource = InstanceType<MediabunnyModule['CanvasSource']>;
type MbAudioSampleSource = InstanceType<MediabunnyModule['AudioSampleSource']>;

const TARGET_SAMPLE_RATE = 48_000;
const TARGET_CHANNEL_COUNT = 2;
const SILENCE_CHUNK_SECONDS = 0.5;

export async function loadMediabunny(): Promise<MediabunnyModule> {
  return import('mediabunny');
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Splice aborted', 'AbortError');
  }
}

export type AppendRangeParams = {
  mb: MediabunnyModule;
  input: MbInput;
  range: { startSec: number; endSec: number; durationSec: number };
  ctx: OffscreenCanvasRenderingContext2D;
  videoSource: MbCanvasSource;
  audioSource: MbAudioSampleSource;
  targetWidth: number;
  targetHeight: number;
  cumulativeOffset: number;
  muteAudio: boolean;
  signal?: AbortSignal;
  // Reports processed seconds WITHIN this range after each video frame, so the
  // caller can compute a global progress fraction across all ranges.
  onRangeProgress?: (processedSecInRange: number) => void;
};

export async function appendRange(params: AppendRangeParams): Promise<void> {
  const {
    mb,
    input,
    range,
    ctx,
    videoSource,
    audioSource,
    targetWidth,
    targetHeight,
    cumulativeOffset,
    muteAudio,
    signal,
  } = params;

  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) {
    throw new Error('Range has no video track');
  }
  const sourceWidth = await videoTrack.getCodedWidth();
  const sourceHeight = await videoTrack.getCodedHeight();

  const canvasSink = new mb.CanvasSink(videoTrack);
  for await (const wrapped of canvasSink.canvases(range.startSec, range.endSec)) {
    throwIfAborted(signal);
    const localTimestamp = wrapped.timestamp - range.startSec;
    if (localTimestamp < 0) continue;
    const duration = Math.max(wrapped.duration, 1 / 240);
    drawLetterboxed(ctx, wrapped.canvas, sourceWidth, sourceHeight, targetWidth, targetHeight);
    await videoSource.add(cumulativeOffset + localTimestamp, duration);
    params.onRangeProgress?.(localTimestamp + duration);
  }

  const audioTrack = muteAudio ? null : await input.getPrimaryAudioTrack();
  if (audioTrack) {
    const sampleSink = new mb.AudioSampleSink(audioTrack);
    for await (const sample of sampleSink.samples(range.startSec, range.endSec)) {
      throwIfAborted(signal);
      const localTimestamp = Math.max(0, sample.timestamp - range.startSec);
      sample.setTimestamp(cumulativeOffset + localTimestamp);
      await audioSource.add(sample);
      sample.close();
    }
  } else {
    let silenceOffset = 0;
    while (silenceOffset < range.durationSec) {
      throwIfAborted(signal);
      const chunkDuration = Math.min(SILENCE_CHUNK_SECONDS, range.durationSec - silenceOffset);
      const frames = Math.max(1, Math.round(chunkDuration * TARGET_SAMPLE_RATE));
      const silenceSample = new mb.AudioSample({
        data: new Float32Array(frames * TARGET_CHANNEL_COUNT),
        format: 'f32-planar',
        sampleRate: TARGET_SAMPLE_RATE,
        numberOfChannels: TARGET_CHANNEL_COUNT,
        timestamp: cumulativeOffset + silenceOffset,
      });
      await audioSource.add(silenceSample);
      silenceSample.close();
      silenceOffset += chunkDuration;
    }
  }
}
