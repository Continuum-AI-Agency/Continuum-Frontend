// Shared per-clip effect spec — the single source of truth for both the DOM
// preview (CSS) and the mediabunny canvas export. Color/opacity/transform map
// ~1:1 between CSS filter/transform/opacity and their canvas equivalents, so a
// clip looks the same while scrubbing as it does in the rendered MP4. Kept pure
// (plain JSON, no React) so it serializes into the canvas node blob + the
// splice worker message, and so it is unit-testable.

export interface ClipAdjustments {
  /** 1 = unchanged. Maps to CSS/canvas `brightness()`. */
  brightness?: number;
  /** 1 = unchanged. `contrast()`. */
  contrast?: number;
  /** 1 = unchanged. `saturate()`. */
  saturation?: number;
  /** 0 = color, 1 = fully gray. `grayscale()`. */
  grayscale?: number;
  /** 0 = none, 1 = full. `sepia()`. */
  sepia?: number;
  /** Degrees. `hue-rotate()`. */
  hueRotate?: number;
  /** Pixels of Gaussian blur. `blur()`. */
  blur?: number;
  /** 0 = none, 1 = fully inverted. `invert()`. */
  invert?: number;
}

export interface ClipTransform {
  /** 1 = fit. Scales the frame around its center. */
  scale?: number;
  /** Fraction of frame width, 0 = centered. Maps to CSS translate %. */
  offsetX?: number;
  /** Fraction of frame height, 0 = centered. */
  offsetY?: number;
  /** Clockwise degrees. */
  rotate?: number;
}

export interface TextOverlay {
  id: string;
  text: string;
  /** 0..1 horizontal anchor (center of text). Default 0.5. */
  xFrac?: number;
  /** 0..1 vertical anchor. Default 0.88 (lower third). */
  yFrac?: number;
  /** Font size as a fraction of frame height. Default 0.06. */
  sizeFrac?: number;
  color?: string;
  background?: string;
  fontWeight?: number;
}

export type FilterPreset = 'none' | 'bw' | 'vintage' | 'vivid' | 'cool' | 'warm' | 'noir' | 'dream';

// Named one-tap looks (CapCut-style filters). Each is a base set of adjustments
// that the clip's manual adjustments then override. Kept as CSS-filter-mappable
// values so the SAME look renders in the preview and the export.
export const FILTER_PRESETS: Record<Exclude<FilterPreset, 'none'>, ClipAdjustments> = {
  bw: { grayscale: 1, contrast: 1.05 },
  vintage: { sepia: 0.45, saturation: 0.85, contrast: 1.1, brightness: 1.05 },
  vivid: { saturation: 1.4, contrast: 1.12 },
  cool: { hueRotate: -12, saturation: 1.1, brightness: 1.02 },
  warm: { sepia: 0.3, saturation: 1.2, brightness: 1.03 },
  noir: { grayscale: 1, contrast: 1.35, brightness: 0.92 },
  dream: { blur: 1.2, brightness: 1.08, saturation: 1.15 },
};

export const FILTER_PRESET_LABELS: Record<FilterPreset, string> = {
  none: 'None',
  bw: 'B&W',
  vintage: 'Vintage',
  vivid: 'Vivid',
  cool: 'Cool',
  warm: 'Warm',
  noir: 'Noir',
  dream: 'Dream',
};

export interface ClipEffectSpec {
  /** 0..1. Default 1. */
  opacity?: number;
  adjustments?: ClipAdjustments;
  /** A named look, applied under the manual adjustments. */
  filterPreset?: FilterPreset;
  transform?: ClipTransform;
  /** Mirror horizontally / vertically. */
  flipH?: boolean;
  flipV?: boolean;
  /** Canvas composite / CSS mix-blend for layering (mainly overlays). */
  blendMode?: BlendMode;
  /** Animated transform interpolated across the clip's normalized time (0..1). */
  kenBurns?: { from: ClipTransform; to: ClipTransform };
  /**
   * Arbitrary transform keyframes (a superset of kenBurns). Each stop is at a
   * normalized clip time `t` (0..1); the transform is linearly interpolated between
   * stops. Takes precedence over kenBurns when present (>= 2 stops).
   */
  keyframes?: TransformKeyframe[];
  /** Playback rate, 1 = normal. >1 faster, <1 slower. Video only. */
  speed?: number;
  text?: TextOverlay[];
  /**
   * Knock a background colour out to transparency.
   *
   * Field names and ranges are byte-identical to `chromaKeyConfig` in the contracts
   * action registry, so an `action` node's stored `data.config` IS this object — a
   * mapper between the two would be a third place for the tolerance scale to drift.
   *
   * Declared here and NOT in `adjustments`: CSS `filter` has no keying primitive, so
   * this cannot ride `filterString` and cannot be shown in the DOM preview. Ask
   * `unpreviewableEffects` rather than letting the preview quietly disagree with the
   * export — this file's whole premise is that the two match.
   */
  chromaKey?: { color: string; tolerance: number; softness: number };
  /**
   * Wash the frame toward one colour, by amount. Matches the registry's `tintConfig`.
   *
   * Also not an `adjustment`, and for the same reason: there is no CSS `tint()`. It is
   * a composite step at draw time, applied to the source so it respects a chroma key
   * rather than repainting the knocked-out pixels.
   */
  tint?: { color: string; amount: number };
}

export interface TransformKeyframe {
  /** Normalized clip time, 0..1. */
  t: number;
  transform?: ClipTransform;
}

// The subset of composite/blend modes shared by canvas `globalCompositeOperation`
// and CSS `mix-blend-mode` (identical names), so preview == export.
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'lighten'
  | 'darken'
  | 'difference';

// Merge a filter preset's base adjustments with the clip's manual adjustments
// (manual wins). The single source of truth for both CSS and canvas filters.
export function resolveAdjustments(spec: ClipEffectSpec | undefined): ClipAdjustments | undefined {
  if (!spec) return undefined;
  const preset =
    spec.filterPreset && spec.filterPreset !== 'none'
      ? FILTER_PRESETS[spec.filterPreset]
      : undefined;
  if (!preset) return spec.adjustments;
  return { ...preset, ...spec.adjustments };
}

const IDENTITY_TRANSFORM: Required<ClipTransform> = { scale: 1, offsetX: 0, offsetY: 0, rotate: 0 };

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

function resolveTransform(transform: ClipTransform | undefined): Required<ClipTransform> {
  return { ...IDENTITY_TRANSFORM, ...transform };
}

/** Effective playback rate; always > 0. */
export function speedFor(spec: ClipEffectSpec | undefined): number {
  const speed = spec?.speed;
  return speed && speed > 0 ? speed : 1;
}

/** Opacity clamped to 0..1. */
export function opacityFor(spec: ClipEffectSpec | undefined): number {
  const value = spec?.opacity;
  return value === undefined ? 1 : Math.max(0, Math.min(1, value));
}

/**
 * The transform at normalized clip time `u` (0..1). Interpolates Ken Burns
 * (from → to) when present, otherwise returns the static transform.
 */
function lerpTransform(
  a: Required<ClipTransform>,
  b: Required<ClipTransform>,
  k: number,
): Required<ClipTransform> {
  return {
    scale: lerp(a.scale, b.scale, k),
    offsetX: lerp(a.offsetX, b.offsetX, k),
    offsetY: lerp(a.offsetY, b.offsetY, k),
    rotate: lerp(a.rotate, b.rotate, k),
  };
}

export function resolveTransformAt(
  spec: ClipEffectSpec | undefined,
  u: number,
): Required<ClipTransform> {
  const clamped = Math.max(0, Math.min(1, u));
  const keyframes = spec?.keyframes;
  if (keyframes && keyframes.length >= 2) {
    const sorted = [...keyframes].sort((a, b) => a.t - b.t);
    if (clamped <= sorted[0].t) return resolveTransform(sorted[0].transform);
    const last = sorted[sorted.length - 1];
    if (clamped >= last.t) return resolveTransform(last.transform);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const a = sorted[i];
      const b = sorted[i + 1];
      if (clamped >= a.t && clamped <= b.t) {
        const span = b.t - a.t;
        const local = span > 0 ? (clamped - a.t) / span : 0;
        return lerpTransform(resolveTransform(a.transform), resolveTransform(b.transform), local);
      }
    }
    return resolveTransform(sorted[0].transform);
  }
  if (spec?.kenBurns) {
    const from = resolveTransform(spec.kenBurns.from);
    const to = resolveTransform(spec.kenBurns.to);
    const k = Math.max(0, Math.min(1, u));
    return {
      scale: lerp(from.scale, to.scale, k),
      offsetX: lerp(from.offsetX, to.offsetX, k),
      offsetY: lerp(from.offsetY, to.offsetY, k),
      rotate: lerp(from.rotate, to.rotate, k),
    };
  }
  return resolveTransform(spec?.transform);
}

/** CSS/canvas filter string (same syntax on both). Empty when nothing to apply. */
export function filterString(adjustments: ClipAdjustments | undefined): string {
  if (!adjustments) return '';
  const parts: string[] = [];
  const { brightness, contrast, saturation, grayscale, sepia, hueRotate, blur, invert } =
    adjustments;
  if (brightness !== undefined && brightness !== 1) parts.push(`brightness(${brightness})`);
  if (contrast !== undefined && contrast !== 1) parts.push(`contrast(${contrast})`);
  if (saturation !== undefined && saturation !== 1) parts.push(`saturate(${saturation})`);
  if (grayscale) parts.push(`grayscale(${grayscale})`);
  if (sepia) parts.push(`sepia(${sepia})`);
  if (hueRotate) parts.push(`hue-rotate(${hueRotate}deg)`);
  if (blur) parts.push(`blur(${blur}px)`);
  if (invert) parts.push(`invert(${invert})`);
  return parts.join(' ');
}

export interface ResolvedTextOverlay {
  id: string;
  text: string;
  xFrac: number;
  yFrac: number;
  sizeFrac: number;
  color: string;
  background?: string;
  fontWeight: number;
}

export function resolveTextOverlays(spec: ClipEffectSpec | undefined): ResolvedTextOverlay[] {
  if (!spec?.text?.length) return [];
  return spec.text.map((overlay) => ({
    id: overlay.id,
    text: overlay.text,
    xFrac: overlay.xFrac ?? 0.5,
    yFrac: overlay.yFrac ?? 0.88,
    sizeFrac: overlay.sizeFrac ?? 0.06,
    color: overlay.color ?? '#ffffff',
    background: overlay.background,
    fontWeight: overlay.fontWeight ?? 700,
  }));
}

// ---- Preview (CSS) consumer -------------------------------------------------

// Must stay a type alias, not an interface: this is assigned straight into
// `React.CSSProperties`, and only type aliases get TypeScript's implicit index
// signature. Some Radix releases augment `CSSProperties` with a
// `--radix-${string}` index signature that an interface can never satisfy.
export type ClipEffectCss = {
  filter?: string;
  transform?: string;
  opacity?: number;
  // A `BlendMode` value is a subset of CSS `mix-blend-mode`, so this is directly
  // assignable to React.CSSProperties.
  mixBlendMode?: BlendMode;
};

/** Resolve the clip's visual effects to CSS for the preview <video>/<img>. */
export function clipEffectsToCss(spec: ClipEffectSpec | undefined, u: number): ClipEffectCss {
  if (!spec) return {};
  const filter = filterString(resolveAdjustments(spec)) || undefined;

  const t = resolveTransformAt(spec, u);
  const transformParts: string[] = [];
  if (t.offsetX || t.offsetY) {
    transformParts.push(`translate(${t.offsetX * 100}%, ${t.offsetY * 100}%)`);
  }
  if (t.rotate) transformParts.push(`rotate(${t.rotate}deg)`);
  const sx = t.scale * (spec.flipH ? -1 : 1);
  const sy = t.scale * (spec.flipV ? -1 : 1);
  if (sx !== 1 || sy !== 1) transformParts.push(`scale(${sx}, ${sy})`);
  const transform = transformParts.length ? transformParts.join(' ') : undefined;

  const opacity = opacityFor(spec);
  const mixBlendMode = spec.blendMode && spec.blendMode !== 'normal' ? spec.blendMode : undefined;
  return { filter, transform, opacity: opacity === 1 ? undefined : opacity, mixBlendMode };
}

// ---- Export (canvas) consumers ---------------------------------------------

/**
 * Apply the clip's geometric transform to the canvas context. Call inside a
 * `ctx.save()`/`ctx.restore()` pair, then draw the frame; the black background
 * should already be filled at identity so the transform only moves the frame.
 */
export function applyCanvasTransform(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  transform: Required<ClipTransform>,
  targetWidth: number,
  targetHeight: number,
  flip?: { h?: boolean; v?: boolean },
): void {
  const cx = targetWidth / 2;
  const cy = targetHeight / 2;
  ctx.translate(cx + transform.offsetX * targetWidth, cy + transform.offsetY * targetHeight);
  if (transform.rotate) ctx.rotate((transform.rotate * Math.PI) / 180);
  const sx = transform.scale * (flip?.h ? -1 : 1);
  const sy = transform.scale * (flip?.v ? -1 : 1);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.translate(-cx, -cy);
}

/** Set the canvas filter for a clip's resolved adjustments (preset + manual). */
export function applyCanvasFilter(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  spec: ClipEffectSpec | undefined,
): void {
  const filter = filterString(resolveAdjustments(spec));
  ctx.filter = filter || 'none';
}

/** Draw static text overlays onto the frame (export path). */
export function drawTextOverlays(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  overlays: ResolvedTextOverlay[],
  targetWidth: number,
  targetHeight: number,
): void {
  for (const overlay of overlays) {
    if (!overlay.text) continue;
    const fontPx = Math.max(8, Math.round(overlay.sizeFrac * targetHeight));
    ctx.save();
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.font = `${overlay.fontWeight} ${fontPx}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const x = overlay.xFrac * targetWidth;
    const y = overlay.yFrac * targetHeight;
    if (overlay.background) {
      const metrics = ctx.measureText(overlay.text);
      const padX = fontPx * 0.4;
      const padY = fontPx * 0.25;
      const w = metrics.width + padX * 2;
      const h = fontPx + padY * 2;
      ctx.fillStyle = overlay.background;
      ctx.fillRect(x - w / 2, y - h / 2, w, h);
    }
    ctx.lineWidth = Math.max(2, fontPx * 0.06);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineJoin = 'round';
    ctx.strokeText(overlay.text, x, y);
    ctx.fillStyle = overlay.color;
    ctx.fillText(overlay.text, x, y);
    ctx.restore();
  }
}

/** True when the spec has any visual effect that changes the drawn frame. */
export function hasVisualEffects(spec: ClipEffectSpec | undefined): boolean {
  if (!spec) return false;
  return Boolean(
    (spec.opacity !== undefined && spec.opacity !== 1) ||
      filterString(resolveAdjustments(spec)) ||
      spec.transform ||
      spec.flipH ||
      spec.flipV ||
      (spec.blendMode && spec.blendMode !== 'normal') ||
      spec.kenBurns ||
      (spec.keyframes && spec.keyframes.length >= 2) ||
      spec.text?.length ||
      // Both must be listed here or `drawClipFrame` takes its `drawLetterboxed` fast
      // path and the effect silently never runs. A tint at amount 0 is a no-op, the
      // same convention as opacity 1; a chroma key is not — at tolerance 0 it still
      // keys exact matches.
      spec.chromaKey ||
      (spec.tint && spec.tint.amount > 0),
  );
}

/**
 * The effects the CSS preview physically cannot show, so a surface can say so.
 *
 * Keying and tinting have no `filter` primitive. The honest options were to fake them
 * with a `sepia()`/`hue-rotate()` chain that is wrong in a different way, or to name
 * the gap. A preview that silently omits an effect is how "it looked fine while I was
 * scrubbing" becomes a surprise in the export.
 */
export function unpreviewableEffects(
  spec: ClipEffectSpec | undefined,
): readonly ('chromaKey' | 'tint')[] {
  if (!spec) return [];
  const missing: ('chromaKey' | 'tint')[] = [];
  if (spec.chromaKey) missing.push('chromaKey');
  if (spec.tint && spec.tint.amount > 0) missing.push('tint');
  return missing;
}
