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
  ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
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
