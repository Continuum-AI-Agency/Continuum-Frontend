import { chromaKeyImageData } from '../pixel/chromaKey';
import {
  applyCanvasFilter,
  applyCanvasTransform,
  type ClipEffectSpec,
  cornerRadiusFracFor,
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
// A second buffer, only ever allocated for `pixelate`: the mosaic is a downscale
// followed by an upscale, and the downscale needs somewhere that is not the source
// and not the full-size scratch it is about to be drawn back onto.
let mosaic: OffscreenCanvas | null = null;

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
  ctx.imageSmoothingEnabled = true;
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

// ---- The pixel-effect primitives -------------------------------------------
//
// `vignette`, `filmGrain`, `pixelate`, `chromaticAberration` and `vhs` are the five
// effect presets with no CSS `filter` equivalent, so they cannot ride `filterString`
// and cannot appear in the DOM preview (`unpreviewableEffects` names them). Each is a
// draw-time step here instead.
//
// They all share ONE `getImageData`/`putImageData` round trip with the chroma key,
// because that round trip — not the arithmetic inside it — is the expensive part of
// this path at 1080p.
//
// ponytail: plain JS per-pixel loops, like `chromaKey.ts` next door. Fine for an
// offline render; if a realtime preview above 720p ever needs these, the upgrade path
// is a WebGL/WebGPU fragment shader, not a faster loop.

/**
 * Deterministic noise in -1..1 from a hashed sinusoid.
 *
 * Stateless on purpose — the same clip re-rendered must produce the same bytes, and a
 * seeded PRNG would have to be threaded through the worker to manage that. Same trick
 * as `cameraShakeKeyframes` in `utils/actions/videoOps.ts`.
 */
function hashNoise(x: number, y: number, seed: number): number {
  const hashed = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return (hashed - Math.floor(hashed)) * 2 - 1;
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** Read one channel from a pre-shift copy, clamping the sample to the frame. */
function sampleChannel(
  copy: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
): number {
  const sx = x < 0 ? 0 : x >= width ? width - 1 : x;
  const sy = y < 0 ? 0 : y >= height ? height - 1 : y;
  return copy[(sy * width + sx) * 4 + channel];
}

/**
 * Every per-pixel effect, in one pass over the frame.
 *
 * Order matters and is not arbitrary:
 *   chromaKey            — key the REAL colours, before anything displaces them
 *   chromaticAberration  — radial R/B split, sampled from the pre-shift copy
 *   vhs                  — horizontal smear + scanlines + per-row tape noise
 *   filmGrain            — additive noise
 *   vignette             — multiplicative darkening, LAST, so it darkens the grain too
 *                          (film is exposed through the lens, not stuck on after it)
 *
 * `pixelate` is not here: a mosaic is a resample, so it runs as two `drawImage` calls
 * before this pass ever reads a pixel.
 */
export function applyPixelEffects(
  image: ImageData,
  effects: ClipEffectSpec,
  width: number,
  height: number,
  t: number,
): void {
  const { data } = image;
  const aberration = effects.chromaticAberration?.amount ?? 0;
  const vhs = effects.vhs?.amount ?? 0;
  const grain = effects.filmGrain?.amount ?? 0;
  const vignette = effects.vignette?.amount ?? 0;

  if (effects.chromaKey) chromaKeyImageData(image, effects.chromaKey);

  // Displacement reads neighbours, so it cannot read the buffer it is writing. One
  // copy serves both displacing effects.
  const copy = aberration > 0 || vhs > 0 ? new Uint8ClampedArray(data) : undefined;

  // Grain and tape noise advance with the clip so they move frame to frame instead of
  // sitting on the picture like a decal — still deterministic, because the seed is the
  // clip's own normalized time.
  const frameSeed = Math.round(clamp01(t) * 1000);

  const aberrationMax = clamp01(aberration) * 0.01 * Math.min(width, height);
  const vhsShift = Math.round(clamp01(vhs) * 0.006 * width);

  for (let y = 0; y < height; y += 1) {
    const ny = (y + 0.5) / height / 0.5 - 1;
    // Tape noise is a per-ROW artefact (a bad head, a stretched tape), not per-pixel.
    const rowNoise = vhs > 0 ? hashNoise(0, y, frameSeed) * clamp01(vhs) * 18 : 0;
    const scanline = vhs > 0 && y % 2 === 1 ? 1 - 0.25 * clamp01(vhs) : 1;

    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const nx = (x + 0.5) / width / 0.5 - 1;

      if (copy) {
        let r = data[i];
        let b = data[i + 2];
        if (aberrationMax > 0) {
          // Zero at the centre, growing outward — which is what a real lens does.
          const dx = Math.round(nx * aberrationMax);
          const dy = Math.round(ny * aberrationMax);
          r = sampleChannel(copy, width, height, x + dx, y + dy, 0);
          b = sampleChannel(copy, width, height, x - dx, y - dy, 2);
        }
        if (vhsShift > 0) {
          r = sampleChannel(copy, width, height, x - vhsShift, y, 0);
          b = sampleChannel(copy, width, height, x + vhsShift, y, 2);
        }
        data[i] = r;
        data[i + 2] = b;
      }

      let delta = rowNoise;
      if (grain > 0) delta += hashNoise(x, y, frameSeed) * clamp01(grain) * 32;

      let scale = scanline;
      if (vignette > 0) {
        // Normalized radius: 0 at the centre, 1 at a corner.
        const radius = Math.sqrt(nx * nx + ny * ny) / Math.SQRT2;
        // Flat until 0.35, then quadratic to the corner — a lens falloff, not a ramp
        // that dims the subject.
        const falloff = clamp01((radius - 0.35) / 0.65);
        scale *= 1 - clamp01(vignette) * falloff * falloff;
      }

      if (delta !== 0 || scale !== 1) {
        data[i] = (data[i] + delta) * scale;
        data[i + 1] = (data[i + 1] + delta) * scale;
        data[i + 2] = (data[i + 2] + delta) * scale;
      }
    }
  }
}

/** Mosaic the scratch in place: downscale with smoothing off, then blow it back up. */
function pixelateScratch(ctx: Ctx, width: number, height: number, blockPx: number): void {
  const block = Math.max(2, Math.round(blockPx));
  const smallWidth = Math.max(1, Math.ceil(width / block));
  const smallHeight = Math.max(1, Math.ceil(height / block));
  if (!mosaic || mosaic.width !== smallWidth || mosaic.height !== smallHeight) {
    if (typeof OffscreenCanvas === 'undefined') return;
    mosaic = new OffscreenCanvas(smallWidth, smallHeight);
  }
  const small = mosaic.getContext('2d');
  if (!small) return;
  small.imageSmoothingEnabled = false;
  small.clearRect(0, 0, smallWidth, smallHeight);
  small.drawImage(scratch as CanvasImageSource, 0, 0, smallWidth, smallHeight);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(mosaic as CanvasImageSource, 0, 0, width, height);
  ctx.imageSmoothingEnabled = true;
}

/**
 * The source to actually draw, with the pixel-level effects already baked in.
 *
 * None of these can be applied to the TARGET context: by the time the frame is drawn
 * the context carries a transform, a filter, a `globalAlpha` and possibly a
 * non-`source-over` composite, none of which `putImageData` honours — it would write
 * raw device pixels over the black background and over any layer already composited
 * underneath. Working on the SOURCE instead leaves the letterbox rect, the transform,
 * the filter, the alpha and the blend mode entirely untouched downstream.
 *
 * `t` is the clip's normalized time, which is what lets grain and tape noise move
 * across the clip while staying byte-identical on a re-render.
 *
 * Returns the original source when there is nothing to do, so the common path
 * allocates and copies nothing.
 */
function prepareSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  effects: ClipEffectSpec | undefined,
  t: number,
): CanvasImageSource {
  const tint = effects?.tint && effects.tint.amount > 0 ? effects.tint : undefined;
  const pixelate =
    effects?.pixelate && effects.pixelate.blockPx >= 2 ? effects.pixelate : undefined;
  const perPixel = Boolean(
    effects &&
      (effects.chromaKey ||
        (effects.vignette && effects.vignette.amount > 0) ||
        (effects.filmGrain && effects.filmGrain.amount > 0) ||
        (effects.chromaticAberration && effects.chromaticAberration.amount > 0) ||
        (effects.vhs && effects.vhs.amount > 0)),
  );
  if (!perPixel && !tint && !pixelate) return source;
  if (sourceWidth <= 0 || sourceHeight <= 0) return source;

  const ctx = scratchContext(sourceWidth, sourceHeight);
  // No OffscreenCanvas (a non-worker or ancient runtime) — draw the frame unkeyed
  // rather than dropping it. The export is wrong in a visible way, not blank.
  if (!ctx) return source;

  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight);

  // A resample, so it runs before anything reads a pixel.
  if (pixelate) pixelateScratch(ctx, sourceWidth, sourceHeight, pixelate.blockPx);

  if (perPixel && effects) {
    const image = ctx.getImageData(0, 0, sourceWidth, sourceHeight);
    applyPixelEffects(image, effects, sourceWidth, sourceHeight, t);
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
  // Rounded corners clip the FRAME rect, so they follow the transform and survive a
  // cross-dissolve and an overlay for the same reason keying does. The radii are the
  // per-axis pair CSS `border-radius: N%` produces, which is what makes the preview
  // and the export the same shape rather than approximately the same shape.
  const radiusFrac = cornerRadiusFracFor(effects);
  if (radiusFrac > 0 && typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, [
      { x: radiusFrac * rect.width, y: radiusFrac * rect.height },
    ]);
    ctx.clip();
  }
  // Every path that draws a frame comes through HERE, not through `drawClipFrame`:
  // the cross-dissolve blends two of these per frame and `composeTimeline` draws each
  // overlay layer with one. Keying in `drawClipFrame` would have worked on a solo clip
  // and vanished during transitions and on every overlay — which is exactly the
  // greenscreen case (a keyed clip composited over a background).
  ctx.drawImage(
    prepareSource(source, sourceWidth, sourceHeight, effects, t),
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
