import type { EditorClipTiming } from '@continuum/contracts';
import type { CaptionStyle } from '@/lib/clips/clipCaptionStyle';
import type { ClipEffectSpec } from '../render/effectSpec';
import { drawTextOverlays, resolveTextOverlays } from '../render/effectSpec';
import {
  type ClipTransitionType,
  type OverlapLayerXform,
  overlapTransitionAt,
} from '../render/transitions';
import { throwIfAborted } from './appendRange';
import { type CaptionCue, findActiveCues } from './captionCues';
import { drawActiveCaption } from './drawCaptions';
import { drawFrameComposition } from './frameComposition';
import { drawEffectFrame } from './frameDraw';
import { drawCanvasBackground } from './letterbox';
import { sourceSecAt } from './sourceClock';

// Renders the overlap window of an OVERLAP transition (crossDissolve, slide, wipe,
// zoom, spin, blur, whip, zoomBlur, glitch): the outgoing clip's tail and the incoming clip's head composited on
// the same frames. crossDissolve blends by alpha; the others move/reveal/scale/
// rotate the incoming clip per `overlapTransitionAt`. This is the two-clip VIDEO
// path the sequential appendRange loop can't express — composeTimeline calls it
// between a clip's solo segment and the next. Audio for the overlap is handled by
// the global PCM mixdown (audioMix): both clips' envelopes fade and sum.

type MediabunnyModule = typeof import('mediabunny');
type MbInput = InstanceType<MediabunnyModule['Input']>;
type MbCanvasSource = InstanceType<MediabunnyModule['CanvasSource']>;
type Frame = { image: CanvasImageSource; width: number; height: number };

const OVERLAP_FPS = 30;

// Draw one overlap layer (a clip's frame) under its per-frame transition transform
// (translate/scale/rotate/clip + alpha), on top of its own clip effects.
async function drawOverlapLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  frame: Frame,
  effects: ClipEffectSpec | undefined,
  clipT: number,
  xform: OverlapLayerXform,
  targetWidth: number,
  targetHeight: number,
  timeSec: number,
  backgroundColor?: string,
): Promise<void> {
  if (xform.fx) {
    await drawFxLayer(
      ctx,
      frame,
      effects,
      clipT,
      xform,
      targetWidth,
      targetHeight,
      timeSec,
      backgroundColor,
    );
    return;
  }
  ctx.save();
  try {
    if (xform.clip) {
      ctx.beginPath();
      ctx.rect(xform.clip.x, xform.clip.y, xform.clip.w, xform.clip.h);
      ctx.clip();
    }
    if (xform.translateX || xform.translateY) ctx.translate(xform.translateX, xform.translateY);
    if (xform.scale !== 1 || xform.rotate !== 0) {
      const cx = targetWidth / 2;
      const cy = targetHeight / 2;
      ctx.translate(cx, cy);
      if (xform.rotate) ctx.rotate(xform.rotate);
      if (xform.scale !== 1) ctx.scale(xform.scale, xform.scale);
      ctx.translate(-cx, -cy);
    }
    await drawEffectFrame(
      ctx,
      frame.image,
      frame.width,
      frame.height,
      targetWidth,
      targetHeight,
      effects,
      clipT,
      xform.alpha,
      timeSec,
    );
    const textOverlays = resolveTextOverlays(effects);
    if (textOverlays.length > 0) {
      ctx.globalAlpha *= xform.alpha;
      drawTextOverlays(ctx, textOverlays, targetWidth, targetHeight);
    }
  } finally {
    ctx.restore();
  }
}

// ---- Layers with post-processing (blur, whip, zoom-through, glitch) ---------------------
//
// These layers are drawn in three steps instead of straight onto the frame: the shot, with
// its own effects, onto a scratch canvas; that scratch sampled several times along the
// layer's motion (or scale) into a second one, which is what a smear IS; then the result
// composited with the transition's alpha, a gaussian blur, or split into colour channels.
// Four module-level buffers, because allocating a 1080p canvas per frame is the cliff of
// this path; every draw below is synchronous, so a shared buffer is safe.

const TRAIL_SAMPLES = 12;
const ZOOM_SAMPLES = 10;
type Slot = 'layer' | 'result' | 'copy' | 'channel';
const buffers: Partial<Record<Slot, OffscreenCanvas>> = {};

function bufferContext(
  slot: Slot,
  width: number,
  height: number,
): OffscreenCanvasRenderingContext2D {
  let canvas = buffers[slot];
  if (!canvas || canvas.width !== width || canvas.height !== height) {
    canvas = new OffscreenCanvas(width, height);
    buffers[slot] = canvas;
  }
  const bufferCtx = canvas.getContext('2d');
  if (!bufferCtx) throw new Error('OffscreenCanvas 2D context unavailable');
  bufferCtx.setTransform(1, 0, 0, 1, 0, 0);
  bufferCtx.filter = 'none';
  bufferCtx.globalAlpha = 1;
  bufferCtx.globalCompositeOperation = 'source-over';
  bufferCtx.clearRect(0, 0, width, height);
  return bufferCtx;
}

async function drawFxLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  frame: Frame,
  effects: ClipEffectSpec | undefined,
  clipT: number,
  xform: OverlapLayerXform,
  width: number,
  height: number,
  timeSec: number,
  backgroundColor: string | undefined,
): Promise<void> {
  const fx = xform.fx;
  if (!fx || xform.alpha <= 0) return;
  const layerCtx = bufferContext('layer', width, height);
  drawCanvasBackground(layerCtx, width, height, backgroundColor);
  await drawEffectFrame(
    layerCtx,
    frame.image,
    frame.width,
    frame.height,
    width,
    height,
    effects,
    clipT,
    1,
    timeSec,
  );
  const textOverlays = resolveTextOverlays(effects);
  if (textOverlays.length > 0) drawTextOverlays(layerCtx, textOverlays, width, height);

  // Sample the shot along its motion: equal-weight samples by painting sample i at 1/(i+1).
  const resultCtx = bufferContext('result', width, height);
  const torn = fx.rgbSplitPx !== undefined;
  if (torn) {
    resultCtx.fillStyle = '#000';
    resultCtx.fillRect(0, 0, width, height);
  }
  const samples = fx.trail ? TRAIL_SAMPLES : fx.zoomTrail ? ZOOM_SAMPLES : 1;
  // A blur samples past the frame edge, which is transparent: grow the shot just enough
  // that the soft edge falls outside the frame instead of darkening it.
  const grow = 1 + ((fx.blurPx ?? 0) * 2) / Math.min(width, height);
  for (let i = 0; i < samples; i += 1) {
    const along = samples === 1 ? 0 : i / (samples - 1) - 0.5;
    resultCtx.save();
    // Blur while sampling, where the grown shot still has real pixels past the frame edge.
    if (fx.blurPx && fx.blurPx > 0.05) resultCtx.filter = `blur(${fx.blurPx}px)`;
    resultCtx.globalAlpha = 1 / (i + 1);
    resultCtx.translate(
      xform.translateX + (fx.trail?.dx ?? 0) * along + (fx.shift?.x ?? 0),
      xform.translateY + (fx.trail?.dy ?? 0) * along + (fx.shift?.y ?? 0),
    );
    // The smear only streaks outward (scale >= the shot's own): shrinking samples would
    // leave transparent edges that read as a dark rim.
    const scale = xform.scale * grow * (1 + (fx.zoomTrail ?? 0) * (along + 0.5));
    if (scale !== 1 || xform.rotate !== 0) {
      resultCtx.translate(width / 2, height / 2);
      if (xform.rotate) resultCtx.rotate(xform.rotate);
      resultCtx.scale(scale, scale);
      resultCtx.translate(-width / 2, -height / 2);
    }
    resultCtx.drawImage(buffers.layer as OffscreenCanvas, 0, 0);
    resultCtx.restore();
  }

  if (fx.slices?.length) {
    // Bands torn sideways, wrapping round the frame edge.
    const copyCtx = bufferContext('copy', width, height);
    copyCtx.drawImage(buffers.result as OffscreenCanvas, 0, 0);
    const copy = buffers.copy as OffscreenCanvas;
    for (const slice of fx.slices) {
      resultCtx.clearRect(0, slice.y, width, slice.h);
      for (const wrap of [0, slice.shiftPx > 0 ? -width : width])
        resultCtx.drawImage(
          copy,
          0,
          slice.y,
          width,
          slice.h,
          slice.shiftPx + wrap,
          slice.y,
          width,
          slice.h,
        );
    }
  }

  const result = buffers.result as OffscreenCanvas;
  ctx.save();
  try {
    ctx.globalAlpha = Math.min(1, xform.alpha);
    if (fx.rgbSplitPx) {
      // Each channel on its own, pushed apart, summed back over black.
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      for (const [color, dx] of [
        ['#ff0000', -fx.rgbSplitPx],
        ['#00ff00', 0],
        ['#0000ff', fx.rgbSplitPx],
      ] as const) {
        const channelCtx = bufferContext('channel', width, height);
        channelCtx.fillStyle = color;
        channelCtx.fillRect(0, 0, width, height);
        channelCtx.globalCompositeOperation = 'multiply';
        channelCtx.drawImage(result, 0, 0);
        ctx.drawImage(buffers.channel as OffscreenCanvas, dx, 0);
      }
    } else {
      ctx.drawImage(result, 0, 0);
    }
  } finally {
    ctx.restore();
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

export type CrossDissolveClip =
  | {
      kind: 'video';
      input: MbInput;
      range: { startSec: number; endSec: number; durationSec: number };
      speed: number;
      outputDurationSec: number;
      muteAudio: boolean;
      effects?: ClipEffectSpec;
      /** A reversed or speed-ramped clip: clip-local output time -> source second. */
      clock?: EditorClipTiming;
    }
  | { kind: 'image'; bitmap: ImageBitmap; durationSec: number; effects?: ClipEffectSpec };

type FrameProvider = {
  frameAt: (
    sourceSec: number,
  ) => Promise<{ image: CanvasImageSource; width: number; height: number } | null>;
};

async function makeFrameProvider(
  mb: MediabunnyModule,
  clip: CrossDissolveClip,
): Promise<FrameProvider> {
  if (clip.kind === 'image') {
    const frame = { image: clip.bitmap, width: clip.bitmap.width, height: clip.bitmap.height };
    return { frameAt: async () => frame };
  }
  const track = await clip.input.getPrimaryVideoTrack();
  if (!track) return { frameAt: async () => null };
  const width = await track.getCodedWidth();
  const height = await track.getCodedHeight();
  const sink = new mb.CanvasSink(track);
  return {
    frameAt: async (sourceSec) => {
      const wrapped = await sink.getCanvas(sourceSec);
      return wrapped ? { image: wrapped.canvas, width, height } : null;
    },
  };
}

const clipOutputDuration = (clip: CrossDissolveClip): number =>
  clip.kind === 'video' ? clip.outputDurationSec : clip.durationSec;

export async function appendOverlapTransition(params: {
  mb: MediabunnyModule;
  ctx: OffscreenCanvasRenderingContext2D;
  videoSource: MbCanvasSource;
  targetWidth: number;
  targetHeight: number;
  backgroundColor?: string;
  type: ClipTransitionType;
  outgoing: CrossDissolveClip;
  incoming: CrossDissolveClip;
  overlapOutputSec: number;
  outputStart: number;
  frameTimeSec?: number;
  compositeOverlays?: (
    ctx: OffscreenCanvasRenderingContext2D,
    outputTimestampSec: number,
  ) => Promise<void>;
  cues?: CaptionCue[] | null;
  captionStyle?: CaptionStyle;
  signal?: AbortSignal;
  onFrameProgress?: (processedSec: number) => void;
}): Promise<void> {
  const {
    mb,
    ctx,
    videoSource,
    targetWidth,
    targetHeight,
    type,
    outgoing,
    incoming,
    overlapOutputSec: overlap,
    outputStart,
    compositeOverlays,
    cues,
    captionStyle,
    signal,
  } = params;

  const snapshotLocal =
    params.frameTimeSec === undefined ? undefined : params.frameTimeSec - outputStart;
  if (snapshotLocal !== undefined && (snapshotLocal < 0 || snapshotLocal >= overlap)) return;
  const outProvider = await makeFrameProvider(mb, outgoing);
  const inProvider = await makeFrameProvider(mb, incoming);

  const outDuration = clipOutputDuration(outgoing);
  const inDuration = clipOutputDuration(incoming);

  const frameDuration = 1 / OVERLAP_FPS;
  const frameCount = Math.max(1, Math.round(overlap * OVERLAP_FPS));

  for (let frame = 0; frame < frameCount; frame += 1) {
    throwIfAborted(signal);
    const u = snapshotLocal ?? frame * frameDuration;
    const t = overlap > 0 ? Math.min(1, u / overlap) : 1;

    // Source time within each clip: the outgoing clip's tail, the incoming's head.
    const outSourceSec =
      outgoing.kind !== 'video'
        ? 0
        : outgoing.clock
          ? sourceSecAt(outgoing.clock, outDuration - overlap + u, outgoing.range)
          : outgoing.range.endSec - (overlap - u) * outgoing.speed;
    const inSourceSec =
      incoming.kind !== 'video'
        ? 0
        : incoming.clock
          ? sourceSecAt(incoming.clock, u, incoming.range)
          : incoming.range.startSec + u * incoming.speed;
    const outFrame = await outProvider.frameAt(outSourceSec);
    const inFrame = await inProvider.frameAt(inSourceSec);

    // Normalized clip time keeps Ken Burns/animated effects continuous.
    const outT = outDuration > 0 ? (outDuration - overlap + u) / outDuration : 0;
    const inT = inDuration > 0 ? u / inDuration : 0;

    const xform = overlapTransitionAt(type, t, targetWidth, targetHeight);
    const outputTimestamp = outputStart + u;
    const activeCues = cues?.length ? findActiveCues(cues, outputTimestamp) : [];
    await drawFrameComposition({
      drawBase: async () => {
        drawCanvasBackground(ctx, targetWidth, targetHeight, params.backgroundColor);
        if (outFrame) {
          await drawOverlapLayer(
            ctx,
            outFrame,
            outgoing.effects,
            outT,
            xform.outgoing,
            targetWidth,
            targetHeight,
            outDuration - overlap + u,
            params.backgroundColor,
          );
        }
        if (inFrame) {
          await drawOverlapLayer(
            ctx,
            inFrame,
            incoming.effects,
            inT,
            xform.incoming,
            targetWidth,
            targetHeight,
            u,
            params.backgroundColor,
          );
        }
      },
      ...(compositeOverlays ? { drawOverlays: () => compositeOverlays(ctx, outputTimestamp) } : {}),
      ...(activeCues.length
        ? {
            drawCaption: () => {
              for (const cue of activeCues) {
                drawActiveCaption(
                  ctx,
                  cue,
                  outputTimestamp,
                  targetWidth,
                  targetHeight,
                  captionStyle,
                );
              }
            },
          }
        : {}),
    });
    if (snapshotLocal !== undefined) return;
    await videoSource.add(outputStart + u, frameDuration);
    params.onFrameProgress?.(u);
  }
}
