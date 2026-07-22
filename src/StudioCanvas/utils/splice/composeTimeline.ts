import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import { type ClipEffectSpec, speedFor } from '../render/effectSpec';
import {
  type ClipTransition,
  computeOutputPlacements,
  type FadeOverlay,
  headFadeFor,
  overlapInSecFor,
  tailFadeFor,
} from '../render/transitions';
import { appendRange, appendStill, loadMediabunny, throwIfAborted } from './appendRange';
import { type AudioPlanItem, feedMixdown, mixdownTimelineAudio } from './audioMix';
import { type CaptionCue, type CaptionWord, groupWordsIntoCues } from './captionCues';
import { appendOverlapTransition, type CrossDissolveClip } from './crossDissolve';
import { drawEffectFrame } from './frameDraw';
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
  // Per-clip audio gain (1 = unchanged) and manual audio fades, applied in the
  // mixdown on top of any transition crossfade.
  volume?: number;
  audioFadeInSec?: number;
  audioFadeOutSec?: number;
  // Per-clip visual/audio effects (color, opacity, transform, Ken Burns, speed,
  // text). Baked into the frame here so the export matches the CSS preview.
  effects?: ClipEffectSpec;
  // Transition into this clip from the previous one.
  transition?: ClipTransition;
};

// An overlay-track placement, composited over the base track at its absolute
// `startSec` (positioned/scaled via its transform effects).
export type TimelineOverlayRenderItem = {
  itemId: string;
  kind: 'video' | 'image';
  blob: Blob;
  startSec: number;
  trimStartSec?: number;
  trimEndSec?: number;
  durationSec?: number;
  // Overlay audio (video overlays only) is mixed into the timeline like a base
  // clip: silent unless the overlay has audio and is not muted.
  muteAudio?: boolean;
  volume?: number;
  audioFadeInSec?: number;
  audioFadeOutSec?: number;
  effects?: ClipEffectSpec;
};

export type ComposeTimelineOptions = {
  items: TimelineRenderItem[];
  overlays?: TimelineOverlayRenderItem[];
  videoBitrate?: number;
  audioBitrate?: number;
  // Export-preset frame size. When both are set the timeline is letterboxed into
  // these dimensions (aspect conversion); otherwise the first clip's size is used.
  targetWidth?: number;
  targetHeight?: number;
  // Editable caption cues (already in OUTPUT time) take precedence over the
  // flat-word compatibility input.
  captionCues?: CaptionCue[];
  captionWords?: CaptionWord[];
  captionStyle?: CaptionStyle;
  onProgress?: (progress: SpliceProgress) => void;
  signal?: AbortSignal;
};

type OverlayFrame = { image: CanvasImageSource; width: number; height: number };
type PreparedOverlay = {
  kind: 'video' | 'image';
  frameAt: (sourceSec: number) => Promise<OverlayFrame | null>;
  startSec: number;
  outputDurationSec: number;
  sourceStartSec: number;
  // Audio decode source (video overlays) + its mix settings; null/silent for images.
  audioInput: MbInput | null;
  sourceEndSec: number;
  muteAudio: boolean;
  volume: number;
  audioFadeInSec: number;
  audioFadeOutSec: number;
  effects?: ClipEffectSpec;
  dispose: () => void;
};

type MediabunnyModule = Awaited<ReturnType<typeof loadMediabunny>>;
type MbInput = InstanceType<MediabunnyModule['Input']>;

type PreparedItem = {
  headFade?: FadeOverlay;
  tailFade?: FadeOverlay;
} & (
  | {
      kind: 'video';
      input: MbInput;
      range: { startSec: number; endSec: number; durationSec: number };
      // Output seconds this clip occupies after speed (range.durationSec / speed).
      outputDurationSec: number;
      muteAudio: boolean;
      effects?: ClipEffectSpec;
    }
  | { kind: 'image'; bitmap: ImageBitmap; durationSec: number; effects?: ClipEffectSpec }
);

type CompositeOverlays = (
  ctx: OffscreenCanvasRenderingContext2D,
  outputTimestampSec: number,
) => Promise<void>;

function disposeInput(input: MbInput): void {
  try {
    (input as unknown as { dispose?: () => void }).dispose?.();
  } catch {
    // noop
  }
}

// Open each overlay's source and expose a frame accessor keyed by source time,
// so the compositor can draw the right overlay frame onto any base frame.
async function prepareOverlays(
  mb: MediabunnyModule,
  overlays: TimelineOverlayRenderItem[],
): Promise<PreparedOverlay[]> {
  const prepared: PreparedOverlay[] = [];
  for (const overlay of overlays) {
    if (overlay.kind === 'image') {
      const bitmap = await createImageBitmap(overlay.blob);
      const durationSec =
        overlay.durationSec && overlay.durationSec > 0
          ? overlay.durationSec
          : DEFAULT_STILL_DURATION_SEC;
      prepared.push({
        kind: 'image',
        frameAt: async () => ({ image: bitmap, width: bitmap.width, height: bitmap.height }),
        startSec: overlay.startSec,
        outputDurationSec: durationSec,
        sourceStartSec: 0,
        audioInput: null,
        sourceEndSec: durationSec,
        muteAudio: true,
        volume: 0,
        audioFadeInSec: 0,
        audioFadeOutSec: 0,
        effects: overlay.effects,
        dispose: () => {
          try {
            bitmap.close();
          } catch {
            // noop
          }
        },
      });
      continue;
    }
    const input = new mb.Input({
      source: new mb.BlobSource(overlay.blob),
      formats: mb.ALL_FORMATS,
    });
    const track = await input.getPrimaryVideoTrack();
    if (!track) {
      disposeInput(input);
      continue;
    }
    const width = await track.getCodedWidth();
    const height = await track.getCodedHeight();
    const fullDuration = await input.computeDuration();
    const trimStart = Math.max(0, overlay.trimStartSec ?? 0);
    const trimEnd =
      overlay.trimEndSec !== undefined ? Math.min(overlay.trimEndSec, fullDuration) : fullDuration;
    const sink = new mb.CanvasSink(track);
    prepared.push({
      kind: 'video',
      frameAt: async (sourceSec) => {
        const wrapped = await sink.getCanvas(sourceSec);
        return wrapped ? { image: wrapped.canvas, width, height } : null;
      },
      startSec: overlay.startSec,
      outputDurationSec: Math.max(0.1, trimEnd - trimStart),
      sourceStartSec: trimStart,
      audioInput: input,
      sourceEndSec: trimEnd,
      muteAudio: Boolean(overlay.muteAudio),
      volume: typeof overlay.volume === 'number' && overlay.volume >= 0 ? overlay.volume : 1,
      audioFadeInSec: Math.max(0, overlay.audioFadeInSec ?? 0),
      audioFadeOutSec: Math.max(0, overlay.audioFadeOutSec ?? 0),
      effects: overlay.effects,
      dispose: () => disposeInput(input),
    });
  }
  return prepared;
}

export async function composeTimeline(options: ComposeTimelineOptions): Promise<SpliceResult> {
  const { items, signal } = options;
  if (items.length < 1) {
    throw new Error('Timeline requires at least one item');
  }

  const mb = await loadMediabunny();
  throwIfAborted(signal);

  // Auto-caption cues (words are already output-time; group into rolling lines).
  const captionCues: CaptionCue[] | undefined = options.captionCues?.length
    ? options.captionCues
    : options.captionWords?.length
      ? groupWordsIntoCues([...options.captionWords].sort((a, b) => a.startSec - b.startSec))
      : undefined;
  const captionStyle = options.captionStyle;

  const prepared: PreparedItem[] = [];
  const preparedOverlays: PreparedOverlay[] = [];
  let targetWidth = 0;
  let targetHeight = 0;
  let cancelOutput: (() => Promise<void>) | undefined;
  let outputFinalized = false;

  try {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      // Color-ramp transitions (fade / dip to white) are single-clip: this clip's
      // head fade comes from its own transition, its tail from the next clip's.
      const headFade = headFadeFor(item.transition, i === 0);
      const tailFade = tailFadeFor(items[i + 1]?.transition);

      if (item.kind === 'image') {
        const bitmap = await createImageBitmap(item.blob);
        const durationSec =
          item.durationSec && item.durationSec > 0 ? item.durationSec : DEFAULT_STILL_DURATION_SEC;
        if (targetWidth === 0) {
          targetWidth = bitmap.width;
          targetHeight = bitmap.height;
        }
        prepared.push({
          kind: 'image',
          bitmap,
          durationSec,
          effects: item.effects,
          headFade,
          tailFade,
        });
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
      const trimEnd =
        item.trimEndSec !== undefined ? Math.min(item.trimEndSec, fullDuration) : fullDuration;
      if (trimEnd <= trimStart) {
        throw new Error(`Item ${i + 1}: trim range produces zero duration`);
      }
      const speed = speedFor(item.effects);
      prepared.push({
        kind: 'video',
        input,
        range: { startSec: trimStart, endSec: trimEnd, durationSec: trimEnd - trimStart },
        outputDurationSec: (trimEnd - trimStart) / speed,
        muteAudio: Boolean(item.muteAudio),
        effects: item.effects,
        headFade,
        tailFade,
      });
    }

    // An export preset overrides the source-derived size (aspect conversion via the
    // existing letterbox); otherwise the first clip's dimensions are used.
    if (options.targetWidth && options.targetHeight) {
      targetWidth = options.targetWidth;
      targetHeight = options.targetHeight;
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
      transform: { numberOfChannels: TARGET_CHANNEL_COUNT, sampleRate: TARGET_SAMPLE_RATE },
    });
    output.addAudioTrack(audioSource);

    await output.start();
    throwIfAborted(signal);

    // Overlay layers: opened once, then drawn over each base frame at the right
    // source time via a per-frame callback threaded into the append helpers.
    if (options.overlays && options.overlays.length > 0) {
      preparedOverlays.push(...(await prepareOverlays(mb, options.overlays)));
    }
    const compositeOverlays: CompositeOverlays | undefined =
      preparedOverlays.length === 0
        ? undefined
        : async (overlayCtx, outputTimestampSec) => {
            for (const overlay of preparedOverlays) {
              const local = outputTimestampSec - overlay.startSec;
              if (local < 0 || local >= overlay.outputDurationSec) continue;
              const sourceSec = overlay.kind === 'video' ? overlay.sourceStartSec + local : 0;
              const frame = await overlay.frameAt(sourceSec);
              if (!frame) continue;
              const t = overlay.outputDurationSec > 0 ? local / overlay.outputDurationSec : 0;
              drawEffectFrame(
                overlayCtx,
                frame.image,
                frame.width,
                frame.height,
                targetWidth,
                targetHeight,
                overlay.effects,
                t,
                1,
              );
            }
          };

    // Cross-dissolves overlap adjacent clips, so output placement (and the total)
    // come from the shared placement math the editor layout also uses.
    const { placements, totalSec: totalDuration } = computeOutputPlacements(
      prepared.map((item, index) => ({
        outputDurationSec: item.kind === 'image' ? item.durationSec : item.outputDurationSec,
        crossDissolveInSec: overlapInSecFor(items[index].transition),
      })),
    );

    const toCrossClip = (item: PreparedItem): CrossDissolveClip =>
      item.kind === 'image'
        ? {
            kind: 'image',
            bitmap: item.bitmap,
            durationSec: item.durationSec,
            effects: item.effects,
          }
        : {
            kind: 'video',
            input: item.input,
            range: item.range,
            speed: item.range.durationSec / item.outputDurationSec,
            outputDurationSec: item.outputDurationSec,
            muteAudio: item.muteAudio,
            effects: item.effects,
          };

    let processedDuration = 0;

    for (let i = 0; i < prepared.length; i += 1) {
      const item = prepared[i];
      const place = placements[i];
      const soloDuration = Math.max(0, place.soloEndSec - place.soloStartSec);
      const onRangeProgress = (processedSecInItem: number) => {
        const progress =
          totalDuration > 0 ? (processedDuration + processedSecInItem) / totalDuration : 0;
        options.onProgress?.({
          progress: Math.min(0.99, progress),
          processedClips: i,
          totalClips: prepared.length,
        });
      };

      // Solo segment: the part of this clip not consumed by a cross-dissolve.
      if (soloDuration > 0) {
        if (item.kind === 'image') {
          await appendStill({
            mb,
            bitmap: item.bitmap,
            durationSec: soloDuration,
            ctx,
            videoSource,
            audioSource,
            targetWidth,
            targetHeight,
            cumulativeOffset: place.soloStartSec,
            effects: item.effects,
            headFade: item.headFade,
            tailFade: item.tailFade,
            compositeOverlays,
            cues: captionCues,
            captionStyle,
            skipAudio: true,
            signal,
            onRangeProgress,
          });
        } else {
          const speed = item.range.durationSec / item.outputDurationSec;
          const srcStart = item.range.startSec + place.inOverlapSec * speed;
          const srcEnd = item.range.endSec - place.outOverlapSec * speed;
          await appendRange({
            mb,
            input: item.input,
            range: { startSec: srcStart, endSec: srcEnd, durationSec: srcEnd - srcStart },
            ctx,
            videoSource,
            audioSource,
            targetWidth,
            targetHeight,
            cumulativeOffset: place.soloStartSec,
            muteAudio: item.muteAudio,
            effects: item.effects,
            headFade: item.headFade,
            tailFade: item.tailFade,
            compositeOverlays,
            cues: captionCues,
            captionStyle,
            skipAudio: true,
            signal,
            onRangeProgress,
          });
        }
      }
      processedDuration += soloDuration;

      // Cross-dissolve overlap with the next clip (blends both onto the seam).
      if (place.outOverlapSec > 0 && i + 1 < prepared.length) {
        await appendOverlapTransition({
          mb,
          ctx,
          videoSource,
          targetWidth,
          targetHeight,
          // The overlap between clip i and i+1 is driven by i+1's incoming transition.
          type: items[i + 1]?.transition?.type ?? 'crossDissolve',
          outgoing: toCrossClip(item),
          incoming: toCrossClip(prepared[i + 1]),
          overlapOutputSec: place.outOverlapSec,
          outputStart: place.soloEndSec,
          compositeOverlays,
          signal,
        });
        processedDuration += place.outOverlapSec;
      }

      options.onProgress?.({
        progress: totalDuration > 0 ? processedDuration / totalDuration : 0,
        processedClips: i + 1,
        totalClips: prepared.length,
      });
    }

    // Audio: one PCM mixdown for the whole timeline. Base video clips build the
    // plan here; overlay + bed tracks add themselves in later waves. Cross-dissolve
    // overlaps sum via complementary fade envelopes (= a crossfade); color-ramp
    // transitions (fade/dip) fade audio to silence over the same window. Always fed
    // (a silent master when nothing has audio) so the audio track spans the video.
    const audioPlan: AudioPlanItem[] = [];
    for (let i = 0; i < prepared.length; i += 1) {
      const item = prepared[i];
      if (item.kind !== 'video' || item.muteAudio) continue;
      const src = items[i];
      const place = placements[i];
      audioPlan.push({
        input: item.input,
        sourceStartSec: item.range.startSec,
        sourceEndSec: item.range.endSec,
        speed: item.range.durationSec / item.outputDurationSec,
        outputStartSec: place.outputStartSec,
        gain: typeof src.volume === 'number' && src.volume >= 0 ? src.volume : 1,
        fadeInSec: Math.max(
          place.inOverlapSec,
          item.headFade?.durationSec ?? 0,
          src.audioFadeInSec ?? 0,
        ),
        fadeOutSec: Math.max(
          place.outOverlapSec,
          item.tailFade?.durationSec ?? 0,
          src.audioFadeOutSec ?? 0,
        ),
      });
    }
    // Overlay-track audio floats on top at each overlay's absolute startSec.
    for (const overlay of preparedOverlays) {
      if (!overlay.audioInput || overlay.muteAudio) continue;
      audioPlan.push({
        input: overlay.audioInput,
        sourceStartSec: overlay.sourceStartSec,
        sourceEndSec: overlay.sourceEndSec,
        speed: 1,
        outputStartSec: overlay.startSec,
        gain: overlay.volume,
        fadeInSec: overlay.audioFadeInSec,
        fadeOutSec: overlay.audioFadeOutSec,
      });
    }
    const audioMaster = await mixdownTimelineAudio(mb, audioPlan, totalDuration, signal);
    await feedMixdown(mb, audioSource, audioMaster, signal);
    throwIfAborted(signal);

    await output.finalize();
    outputFinalized = true;

    const buffer = output.target.buffer;
    if (!buffer) {
      throw new Error('Output buffer was not produced');
    }

    const mimeType = await output.getMimeType().catch(() => 'video/mp4');
    const blob = new Blob([buffer], { type: mimeType });
    const objectUrl = URL.createObjectURL(blob);

    options.onProgress?.({
      progress: 1,
      processedClips: prepared.length,
      totalClips: prepared.length,
    });

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
    for (const item of prepared) {
      if (item.kind === 'video') {
        disposeInput(item.input);
      } else {
        try {
          item.bitmap.close();
        } catch {
          // noop
        }
      }
    }
    for (const overlay of preparedOverlays) {
      overlay.dispose();
    }
  }
}
