import { appendRange, appendStill, loadMediabunny, throwIfAborted } from './appendRange';
import type { SpliceProgress, SpliceResult } from './spliceClips';

// Timeline renderer for the Video Editor (timelineEditor) node. Sibling to
// spliceClips: where the splicer only concatenates video clips, this composes an
// ordered mix of trimmed video clips and image stills onto one canvas via the
// same mediabunny/WebCodecs pipeline. Reorder, trim, and split are pure data
// (ordered items + ranges) so they need no encoder support here. Video items
// keep their own audio; stills (and muted clips) are padded with silence. A
// separate background-audio track is intentionally deferred (v1.1).

const TARGET_SAMPLE_RATE = 48_000;
const TARGET_CHANNEL_COUNT = 2;
const DEFAULT_VIDEO_BITRATE = 6_000_000;
const DEFAULT_AUDIO_BITRATE = 192_000;
const DEFAULT_STILL_DURATION_SEC = 3;

export type TimelineRenderItem = {
  itemId: string;
  kind: 'video' | 'image';
  blob: Blob;
  trimStartSec?: number;
  trimEndSec?: number;
  // Image stills only: how long the frame holds (seconds). Defaults to 3s.
  durationSec?: number;
  muteAudio?: boolean;
};

export type ComposeTimelineOptions = {
  items: TimelineRenderItem[];
  videoBitrate?: number;
  audioBitrate?: number;
  onProgress?: (progress: SpliceProgress) => void;
  signal?: AbortSignal;
};

type MediabunnyModule = Awaited<ReturnType<typeof loadMediabunny>>;
type MbInput = InstanceType<MediabunnyModule['Input']>;

type PreparedItem =
  | {
      kind: 'video';
      input: MbInput;
      range: { startSec: number; endSec: number; durationSec: number };
      muteAudio: boolean;
    }
  | { kind: 'image'; bitmap: ImageBitmap; durationSec: number };

export async function composeTimeline(options: ComposeTimelineOptions): Promise<SpliceResult> {
  const { items, signal } = options;
  if (items.length < 1) {
    throw new Error('Timeline requires at least one item');
  }

  const mb = await loadMediabunny();
  throwIfAborted(signal);

  const prepared: PreparedItem[] = [];
  let targetWidth = 0;
  let targetHeight = 0;

  try {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];

      if (item.kind === 'image') {
        const bitmap = await createImageBitmap(item.blob);
        const durationSec = item.durationSec && item.durationSec > 0 ? item.durationSec : DEFAULT_STILL_DURATION_SEC;
        if (targetWidth === 0) {
          targetWidth = bitmap.width;
          targetHeight = bitmap.height;
        }
        prepared.push({ kind: 'image', bitmap, durationSec });
        continue;
      }

      const input = new mb.Input({ source: new mb.BlobSource(item.blob), formats: mb.ALL_FORMATS });
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack) {
        throw new Error(`Item ${i + 1}: no video track found`);
      }
      const width = await videoTrack.getCodedWidth();
      const height = await videoTrack.getCodedHeight();
      if (targetWidth === 0) {
        targetWidth = width;
        targetHeight = height;
      }
      const fullDuration = await input.computeDuration();
      const trimStart = Math.max(0, item.trimStartSec ?? 0);
      const trimEnd = item.trimEndSec !== undefined ? Math.min(item.trimEndSec, fullDuration) : fullDuration;
      if (trimEnd <= trimStart) {
        throw new Error(`Item ${i + 1}: trim range produces zero duration`);
      }
      prepared.push({
        kind: 'video',
        input,
        range: { startSec: trimStart, endSec: trimEnd, durationSec: trimEnd - trimStart },
        muteAudio: Boolean(item.muteAudio),
      });
    }

    if (targetWidth <= 0 || targetHeight <= 0) {
      throw new Error('Unable to determine target dimensions from the first item');
    }
    // avc requires even dimensions; image stills can be odd-sized.
    targetWidth -= targetWidth % 2;
    targetHeight -= targetHeight % 2;

    const offscreen = new OffscreenCanvas(targetWidth, targetHeight);
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      throw new Error('OffscreenCanvas 2D context unavailable');
    }

    const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
    const videoSource = new mb.CanvasSource(offscreen, {
      codec: 'avc',
      bitrate: options.videoBitrate ?? DEFAULT_VIDEO_BITRATE,
    });
    output.addVideoTrack(videoSource);
    const audioSource = new mb.AudioSampleSource({
      codec: 'aac',
      bitrate: options.audioBitrate ?? DEFAULT_AUDIO_BITRATE,
      transform: { numberOfChannels: TARGET_CHANNEL_COUNT, sampleRate: TARGET_SAMPLE_RATE },
    });
    output.addAudioTrack(audioSource);

    await output.start();
    throwIfAborted(signal);

    const totalDuration = prepared.reduce(
      (sum, item) => sum + (item.kind === 'image' ? item.durationSec : item.range.durationSec),
      0,
    );
    let processedDuration = 0;
    let cumulativeOffset = 0;

    for (let i = 0; i < prepared.length; i += 1) {
      const item = prepared[i];
      const onRangeProgress = (processedSecInItem: number) => {
        const progress = totalDuration > 0 ? (processedDuration + processedSecInItem) / totalDuration : 0;
        options.onProgress?.({ progress: Math.min(0.99, progress), processedClips: i, totalClips: prepared.length });
      };

      if (item.kind === 'image') {
        await appendStill({
          mb,
          bitmap: item.bitmap,
          durationSec: item.durationSec,
          ctx,
          videoSource,
          audioSource,
          targetWidth,
          targetHeight,
          cumulativeOffset,
          signal,
          onRangeProgress,
        });
        processedDuration += item.durationSec;
        cumulativeOffset += item.durationSec;
      } else {
        await appendRange({
          mb,
          input: item.input,
          range: item.range,
          ctx,
          videoSource,
          audioSource,
          targetWidth,
          targetHeight,
          cumulativeOffset,
          muteAudio: item.muteAudio,
          signal,
          onRangeProgress,
        });
        processedDuration += item.range.durationSec;
        cumulativeOffset += item.range.durationSec;
      }

      options.onProgress?.({
        progress: totalDuration > 0 ? processedDuration / totalDuration : 0,
        processedClips: i + 1,
        totalClips: prepared.length,
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

    options.onProgress?.({ progress: 1, processedClips: prepared.length, totalClips: prepared.length });

    return { blob, objectUrl, durationSec: totalDuration, width: targetWidth, height: targetHeight };
  } finally {
    for (const item of prepared) {
      if (item.kind === 'video') {
        try {
          (item.input as unknown as { dispose?: () => void }).dispose?.();
        } catch {
          // noop
        }
      } else {
        try {
          item.bitmap.close();
        } catch {
          // noop
        }
      }
    }
  }
}
