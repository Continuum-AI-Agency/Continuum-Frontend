import type { SpliceProgress, SpliceResult } from './spliceClips';
import { appendRange, loadMediabunny, throwIfAborted } from './appendRange';
import { computeCappedDimensions } from './cappedDimensions';

// Single-source variant of the splice engine: open ONE input and concatenate N
// ordered keep-ranges into one MP4, shifting timestamps by a cumulative offset.
// Used by clip generation — the source video Blob is opened once (not re-passed
// per range) so it is decoded a single time. Output is downscaled to the
// caller's short-edge cap (user-selected 1080p/720p) to keep the on-device encode
// within the user's hardware budget; aspect ratio is preserved.

const TARGET_SAMPLE_RATE = 48_000;
const TARGET_CHANNEL_COUNT = 2;
const DEFAULT_VIDEO_BITRATE = 6_000_000;
const LOW_VIDEO_BITRATE = 3_500_000;
const DEFAULT_AUDIO_BITRATE = 192_000;

// 720p-class outputs don't need the full 1080p bitrate; the lower ceiling also
// lightens the encoder. Callers may still override with an explicit videoBitrate.
function defaultVideoBitrateForShortEdge(shortEdgePx: number): number {
  return shortEdgePx <= 720 ? LOW_VIDEO_BITRATE : DEFAULT_VIDEO_BITRATE;
}

export type SingleSourceRange = {
  startSec: number;
  endSec: number;
  muteAudio?: boolean;
};

export type SpliceSingleSourceOptions = {
  blob: Blob;
  ranges: SingleSourceRange[];
  // Downscale the output so its short edge is at most this many pixels (e.g. 1080
  // or 720). Omitted/0 keeps the source resolution. Aspect ratio is preserved.
  maxShortEdgePx?: number;
  videoBitrate?: number;
  audioBitrate?: number;
  onProgress?: (progress: SpliceProgress) => void;
  signal?: AbortSignal;
};

export async function spliceSingleSource(options: SpliceSingleSourceOptions): Promise<SpliceResult> {
  const { blob, ranges, signal } = options;
  if (ranges.length < 1) {
    throw new Error('Single-source splice requires at least one range');
  }

  const mb = await loadMediabunny();
  throwIfAborted(signal);

  const input = new mb.Input({ source: new mb.BlobSource(blob), formats: mb.ALL_FORMATS });

  try {
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new Error('Source has no video track');
    }
    const codedWidth = await videoTrack.getCodedWidth();
    const codedHeight = await videoTrack.getCodedHeight();
    if (codedWidth <= 0 || codedHeight <= 0) {
      throw new Error('Unable to determine source dimensions');
    }
    const { width: targetWidth, height: targetHeight } = computeCappedDimensions(
      codedWidth,
      codedHeight,
      options.maxShortEdgePx,
    );

    const fullDuration = await input.computeDuration();
    const clamped = ranges
      .map((r) => {
        const startSec = Math.max(0, Math.min(r.startSec, fullDuration));
        const endSec = Math.max(startSec, Math.min(r.endSec, fullDuration));
        return { startSec, endSec, durationSec: endSec - startSec, muteAudio: Boolean(r.muteAudio) };
      })
      .filter((r) => r.durationSec > 0);
    if (clamped.length === 0) {
      throw new Error('Single-source splice ranges produced zero duration');
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
      bitrate: options.videoBitrate ?? defaultVideoBitrateForShortEdge(Math.min(targetWidth, targetHeight)),
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

    const totalDuration = clamped.reduce((sum, range) => sum + range.durationSec, 0);
    let processedDuration = 0;
    let cumulativeOffset = 0;

    for (let i = 0; i < clamped.length; i += 1) {
      const range = clamped[i];
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
        muteAudio: range.muteAudio,
        signal,
        onRangeProgress: (processedSecInRange) => {
          const progress = totalDuration > 0 ? (processedDuration + processedSecInRange) / totalDuration : 0;
          options.onProgress?.({
            progress: Math.min(0.99, progress),
            processedClips: i,
            totalClips: clamped.length,
          });
        },
      });

      processedDuration += range.durationSec;
      cumulativeOffset += range.durationSec;
      options.onProgress?.({
        progress: totalDuration > 0 ? processedDuration / totalDuration : 0,
        processedClips: i + 1,
        totalClips: clamped.length,
      });
    }

    await output.finalize();

    const buffer = output.target.buffer;
    if (!buffer) {
      throw new Error('Output buffer was not produced');
    }

    const mimeType = await output.getMimeType().catch(() => 'video/mp4');
    const outputBlob = new Blob([buffer], { type: mimeType });
    const objectUrl = URL.createObjectURL(outputBlob);

    options.onProgress?.({ progress: 1, processedClips: clamped.length, totalClips: clamped.length });

    return {
      blob: outputBlob,
      objectUrl,
      durationSec: totalDuration,
      width: targetWidth,
      height: targetHeight,
    };
  } finally {
    try {
      (input as unknown as { dispose?: () => void }).dispose?.();
    } catch {
      // noop
    }
  }
}
