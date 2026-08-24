import { chromaKeyImageData } from '../pixel/chromaKey';
import {
  applyCanvasFilter,
  applyCanvasTransform,
  type ClipEffectSpec,
  hasVisualEffects,
  opacityFor,
  resolveTransformAt,
} from '../render/effectSpec';
import { computeLetterboxRect, drawLetterboxed } from './letterbox';

// Shared frame-drawing primitives for the timeline renderer. `drawClipFrame`
// draws a single letterboxed frame with the clip's effects (used for solos);
// `drawEffectFrame` is the effect-only draw (no black fill) with an alpha
// multiplier, used to blend two clips during a cross-dissolve; `drawFadeOverlay`
// washes the frame with a color for fade/dip transitions.

type Ctx = OffscreenCanvasRenderingContext2D;

// One reusable scratch canvas for the pixel-level effects below. Allocating a
// 1080p OffscreenCanvas per frame is the perf cliff of this whole path, and a
// single buffer is safe here because every draw is synchronous: even the
// cross-dissolve, which prepares two sources per frame, has already blitted the
// first onto the target before it asks for the second.
let scratch: OffscreenCanvas | null = null;

function scratchContext(width: number, height: number): Ctx | null {
  if (!scratch || scratch.width !== width || scratch.height !== height) {
    if (typeof OffscreenCanvas === 'undefined') return null;
    scratch = new OffscreenCanvas(width, height);
  }
  const ctx = scratch.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

/**
 * The source to actually draw, with the pixel-level effects already baked in.
 *
 * Chroma key and tint cannot be applied to the TARGET context: by the time the frame
 * is drawn the context carries a transform, a filter, a `globalAlpha` and possibly a
 * non-`source-over` composite, none of which `putImageData` honours — it would write
 * raw device pixels over the black background and over any layer already composited
 * underneath. Keying the SOURCE instead leaves the letterbox rect, the transform, the
 * filter, the alpha and the blend mode entirely untouched downstream.
 *
 * Returns the original source when there is nothing to do, so the common path
 * allocates and copies nothing.
 */
function prepareSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  effects: ClipEffectSpec | undefined,
): CanvasImageSource {
  const key = effects?.chromaKey;
  const tint = effects?.tint && effects.tint.amount > 0 ? effects.tint : undefined;
  if (!key && !tint) return source;
  if (sourceWidth <= 0 || sourceHeight <= 0) return source;

  const ctx = scratchContext(sourceWidth, sourceHeight);
  // No OffscreenCanvas (a non-worker or ancient runtime) — draw the frame unkeyed
  // rather than dropping it. The export is wrong in a visible way, not blank.
  if (!ctx) return source;

  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight);

  if (key) {
    const image = ctx.getImageData(0, 0, sourceWidth, sourceHeight);
    chromaKeyImageData(image, key);
    ctx.putImageData(image, 0, 0);
  }

  if (tint) {
    // `source-atop` over the scratch — which holds only the source's own pixels —
    // washes the subject and leaves the keyed-out background alone. Over the target
    // it would also have painted the letterbox bars.
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = Math.min(1, Math.max(0, tint.amount));
    ctx.fillStyle = tint.color;
    ctx.fillRect(0, 0, sourceWidth, sourceHeight);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  return scratch as CanvasImageSource;
}

/**
 * Draw a frame under the clip's effects (transform/filter/opacity), scaling
 * `alphaMul` into the opacity. Does NOT fill a background, so a caller can layer
 * two of these for a cross-dissolve. `t` is the clip's normalized time (0..1).
 */
export function drawEffectFrame(
  ctx: Ctx,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  effects: ClipEffectSpec | undefined,
  t: number,
  alphaMul = 1,
): void {
  ctx.save();
  ctx.globalAlpha = (effects ? opacityFor(effects) : 1) * alphaMul;
  if (effects?.blendMode && effects.blendMode !== 'normal') {
    ctx.globalCompositeOperation = effects.blendMode;
  }
  applyCanvasFilter(ctx, effects);
  if (effects) {
    applyCanvasTransform(ctx, resolveTransformAt(effects, t), targetWidth, targetHeight, {
      h: effects.flipH,
      v: effects.flipV,
    });
  }
  const rect = computeLetterboxRect(sourceWidth, sourceHeight, targetWidth, targetHeight);
  // Every path that draws a frame comes through HERE, not through `drawClipFrame`:
  // the cross-dissolve blends two of these per frame and `composeTimeline` draws each
  // overlay layer with one. Keying in `drawClipFrame` would have worked on a solo clip
  // and vanished during transitions and on every overlay — which is exactly the
  // greenscreen case (a keyed clip composited over a background).
  ctx.drawImage(
    prepareSource(source, sourceWidth, sourceHeight, effects),
    rect.x,
    rect.y,
    rect.width,
    rect.height,
  );
  ctx.restore();
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * Draw one source frame with the clip's visual effects baked in. Without effects
 * this is a plain letterbox; with effects the frame is drawn over a black
 * background under the clip's transform/filter/opacity, mirroring the CSS
 * preview.
 */
export function drawClipFrame(
  ctx: Ctx,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  effects: ClipEffectSpec | undefined,
  t: number,
): void {
  if (!effects || !hasVisualEffects(effects)) {
    drawLetterboxed(ctx, source, sourceWidth, sourceHeight, targetWidth, targetHeight);
    return;
  }
  ctx.filter = 'none';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  drawEffectFrame(ctx, source, sourceWidth, sourceHeight, targetWidth, targetHeight, effects, t, 1);
}

/** Draw a full-frame color wash at the given alpha — the fade/dip transition. */
export function drawFadeOverlay(
  ctx: Ctx,
  color: string,
  alpha: number,
  targetWidth: number,
  targetHeight: number,
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.filter = 'none';
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, targetWidth, targetHeight);
  ctx.restore();
}
