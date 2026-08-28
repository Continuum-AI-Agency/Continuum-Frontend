// Photo pre-flight for template heroes — a pure port of Verne's image gate.
//
// Source of truth for every number here: `verne-demo-studio/up_render/validar_imagen.py`
// and `render_pieza.py` (`_contraste_navy`, `texto_quemado`, `cover`, `interp`), which run
// a real client's artwork through PIL + numpy before a piece is rendered. This module is the
// same arithmetic with no IO: it takes pixel buffers as arguments, so it runs identically in
// a browser worker and in Node.
//
// EVERY THRESHOLD BELOW IS CALIBRATED, NOT UNIVERSAL. They were measured against one client's
// (Universidad del Pacífico) real pieces — "lum 184, contraste 8.15:1" is the mother piece
// they are tuned around. They are exported as documented defaults and every one of them is an
// optional parameter, because another brand's artwork will want different ones. Do not read
// them as industry constants and do not invent new ones.

/** A colour as gamma-encoded sRGB bytes, 0-255. */
export type Rgb = readonly [number, number, number];

/**
 * A decoded image. `channels` is the stride: 3 for packed RGB, 4 for RGBA.
 *
 * Getting the stride wrong reads the green channel as red on every other pixel and produces
 * numbers that look plausible and are garbage, so every reader here goes through
 * {@link pixelAt} rather than indexing `data` by hand.
 */
export interface PixelBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly channels: 3 | 4;
}

/** A sub-rectangle expressed as fractions of the frame, 0..1, `x1`/`y1` exclusive. */
export interface FractionalBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Integer pixel rectangle, `x`/`y` inclusive and `width`/`height` counts. */
export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * One measured sample on a curve: `[x, y]`, x ascending across the curve.
 *
 * Named because it is shared: the `formats` design section stores curves in exactly this
 * shape (`designMeasuredCurveSchema` in sections.ts) so a brand's measured geometry and
 * Verne's hard-coded curves are read by the SAME {@link interp}. Two point shapes would
 * mean two interpolators, and the second one is always the one with the off-by-one.
 */
export type CurvePoint = readonly [number, number];

/** The whole frame — the default box for the whole-image measurements. */
export const FULL_FRAME: FractionalBox = { x0: 0, y0: 0, x1: 1, y1: 1 };

// ── Calibrated constants (Verne's values; each is an optional parameter below) ────────────

/**
 * The headline safe zone of a UP template: top-right of the photo. Calibrated per template
 * type in `validar_imagen.py` (`ZONAS`); T1/T2/T5 all share this box, T3/T4 put no text on
 * the photo at all.
 */
export const VERNE_HEADLINE_ZONE: FractionalBox = { x0: 0.45, y0: 0.0, x1: 1.0, y1: 0.45 };

/**
 * Headline navy. `render_pieza.py` (which owns `_contraste_navy`) uses `#0F1F43`; the
 * standalone validator declares `#0E1F45` for the same colour. The one-byte disagreement is
 * theirs, not a transcription slip — this is the value the contrast measurement actually ran
 * against, and `darkPercentileContrast` takes the foreground as an argument regardless.
 */
export const VERNE_NAVY: Rgb = [0x0f, 0x1f, 0x43];

/** Percentile of the safe zone's darkest pixels the headline is measured against. */
export const VERNE_DARK_PERCENTILE = 20;

/** WCAG AA for large text, with headroom. Below this the navy headline needs a veil. */
export const VERNE_MIN_CONTRAST = 4.5;

/** Encoded luma floor (0-255) under which the brand's white gradient would bury the photo. */
export const VERNE_MIN_VEIL_LUMA = 60;

/** Mean per-channel deviation above which the safe zone is too busy for a headline. */
export const VERNE_MAX_REGION_DEVIATION = 45;

/** |∂x|+|∂y| above which a pixel counts as a hard edge. */
export const VERNE_EDGE_GRADIENT = 45;

/** Hard-edge fraction above which the safe zone is carrying burnt-in text. */
export const VERNE_MAX_EDGE_FRACTION = 0.025;

/** L1 distance under which a pixel counts as "wearing" a brand accent. */
export const VERNE_INK_DISTANCE = 60;

/** 0.15 % of pixels in brand ink means the photo was cropped out of a composed piece. */
export const VERNE_MAX_INK_FRACTION = 0.0015;

/** The render engine's upscale ceiling. At or below this a format costs nothing. */
export const VERNE_UPSCALE_WARN = 1.15;

/** Above this the photo visibly softens and the format is refused. */
export const VERNE_UPSCALE_BLOCK = 1.35;

/** Format aspect at or below which the layout stacks vertically and the photo runs full width. */
export const VERNE_STACK_RATIO_MAX = 1.05;

/**
 * Photo-block aspect by piece aspect, MEASURED on the ten real adaptations — the comment in
 * `render_pieza.py` notes these reproduce mailing (1021), story (656), postIG (600) and
 * postFB (540) heights to the pixel. Not estimates.
 */
export const VERNE_PHOTO_RATIO_CURVE: readonly CurvePoint[] = [
  [0.485, 1.567],
  [0.563, 1.648],
  [0.799, 1.8],
  [1.0, 2.224],
];

/**
 * Brand accents, including `violeta_pieza` — the saturated violet that only ever appears
 * because a chip or headline was already burnt into the JPG.
 */
export const VERNE_BRAND_ACCENTS: Readonly<Record<string, Rgb>> = {
  violeta: [0x4b, 0x1f, 0xd4],
  azul: [0x0b, 0x3b, 0x8c],
  naranja: [0xde, 0x82, 0x18],
  rojo: [0xce, 0x31, 0x29],
  oro: [0xc0, 0x8a, 0x2e],
  violeta_pieza: [0x5b, 0x00, 0xe1],
};

// ── Colour ───────────────────────────────────────────────────────────────────────────────

/** sRGB → linear for one channel. WCAG 2.x: cutoff 0.03928, exponent 2.4. */
function linearise(byte: number): number {
  const v = byte / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/**
 * WCAG 2.x relative luminance: linearise each sRGB channel, then weight 0.2126/0.7152/0.0722.
 *
 * This is the LINEAR quantity. It is not interchangeable with {@link encodedLuma}, which
 * applies the same weights to the gamma-encoded bytes — see {@link darkPercentileContrast}
 * for why both exist and why the order they run in matters.
 */
export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * linearise(rgb[0]) + 0.7152 * linearise(rgb[1]) + 0.0722 * linearise(rgb[2]);
}

/** WCAG 2.x contrast ratio between two colours, 1..21, order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Perceptual weights applied to the GAMMA-ENCODED bytes, 0-255 — Verne's `luminancia()`.
 *
 * Cheap and monotonic, which is all a percentile cut needs. It is also the scale
 * {@link VERNE_MIN_VEIL_LUMA} is expressed in, so a caller feeding
 * {@link resolveLegibilityMode} must use this and not {@link relativeLuminance}.
 */
export function encodedLuma(rgb: Rgb): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

// ── Buffer access ────────────────────────────────────────────────────────────────────────

/** Read one pixel, honouring the RGB/RGBA stride. Alpha is ignored — Verne converts to RGB. */
export function pixelAt(pixels: PixelBuffer, x: number, y: number): Rgb {
  const i = (y * pixels.width + x) * pixels.channels;
  return [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]];
}

/**
 * Fractional box → integer rectangle, the way Verne does it: `int()` TRUNCATION on every
 * edge, with the far edges floored at one pixel so a degenerate box still reads something.
 */
export function resolveBox(size: Size, box: FractionalBox = FULL_FRAME): PixelRect {
  const { width: w, height: h } = size;
  const x = clamp(Math.trunc(box.x0 * w), 0, Math.max(0, w - 1));
  const y = clamp(Math.trunc(box.y0 * h), 0, Math.max(0, h - 1));
  const x1 = clamp(Math.max(1, Math.trunc(box.x1 * w)), x + 1, w);
  const y1 = clamp(Math.max(1, Math.trunc(box.y1 * h)), y + 1, h);
  return { x, y, width: x1 - x, height: y1 - y };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// ── Percentile ───────────────────────────────────────────────────────────────────────────

/**
 * The q-th percentile (q in 0..100) of `values`, matching numpy's DEFAULT `method="linear"`
 * (type 7): the rank is `q/100 * (n - 1)` and the result interpolates linearly between the
 * two neighbouring order statistics.
 *
 * `sorted[floor(q/100 * n)]` is a different estimator and gives a different cut on small or
 * skewed samples, which shifts which pixels {@link darkPercentileContrast} averages. The
 * input is not required to be sorted; a copy is sorted internally.
 */
export function percentile(values: ArrayLike<number>, q: number): number {
  const n = values.length;
  if (n === 0) return Number.NaN;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const rank = (clamp(q, 0, 100) / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

// ── The critical measurement ─────────────────────────────────────────────────────────────

export interface DarkPercentileContrast {
  /** WCAG ratio of the foreground against {@link sampled}. */
  readonly ratio: number;
  /** Mean colour of the selected dark pixels, truncated to bytes the way Verne does. */
  readonly sampled: Rgb;
  /** How many pixels sat at or below the cut. */
  readonly sampleCount: number;
  /** The encoded-luma value the selection was cut at. */
  readonly cut: number;
}

export interface DarkPercentileOptions {
  /** Defaults to {@link VERNE_DARK_PERCENTILE} (20). */
  readonly percentile?: number;
}

/**
 * Contrast of a foreground colour against the DARKEST SLICE of a region, not against its mean.
 *
 * Verne's comment on `_contraste_navy` is the whole reason this function exists: *"a bright sky
 * with a dark silhouette gives a good average and an illegible headline. That is the mistake
 * that let T2 and T5 approve a photo nothing could be read on."*
 *
 * THE ORDER IS LOAD-BEARING, and it is not the order a reader guesses:
 *
 *   1. crop to `box`;
 *   2. per-pixel luma as `0.2126R + 0.7152G + 0.0722B` on the GAMMA-ENCODED 0-255 bytes;
 *   3. the 20th percentile of THAT (numpy type-7, see {@link percentile});
 *   4. select every pixel at or below the cut;
 *   5. take the MEAN RGB of the selected set;
 *   6. ONLY NOW linearise, and run the WCAG ratio against `foreground`.
 *
 * Linearising first, or cutting the percentile on linear luminance, materially changes the
 * answer on a high-contrast photo: linear luminance crushes the shadows together, so the
 * 20th-percentile cut lands somewhere else and a different set of pixels is averaged. The
 * WCAG linearisation belongs to the final ratio, not to the pixel statistics.
 *
 * The sampled mean is truncated to integer bytes before linearisation (Verne's
 * `int(v)` per channel) — that truncation is part of the calibrated pipeline.
 *
 * An empty selection cannot happen for a non-empty region (the cut is an order statistic, so
 * at least one pixel sits at or below it), but Verne guards it by falling back to the mean of
 * the whole region and so does this.
 */
export function darkPercentileContrast(
  pixels: PixelBuffer,
  box: FractionalBox = VERNE_HEADLINE_ZONE,
  foreground: Rgb = VERNE_NAVY,
  opts: DarkPercentileOptions = {},
): DarkPercentileContrast {
  return percentileSliceContrast(pixels, box, foreground, opts.percentile ?? VERNE_DARK_PERCENTILE, 'below');
}

/**
 * The same measurement against the BRIGHTEST slice — the worst case for a LIGHT foreground.
 *
 * Verne only ever set dark type, so only the dark slice existed. A headline that may be white
 * needs the mirror, and it needs it for the same reason: a mostly-dark photo with one blown
 * highlight averages dark and renders a white headline that vanishes across the highlight.
 * Choosing between a light and a dark ink by comparing both against the DARK slice would
 * flatter white on exactly the photos where it is least legible.
 *
 * `percentile` names the slice from the same end as {@link darkPercentileContrast}: 20 means
 * "the brightest 20%".
 */
export function brightPercentileContrast(
  pixels: PixelBuffer,
  box: FractionalBox = VERNE_HEADLINE_ZONE,
  foreground: Rgb = VERNE_NAVY,
  opts: DarkPercentileOptions = {},
): DarkPercentileContrast {
  const q = opts.percentile ?? VERNE_DARK_PERCENTILE;
  return percentileSliceContrast(pixels, box, foreground, 100 - q, 'above');
}

/**
 * The shared body. ONE loop, so the dark and bright readings cannot drift into measuring
 * different things — the step order documented above is calibrated and belongs in one place.
 */
function percentileSliceContrast(
  pixels: PixelBuffer,
  box: FractionalBox,
  foreground: Rgb,
  q: number,
  keep: 'below' | 'above',
): DarkPercentileContrast {
  const rect = resolveBox(pixels, box);
  const count = rect.width * rect.height;
  const luma = new Float64Array(count);

  for (let row = 0; row < rect.height; row += 1) {
    for (let col = 0; col < rect.width; col += 1) {
      luma[row * rect.width + col] = encodedLuma(pixelAt(pixels, rect.x + col, rect.y + row));
    }
  }

  const cut = percentile(luma, q);

  let r = 0;
  let g = 0;
  let b = 0;
  let selected = 0;
  for (let row = 0; row < rect.height; row += 1) {
    for (let col = 0; col < rect.width; col += 1) {
      const value = luma[row * rect.width + col];
      if (keep === 'below' ? value > cut : value < cut) continue;
      const px = pixelAt(pixels, rect.x + col, rect.y + row);
      r += px[0];
      g += px[1];
      b += px[2];
      selected += 1;
    }
  }

  if (selected === 0) {
    // Verne's guard: average the whole region rather than divide by zero.
    for (let row = 0; row < rect.height; row += 1) {
      for (let col = 0; col < rect.width; col += 1) {
        const px = pixelAt(pixels, rect.x + col, rect.y + row);
        r += px[0];
        g += px[1];
        b += px[2];
      }
    }
    selected = count;
  }

  const sampled: Rgb = [
    Math.trunc(r / selected),
    Math.trunc(g / selected),
    Math.trunc(b / selected),
  ];
  return { ratio: contrastRatio(foreground, sampled), sampled, sampleCount: selected, cut };
}

// ── Cover crop ───────────────────────────────────────────────────────────────────────────

export interface CoverBox extends Size {
  /**
   * Vertical focal point, 0 top … 1 bottom. Defaults to 0.5.
   */
  readonly pos?: number;
  /**
   * Horizontal focal point, 0 left … 1 right. Defaults to 0.5. It matters: the UP headline
   * sits TOP-RIGHT, so the subject has to end up on the left or the text lands on the dark
   * part of the photo and stops reading.
   */
  readonly posx?: number;
}

/**
 * The source rectangle an `object-fit: cover` fit into `box` would read — the geometry half
 * of Verne's `cover()`, without the resample.
 *
 * Note the TRUNCATION on the focal offsets: Verne uses `int((iw - nw) * posx)`, not `round()`.
 * On an odd overflow that is a one-pixel difference from a rounding implementation, which is
 * enough to move which column of a striped façade lands under the headline.
 */
export function coverCropRect(source: Size, box: CoverBox): PixelRect {
  const w = Math.max(1, Math.trunc(box.width));
  const h = Math.max(1, Math.trunc(box.height));
  const posx = box.posx ?? 0.5;
  const pos = box.pos ?? 0.5;
  const { width: iw, height: ih } = source;

  if (iw / ih > w / h) {
    const nw = Math.min(iw, Math.round((ih * w) / h));
    return { x: clamp(Math.trunc((iw - nw) * posx), 0, iw - nw), y: 0, width: nw, height: ih };
  }
  const nh = Math.min(ih, Math.round((iw * h) / w));
  return { x: 0, y: clamp(Math.trunc((ih - nh) * pos), 0, ih - nh), width: iw, height: nh };
}

// ── Burnt-in text, detector #1: brand ink ────────────────────────────────────────────────

export interface BrandInkResult {
  /** The worst (largest) fraction across the accents. */
  readonly fraction: number;
  /** Which accent produced it, or null on an empty accent set. */
  readonly accent: string | null;
  /** Whether that fraction reaches the threshold. */
  readonly detected: boolean;
}

export interface BrandInkOptions {
  /** L1 distance in bytes. Defaults to {@link VERNE_INK_DISTANCE} (60). */
  readonly distance?: number;
  /** Fraction at or above which text is declared. Defaults to {@link VERNE_MAX_INK_FRACTION}. */
  readonly threshold?: number;
}

/**
 * Fraction of pixels wearing a brand accent — the first burnt-in-text detector.
 *
 * Verne's reasoning, verbatim: *"a sky, a façade or water does not produce saturated
 * #5B00E1 violet. If it appears, the photo was cropped out of an already-composed piece and
 * its headline will collide with the one the template draws. This is the defect that
 * originated the rule."*
 *
 * Distance is L1 over the three bytes (Verne's `np.abs(a - c).sum(axis=1) < 60`), strictly
 * less than the cutoff. Both 60 and the 0.0015 threshold are calibrated against one client's
 * palette on their real photos; a brand whose accents sit near natural colours will need a
 * tighter distance or it will fail every landscape.
 */
export function brandInkFraction(
  pixels: PixelBuffer,
  accents: Readonly<Record<string, Rgb>> = VERNE_BRAND_ACCENTS,
  opts: BrandInkOptions = {},
): BrandInkResult {
  const distance = opts.distance ?? VERNE_INK_DISTANCE;
  const threshold = opts.threshold ?? VERNE_MAX_INK_FRACTION;
  const total = pixels.width * pixels.height;
  const entries = Object.entries(accents);

  let worst = 0;
  let accent: string | null = null;
  for (const [name, colour] of entries) {
    let hits = 0;
    for (let y = 0; y < pixels.height; y += 1) {
      for (let x = 0; x < pixels.width; x += 1) {
        const px = pixelAt(pixels, x, y);
        const d =
          Math.abs(px[0] - colour[0]) + Math.abs(px[1] - colour[1]) + Math.abs(px[2] - colour[2]);
        if (d < distance) hits += 1;
      }
    }
    const fraction = total > 0 ? hits / total : 0;
    if (fraction > worst) {
      worst = fraction;
      accent = name;
    }
  }

  return { fraction: worst, accent, detected: worst >= threshold };
}

// ── Burnt-in text, detector #2: hard edges ───────────────────────────────────────────────

export interface HardEdgeResult {
  readonly fraction: number;
  readonly detected: boolean;
}

export interface HardEdgeOptions {
  /** Gradient magnitude cutoff. Defaults to {@link VERNE_EDGE_GRADIENT} (45). */
  readonly gradient?: number;
  /** Fraction at or above which text is declared. Defaults to {@link VERNE_MAX_EDGE_FRACTION}. */
  readonly threshold?: number;
}

/**
 * Fraction of pixels whose `|∂x| + |∂y|` gradient clears the cutoff — the second burnt-in-text
 * detector. Verne: *"text generates many; sky almost none."*
 *
 * The gradient runs on the plain PER-CHANNEL MEAN of the pixel (`z.mean(axis=2)`), NOT on the
 * perceptually weighted luma. The 45 cutoff is calibrated against that statistic, so swapping
 * in {@link encodedLuma} here would silently re-scale the threshold.
 *
 * Both differences are forward-only and the last row/column are dropped, matching numpy's
 * `diff` shapes — the denominator is `(h - 1) * (w - 1)`.
 */
export function hardEdgeFraction(
  pixels: PixelBuffer,
  box: FractionalBox = VERNE_HEADLINE_ZONE,
  opts: HardEdgeOptions = {},
): HardEdgeResult {
  const cutoff = opts.gradient ?? VERNE_EDGE_GRADIENT;
  const threshold = opts.threshold ?? VERNE_MAX_EDGE_FRACTION;
  const rect = resolveBox(pixels, box);
  if (rect.width < 2 || rect.height < 2) return { fraction: 0, detected: false };

  const mean = (x: number, y: number): number => {
    const px = pixelAt(pixels, rect.x + x, rect.y + y);
    return (px[0] + px[1] + px[2]) / 3;
  };

  let hits = 0;
  for (let y = 0; y < rect.height - 1; y += 1) {
    for (let x = 0; x < rect.width - 1; x += 1) {
      const here = mean(x, y);
      const gx = Math.abs(mean(x + 1, y) - here);
      const gy = Math.abs(mean(x, y + 1) - here);
      if (gx + gy > cutoff) hits += 1;
    }
  }

  const fraction = hits / ((rect.width - 1) * (rect.height - 1));
  return { fraction, detected: fraction >= threshold };
}

// ── Region calm ──────────────────────────────────────────────────────────────────────────

export interface RegionCalmResult {
  /** Mean of the three per-channel standard deviations. */
  readonly deviation: number;
  readonly calm: boolean;
}

export interface RegionCalmOptions {
  /** Deviation at or below which the region is calm. Defaults to {@link VERNE_MAX_REGION_DEVIATION}. */
  readonly maxDeviation?: number;
}

/**
 * Mean per-channel standard deviation inside `box` — "is the safe zone a calm sky or a busy
 * façade?". Population deviation (numpy's `std` default, `ddof=0`).
 *
 * Verne treats a failure here as a WARNING, not a block: a busy zone still renders, it just
 * renders worse. 45 is where their real photos separated calm from busy; it is not a law.
 */
export function regionCalm(
  pixels: PixelBuffer,
  box: FractionalBox = VERNE_HEADLINE_ZONE,
  opts: RegionCalmOptions = {},
): RegionCalmResult {
  const maxDeviation = opts.maxDeviation ?? VERNE_MAX_REGION_DEVIATION;
  const rect = resolveBox(pixels, box);
  const n = rect.width * rect.height;
  const sum = [0, 0, 0];
  const sumSq = [0, 0, 0];

  for (let y = 0; y < rect.height; y += 1) {
    for (let x = 0; x < rect.width; x += 1) {
      const px = pixelAt(pixels, rect.x + x, rect.y + y);
      for (let c = 0; c < 3; c += 1) {
        sum[c] += px[c];
        sumSq[c] += px[c] * px[c];
      }
    }
  }

  let total = 0;
  for (let c = 0; c < 3; c += 1) {
    const meanC = sum[c] / n;
    total += Math.sqrt(Math.max(0, sumSq[c] / n - meanC * meanC));
  }
  const deviation = total / 3;
  return { deviation, calm: deviation <= maxDeviation };
}

// ── Measured curves ──────────────────────────────────────────────────────────────────────

/**
 * Piecewise-linear interpolation between measured points, CLAMPED at both ends — Verne's
 * `interp()`. Outside the measured range the endpoint value holds; it never extrapolates,
 * because the curves are measurements of ten real pieces and there is no data past them.
 *
 * `points` must be sorted ascending by x.
 */
export function interp(x: number, points: readonly CurvePoint[]): number {
  if (points.length === 0) return Number.NaN;
  if (x <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (x0 <= x && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return last[1];
}

// ── Legibility mode ──────────────────────────────────────────────────────────────────────

/**
 * How the navy headline can be made to read over this photo.
 *
 * The UP headline is ALWAYS navy — verified across mailing, post, story and tótem; there is no
 * white-headline variant. So the three outcomes are: put it straight on the photo, interpose
 * the brand's white gradient, or refuse the photo because the veil would bury it.
 */
export type LegibilityMode =
  | { readonly mode: 'direct'; readonly contrast: number; readonly regionLuma: number }
  | { readonly mode: 'veiled'; readonly contrast: number; readonly regionLuma: number }
  | { readonly mode: 'unusable'; readonly contrast: number; readonly regionLuma: number };

export interface LegibilityOptions {
  /** Defaults to {@link VERNE_MIN_CONTRAST} (4.5 — WCAG AA large). */
  readonly minContrast?: number;
  /** Defaults to {@link VERNE_MIN_VEIL_LUMA} (60, on the {@link encodedLuma} scale). */
  readonly minVeilLuma?: number;
}

/**
 * Resolve the three-way outcome from a measured contrast and region luma.
 *
 * `contrast` is the ratio from {@link darkPercentileContrast}; `regionLuma` is
 * {@link encodedLuma} of the region's colour, 0-255 — the same scale
 * {@link VERNE_MIN_VEIL_LUMA} is calibrated on.
 *
 * Returns a discriminated union rather than a bare string so a caller cannot compare against
 * a mode name that does not exist.
 */
export function resolveLegibilityMode(
  contrast: number,
  regionLuma: number,
  opts: LegibilityOptions = {},
): LegibilityMode {
  const minContrast = opts.minContrast ?? VERNE_MIN_CONTRAST;
  const minVeilLuma = opts.minVeilLuma ?? VERNE_MIN_VEIL_LUMA;
  if (contrast >= minContrast) return { mode: 'direct', contrast, regionLuma };
  if (regionLuma >= minVeilLuma) return { mode: 'veiled', contrast, regionLuma };
  return { mode: 'unusable', contrast, regionLuma };
}

// ── Resolution ───────────────────────────────────────────────────────────────────────────

export type UpscaleBand = 'fine' | 'warn' | 'block';

export interface RenderFormat extends Size {
  readonly id: string;
}

export interface FormatUpscale {
  readonly id: string;
  /** How much the layout would have to enlarge this source for this format. */
  readonly scale: number;
  readonly band: UpscaleBand;
}

export interface UpscaleReport {
  readonly formats: readonly FormatUpscale[];
  /** The format that asks for the most enlargement, or null when `formats` is empty. */
  readonly worst: FormatUpscale | null;
  /** The worst band across all formats. */
  readonly band: UpscaleBand;
  /**
   * The smallest source HEIGHT (at this source's aspect) that would put every format back in
   * the `fine` band. 0 when nothing needs enlarging.
   */
  readonly minSourceHeight: number;
}

export interface UpscaleOptions {
  /** At or below this, a format costs nothing. Defaults to {@link VERNE_UPSCALE_WARN} (1.15). */
  readonly warnAbove?: number;
  /** Above this, the format is refused. Defaults to {@link VERNE_UPSCALE_BLOCK} (1.35). */
  readonly blockAbove?: number;
  /** Aspect at or below which the layout stacks. Defaults to {@link VERNE_STACK_RATIO_MAX}. */
  readonly stackRatioMax?: number;
  /** Photo-block aspect curve. Defaults to {@link VERNE_PHOTO_RATIO_CURVE}. */
  readonly photoRatioCurve?: readonly CurvePoint[];
}

/**
 * Per-format enlargement this source would need, banded — the resolution gate.
 *
 * WHY IT IS A RATIO AND NOT A FIXED MINIMUM (`server.py:1774-1795`): the previous rule was
 * `minres = max(1200, W)` with W = 1600, the mother piece's width. It went stale the moment
 * the engine switched to height-fitting with an upscale ceiling, and it *failed a 1536px
 * generated image — the widest the model produces in landscape — when the engine only needed
 * to enlarge it 1.05× in the worst format.* Their own rule was fighting their own generator
 * and blocking a perfectly usable photo. So: ask each format what it would actually cost.
 *
 * Two layout branches, from the same source:
 *   - aspect ≤ `stackRatioMax` → vertical stack, photo runs full width, so the source must
 *     cover both the format width and the photo-block height off {@link interp};
 *   - otherwise → reflow, the photo fits by height alone.
 *
 * `minSourceHeight` uses `ceil`, where Verne used `int()`. Truncation returns a height at
 * which the worst format still lands just above the bar — an off-by-one in the direction of
 * being wrong, and the number is advice printed to a human, so it rounds up.
 */
export function requiredUpscale(
  source: Size,
  formats: readonly RenderFormat[],
  opts: UpscaleOptions = {},
): UpscaleReport {
  const warnAbove = opts.warnAbove ?? VERNE_UPSCALE_WARN;
  const blockAbove = opts.blockAbove ?? VERNE_UPSCALE_BLOCK;
  const stackRatioMax = opts.stackRatioMax ?? VERNE_STACK_RATIO_MAX;
  const curve = opts.photoRatioCurve ?? VERNE_PHOTO_RATIO_CURVE;

  const bandOf = (scale: number): UpscaleBand =>
    scale > blockAbove ? 'block' : scale > warnAbove ? 'warn' : 'fine';

  const scored = formats.map((f): FormatUpscale => {
    const aspect = f.width / f.height;
    const scale =
      aspect <= stackRatioMax
        ? Math.max(f.width / source.width, f.width / interp(aspect, curve) / source.height)
        : f.height / source.height;
    return { id: f.id, scale, band: bandOf(scale) };
  });

  let worst: FormatUpscale | null = null;
  for (const entry of scored) {
    if (!worst || entry.scale > worst.scale) worst = entry;
  }

  const worstScale = worst?.scale ?? 0;
  return {
    formats: scored,
    worst,
    band: worst ? worst.band : 'fine',
    minSourceHeight:
      worstScale > warnAbove ? Math.ceil((source.height * worstScale) / warnAbove) : 0,
  };
}
