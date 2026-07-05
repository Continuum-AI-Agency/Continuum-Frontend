import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import {
  type ClipEffectSpec,
  drawTextOverlays,
  resolveTextOverlays,
  speedFor,
} from '../render/effectSpec';
import { type FadeOverlay, transitionOverlayAt } from '../render/transitions';
import { type CaptionCue, findActiveCue } from './captionCues';
import { drawActiveCaption } from './drawCaptions';
import { drawClipFrame, drawFadeOverlay } from './frameDraw';

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
  // Word-synced caption cues on the OUTPUT timeline (already re-mapped past removed
  // dead space). Omitted/null disables caption burn-in entirely (zero cost).
  cues?: CaptionCue[] | null;
  // Brand-derived caption colors/font. Falls back to the renderer default.
  captionStyle?: CaptionStyle;
  // Per-clip effects (color, opacity, transform, Ken Burns, speed, text).
  effects?: ClipEffectSpec;
  // Fade/dip transition ramps at the clip's head (from its own transition) and
  // tail (from the next clip's transition).
  headFade?: FadeOverlay;
  tailFade?: FadeOverlay;
  // Draws overlay-track layers onto the frame at the given output timestamp.
  compositeOverlays?: (
    ctx: OffscreenCanvasRenderingContext2D,
    outputTimestampSec: number,
  ) => Promise<void>;
  // When true, this range emits NO audio (no inline samples, no silence fill): the
  // Video Editor render handles all audio in a single PCM mixdown pass (audioMix).
  // The Video Splicer leaves this false and keeps inline per-range audio.
  skipAudio?: boolean;
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
    cues,
    captionStyle,
    effects,
    headFade,
    tailFade,
    compositeOverlays,
    skipAudio,
    signal,
  } = params;

  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) {
    throw new Error('Range has no video track');
  }
  const sourceWidth = await videoTrack.getCodedWidth();
  const sourceHeight = await videoTrack.getCodedHeight();

  // Speed compresses source time into output time; a 2x clip emits each source
  // frame with half the output duration at half the output timestamp spacing.
  const speed = speedFor(effects);
  const sourceSpan = range.endSec - range.startSec;
  const outputDurationSec = sourceSpan / speed;
  const overlays = resolveTextOverlays(effects);

  const canvasSink = new mb.CanvasSink(videoTrack);
  for await (const wrapped of canvasSink.canvases(range.startSec, range.endSec)) {
    throwIfAborted(signal);
    const localTimestamp = wrapped.timestamp - range.startSec;
    if (localTimestamp < 0) continue;
    const outputDuration = Math.max(wrapped.duration / speed, 1 / 240);
    const outputTimestamp = cumulativeOffset + localTimestamp / speed;
    const localOut = localTimestamp / speed;
    const clipT = sourceSpan > 0 ? localTimestamp / sourceSpan : 0;
    drawClipFrame(
      ctx,
      wrapped.canvas,
      sourceWidth,
      sourceHeight,
      targetWidth,
      targetHeight,
      effects,
      clipT,
    );
    if (cues && cues.length > 0) {
      const cue = findActiveCue(cues, outputTimestamp);
      if (cue)
        drawActiveCaption(ctx, cue, outputTimestamp, targetWidth, targetHeight, captionStyle);
    }
    if (overlays.length > 0) drawTextOverlays(ctx, overlays, targetWidth, targetHeight);
    if (compositeOverlays) await compositeOverlays(ctx, outputTimestamp);
    const fade = transitionOverlayAt(localOut, outputDurationSec, headFade, tailFade);
    if (fade) drawFadeOverlay(ctx, fade.color, fade.alpha, targetWidth, targetHeight);
    await videoSource.add(outputTimestamp, outputDuration);
    params.onRangeProgress?.((localTimestamp + wrapped.duration) / speed);
  }
  // The Video Editor mixdown owns all audio; skip inline audio entirely here.
  if (skipAudio) return;
  // Pitch-preserving speed for audio needs a resampler; until then, sped/slowed
  // clips play silent rather than glitchy. Native-speed clips keep their audio.
  const audioTrack = muteAudio || speed !== 1 ? null : await input.getPrimaryAudioTrack();
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
    await fillSilence(mb, audioSource, outputDurationSec, cumulativeOffset, signal);
  }
}

// Emit `durationSec` of silent stereo audio starting at `cumulativeOffset`. Used
// for muted video ranges and for image stills (which have no native audio).
export async function fillSilence(
  mb: MediabunnyModule,
  audioSource: MbAudioSampleSource,
  durationSec: number,
  cumulativeOffset: number,
  signal?: AbortSignal,
): Promise<void> {
  let silenceOffset = 0;
  while (silenceOffset < durationSec) {
    throwIfAborted(signal);
    const chunkDuration = Math.min(SILENCE_CHUNK_SECONDS, durationSec - silenceOffset);
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

const STILL_FPS = 30;

export type AppendStillParams = {
  mb: MediabunnyModule;
  bitmap: ImageBitmap;
  durationSec: number;
  ctx: OffscreenCanvasRenderingContext2D;
  videoSource: MbCanvasSource;
  audioSource: MbAudioSampleSource;
  targetWidth: number;
  targetHeight: number;
  cumulativeOffset: number;
  effects?: ClipEffectSpec;
  headFade?: FadeOverlay;
  tailFade?: FadeOverlay;
  compositeOverlays?: (
    ctx: OffscreenCanvasRenderingContext2D,
    outputTimestampSec: number,
  ) => Promise<void>;
  // Auto-caption cues burned in over the still at the current output time.
  cues?: CaptionCue[] | null;
  captionStyle?: CaptionStyle;
  // See AppendRangeParams.skipAudio — the Video Editor mixdown owns all audio.
  skipAudio?: boolean;
  signal?: AbortSignal;
  onRangeProgress?: (processedSecInRange: number) => void;
};

// Hold a still image for `durationSec`, emitting canvas frames at STILL_FPS. With
// no animated effect the frame is drawn once (avc encodes the repeats cheaply as
// P-frames); a Ken Burns effect redraws each frame with the interpolated
// transform. Audio is padded with matching silence so video/audio stay aligned.
export async function appendStill(params: AppendStillParams): Promise<void> {
  const {
    mb,
    bitmap,
    durationSec,
    ctx,
    videoSource,
    audioSource,
    targetWidth,
    targetHeight,
    cumulativeOffset,
    effects,
    headFade,
    tailFade,
    compositeOverlays,
    cues,
    captionStyle,
    skipAudio,
    signal,
  } = params;

  const hasCaptions = Boolean(cues && cues.length > 0);
  const overlays = resolveTextOverlays(effects);
  // A Ken Burns effect, fade ramp, or overlay layer changes the frame over time,
  // so the still must be redrawn each frame; otherwise draw it once (cheap avc
  // P-frames). Base frame + text first, then overlays, then the fade wash.
  const perFrame =
    Boolean(effects?.kenBurns) ||
    Boolean(headFade) ||
    Boolean(tailFade) ||
    Boolean(compositeOverlays) ||
    hasCaptions;
  const drawBase = (t: number) => {
    drawClipFrame(ctx, bitmap, bitmap.width, bitmap.height, targetWidth, targetHeight, effects, t);
    if (overlays.length > 0) drawTextOverlays(ctx, overlays, targetWidth, targetHeight);
  };
  if (!perFrame) drawBase(0);

  const frameDuration = 1 / STILL_FPS;
  let elapsed = 0;
  while (elapsed < durationSec) {
    throwIfAborted(signal);
    const duration = Math.min(frameDuration, durationSec - elapsed);
    const outputTimestamp = cumulativeOffset + elapsed;
    if (perFrame) drawBase(durationSec > 0 ? elapsed / durationSec : 0);
    if (compositeOverlays) await compositeOverlays(ctx, outputTimestamp);
    if (hasCaptions && cues) {
      const cue = findActiveCue(cues, outputTimestamp);
      if (cue)
        drawActiveCaption(ctx, cue, outputTimestamp, targetWidth, targetHeight, captionStyle);
    }
    const fade = transitionOverlayAt(elapsed, durationSec, headFade, tailFade);
    if (fade) drawFadeOverlay(ctx, fade.color, fade.alpha, targetWidth, targetHeight);
    await videoSource.add(outputTimestamp, duration);
    elapsed += duration;
    params.onRangeProgress?.(elapsed);
  }

  if (!skipAudio) await fillSilence(mb, audioSource, durationSec, cumulativeOffset, signal);
}
