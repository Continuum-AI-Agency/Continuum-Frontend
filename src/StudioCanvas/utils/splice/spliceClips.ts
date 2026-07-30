import { appendRange, loadMediabunny, throwIfAborted } from './appendRange';

export type ResolvedClip = {
  slotId: string;
  blob: Blob;
  trimStartSec?: number;
  trimEndSec?: number;
  muteAudio?: boolean;
};

const TARGET_SAMPLE_RATE = 48_000;
const TARGET_CHANNEL_COUNT = 2;

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

export async function spliceClips(options: SpliceOptions): Promise<SpliceResult> {
  const { clips, signal } = options;
  if (clips.length < 2) {
    throw new Error('Splice requires at least two clips');
  }

  const mb = await loadMediabunny();
  throwIfAborted(signal);

  const inputs = clips.map(
    (clip) =>
      new mb.Input({
        source: new mb.BlobSource(clip.blob),
        formats: mb.ALL_FORMATS,
      }),
  );

  let targetWidth = 0;
  let targetHeight = 0;
  const trimRanges: Array<{ startSec: number; endSec: number; durationSec: number }> = [];
  let cancelOutput: (() => Promise<void>) | undefined;
  let outputFinalized = false;

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
      const trimEnd =
        clip.trimEndSec !== undefined ? Math.min(clip.trimEndSec, fullDuration) : fullDuration;
      if (trimEnd <= trimStart) {
        throw new Error(`Clip ${i + 1}: trim range produces zero duration`);
      }
      trimRanges.push({ startSec: trimStart, endSec: trimEnd, durationSec: trimEnd - trimStart });
    }

    if (targetWidth <= 0 || targetHeight <= 0) {
      throw new Error('Unable to determine target dimensions from first clip');
    }
    // avc requires even dimensions; image stills can be odd-sized.
    targetWidth -= targetWidth % 2;
    targetHeight -= targetHeight % 2;

    const offscreen = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      throw new Error('OffscreenCanvas 2D context unavailable');
    }

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
      const muteAudio = Boolean((clips[i] as ResolvedClip & { muteAudio?: boolean }).muteAudio);

      await appendRange({
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
        onRangeProgress: (processedSecInRange) => {
          const progress =
            totalDuration > 0 ? (processedDuration + processedSecInRange) / totalDuration : 0;
          options.onProgress?.({
            progress: Math.min(0.99, progress),
            processedClips: i,
            totalClips: clips.length,
          });
        },
      });

      processedDuration += range.durationSec;
      cumulativeOffset += range.durationSec;
      options.onProgress?.({
        progress: totalDuration > 0 ? processedDuration / totalDuration : 0,
        processedClips: i + 1,
        totalClips: clips.length,
      });
    }

    await output.finalize();
    outputFinalized = true;

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
    if (cancelOutput && !outputFinalized) {
      await cancelOutput().catch(() => undefined);
    }
    for (const input of inputs) {
      try {
        (input as unknown as { dispose?: () => void }).dispose?.();
      } catch {
        // noop
      }
    }
  }
}
