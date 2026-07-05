import type { ClipEffectSpec } from '../render/effectSpec';
import {
  type ClipTransitionType,
  type OverlapLayerXform,
  overlapTransitionAt,
} from '../render/transitions';
import { throwIfAborted } from './appendRange';
import { drawEffectFrame } from './frameDraw';

// Renders the overlap window of an OVERLAP transition (crossDissolve, slide, wipe,
// zoom, spin): the outgoing clip's tail and the incoming clip's head composited on
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
function drawOverlapLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  frame: Frame,
  effects: ClipEffectSpec | undefined,
  clipT: number,
  xform: OverlapLayerXform,
  targetWidth: number,
  targetHeight: number,
): void {
  ctx.save();
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
  drawEffectFrame(ctx, frame.image, frame.width, frame.height, targetWidth, targetHeight, effects, clipT, xform.alpha);
  ctx.restore();
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
    }
  | { kind: 'image'; bitmap: ImageBitmap; durationSec: number; effects?: ClipEffectSpec };

type FrameProvider = {
  frameAt: (sourceSec: number) => Promise<{ image: CanvasImageSource; width: number; height: number } | null>;
};

async function makeFrameProvider(mb: MediabunnyModule, clip: CrossDissolveClip): Promise<FrameProvider> {
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
  type: ClipTransitionType;
  outgoing: CrossDissolveClip;
  incoming: CrossDissolveClip;
  overlapOutputSec: number;
  outputStart: number;
  compositeOverlays?: (ctx: OffscreenCanvasRenderingContext2D, outputTimestampSec: number) => Promise<void>;
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
    signal,
  } = params;

  const outProvider = await makeFrameProvider(mb, outgoing);
  const inProvider = await makeFrameProvider(mb, incoming);

  const outDuration = clipOutputDuration(outgoing);
  const inDuration = clipOutputDuration(incoming);

  const frameDuration = 1 / OVERLAP_FPS;
  const frameCount = Math.max(1, Math.round(overlap * OVERLAP_FPS));

  for (let frame = 0; frame < frameCount; frame += 1) {
    throwIfAborted(signal);
    const u = frame * frameDuration;
    const t = overlap > 0 ? Math.min(1, u / overlap) : 1;

    // Source time within each clip: the outgoing clip's tail, the incoming's head.
    const outSourceSec = outgoing.kind === 'video' ? outgoing.range.endSec - (overlap - u) * outgoing.speed : 0;
    const inSourceSec = incoming.kind === 'video' ? incoming.range.startSec + u * incoming.speed : 0;
    const outFrame = await outProvider.frameAt(outSourceSec);
    const inFrame = await inProvider.frameAt(inSourceSec);

    // Normalized clip time keeps Ken Burns/animated effects continuous.
    const outT = outDuration > 0 ? (outDuration - overlap + u) / outDuration : 0;
    const inT = inDuration > 0 ? u / inDuration : 0;

    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    const xform = overlapTransitionAt(type, t, targetWidth, targetHeight);
    if (outFrame) drawOverlapLayer(ctx, outFrame, outgoing.effects, outT, xform.outgoing, targetWidth, targetHeight);
    if (inFrame) drawOverlapLayer(ctx, inFrame, incoming.effects, inT, xform.incoming, targetWidth, targetHeight);
    if (compositeOverlays) await compositeOverlays(ctx, outputStart + u);
    await videoSource.add(outputStart + u, frameDuration);
    params.onFrameProgress?.(u);
  }
}
