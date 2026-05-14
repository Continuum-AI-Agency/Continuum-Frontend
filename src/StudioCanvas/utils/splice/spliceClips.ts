import type { ResolvedClip } from './resolveClipSources';
import { drawLetterboxed } from './letterbox';

const TARGET_SAMPLE_RATE = 48_000;
const TARGET_CHANNEL_COUNT = 2;
const SILENCE_CHUNK_SECONDS = 0.5;

export type SpliceProgress = {
  progress: number;
  processedClips: number;
  totalClips: number;
  message?: string;
};

export type SpliceOptions = {
  clips: ResolvedClip[];
  videoBitrate?: number;
  audioBitrate?: number;
  onProgress?: (progress: SpliceProgress) => void;
  signal?: AbortSignal;
};

export type SpliceResult = {
  blob: Blob;
  objectUrl: string;
  durationSec: number;
  width: number;
  height: number;
};

const DEFAULT_VIDEO_BITRATE = 6_000_000;
const DEFAULT_AUDIO_BITRATE = 192_000;

async function loadMediabunny() {
  return import('mediabunny');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Splice aborted', 'AbortError');
  }
}

export async function spliceClips(options: SpliceOptions): Promise<SpliceResult> {
  const { clips, signal } = options;
  if (clips.length < 2) {
    throw new Error('Splice requires at least two clips');
  }

  const mb = await loadMediabunny();
  throwIfAborted(signal);

  const inputs = clips.map((clip) =>
    new mb.Input({
      source: new mb.BlobSource(clip.blob),
      formats: mb.ALL_FORMATS,
    }),
  );

  let targetWidth = 0;
  let targetHeight = 0;
  const trimRanges: Array<{ startSec: number; endSec: number; durationSec: number }> = [];

  try {
    for (let i = 0; i < inputs.length; i += 1) {
      const input = inputs[i];
      const clip = clips[i];
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) {
        throw new Error(`Clip ${i + 1}: no video track found`);
      }

      const width = await videoTrack.getCodedWidth();
      const height = await videoTrack.getCodedHeight();
      if (i === 0) {
        targetWidth = width;
        targetHeight = height;
      }

      const fullDuration = await input.computeDuration();
      const trimStart = Math.max(0, clip.trimStartSec ?? 0);
      const trimEnd = clip.trimEndSec !== undefined ? Math.min(clip.trimEndSec, fullDuration) : fullDuration;
      if (trimEnd <= trimStart) {
        throw new Error(`Clip ${i + 1}: trim range produces zero duration`);
      }
      trimRanges.push({ startSec: trimStart, endSec: trimEnd, durationSec: trimEnd - trimStart });
    }

    if (targetWidth <= 0 || targetHeight <= 0) {
      throw new Error('Unable to determine target dimensions from first clip');
    }

    const offscreen = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      throw new Error('OffscreenCanvas 2D context unavailable');
    }

    const output = new mb.Output({
      format: new mb.Mp4OutputFormat(),
      target: new mb.BufferTarget(),
    });

    const videoSource = new mb.CanvasSource(offscreen, {
      codec: 'avc',
      bitrate: options.videoBitrate ?? DEFAULT_VIDEO_BITRATE,
    });
    output.addVideoTrack(videoSource);

    const audioSource = new mb.AudioSampleSource({
      codec: 'aac',
      bitrate: options.audioBitrate ?? DEFAULT_AUDIO_BITRATE,
      transform: {
        numberOfChannels: TARGET_CHANNEL_COUNT,
        sampleRate: TARGET_SAMPLE_RATE,
      },
    });
    output.addAudioTrack(audioSource);

    await output.start();
    throwIfAborted(signal);

    const totalDuration = trimRanges.reduce((sum, range) => sum + range.durationSec, 0);
    let processedDuration = 0;
    let cumulativeOffset = 0;

    for (let i = 0; i < inputs.length; i += 1) {
      const input = inputs[i];
      const range = trimRanges[i];
      const clip = clips[i];
      const muteAudio = Boolean((clip as ResolvedClip & { muteAudio?: boolean }).muteAudio);
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) {
        throw new Error(`Clip ${i + 1}: no video track found`);
      }

      const sourceWidth = await videoTrack.getCodedWidth();
      const sourceHeight = await videoTrack.getCodedHeight();
      const canvasSink = new mb.CanvasSink(videoTrack);
      const frames = canvasSink.canvases(range.startSec, range.endSec);

      let clipProcessedSec = 0;

      for await (const wrapped of frames) {
        throwIfAborted(signal);
        const localTimestamp = wrapped.timestamp - range.startSec;
        if (localTimestamp < 0) continue;
        const outputTimestamp = cumulativeOffset + localTimestamp;
        const duration = Math.max(wrapped.duration, 1 / 240);
        drawLetterboxed(ctx, wrapped.canvas, sourceWidth, sourceHeight, targetWidth, targetHeight);
        await videoSource.add(outputTimestamp, duration);
        clipProcessedSec = Math.max(clipProcessedSec, localTimestamp + duration);
        const progress = totalDuration > 0 ? (processedDuration + clipProcessedSec) / totalDuration : 0;
        options.onProgress?.({
          progress: Math.min(0.99, progress),
          processedClips: i,
          totalClips: clips.length,
        });
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

      processedDuration += range.durationSec;
      cumulativeOffset += range.durationSec;
      options.onProgress?.({
        progress: totalDuration > 0 ? processedDuration / totalDuration : 0,
        processedClips: i + 1,
        totalClips: clips.length,
      });
    }

    await output.finalize();

    const buffer = output.target.buffer;
    if (!buffer) {
      throw new Error('Output buffer was not produced');
    }

    const mimeType = await output.getMimeType().catch(() => 'video/mp4');
    const blob = new Blob([buffer], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);

    options.onProgress?.({ progress: 1, processedClips: clips.length, totalClips: clips.length });

    return {
      blob,
      objectUrl,
      durationSec: totalDuration,
      width: targetWidth,
      height: targetHeight,
    };
  } finally {
    for (const input of inputs) {
      try {
        (input as unknown as { dispose?: () => void }).dispose?.();
      } catch {
        // noop
      }
    }
  }
}
