// `image.text` — set the brand's type over a still, at a place that was MEASURED.
//
// The decision is not made here. `planPlacement` (contracts, design-system/placement.ts)
// decides where the lines break, how big each one is, which edge they anchor to and what has
// to happen to the BACKGROUND for the ink to read; this module supplies the two things that
// decision needs and cannot compute — font metrics and real pixels — and then draws the plan.
//
// Three invariants hold the whole thing up:
//
//   • THE INK IS THE TOKEN. It is resolved from the brand ONCE — design system, then the
//     brand book, then the kit, then the scrape — handed to the planner, and written into the
//     SVG `fill` verbatim. Nothing in the draw path recolours it, and a brand that yields no
//     colour anywhere still throws: a silent black headline on a brand piece is a worse
//     outcome than a refusal somebody can act on.
//   • TYPE IS NOT INK. The face walks the same chain and then one rung further, to a face
//     this product ships and can embed. That rung is LABELLED, never silent — see
//     `resolveBrandType` (contracts, design-system/typeResolution.ts). Refusing the whole
//     node because the typography was somewhere else was the old bug.
//   • ONE TREATMENT FUNCTION. {@link applyTreatment} is what the contrast PROBE composites and
//     what the final frame composites — over the SAME box, so the feathered edges are inside
//     the measurement. Two implementations would drift, and they would drift in the flattering
//     direction: the plan would claim a ratio the render never reached.
//   • THE METRICS THE PLAN WAS COMPUTED FROM ARE THE METRICS THAT GET DRAWN. See
//     {@link createMeasurer} — this is the single biggest source of drift in type placement.

import {
  BRAND_INK_SOURCE_LABEL,
  BRAND_TYPE_SOURCE_LABEL,
  type BrandTypeInputs,
  type BrandTypeSource,
  type BurnInAnchor,
  breakLines,
  contrastRatio,
  type DesignSystemFontEmbed,
  darkPercentileContrast,
  deriveLegibleInk,
  embedsFor,
  FALLBACK_INK_DARK,
  FALLBACK_INK_LIGHT,
  type FractionalBox,
  FULL_FRAME,
  type HeadlineToken,
  hasAnyBrandShape,
  headlineWeights,
  isLiteralHex,
  type MeasureText,
  type PixelBuffer,
  type PlacementOptions,
  type PlacementPlan,
  type PlacementTreatment,
  type ProbeContrast,
  planPlacement,
  type Rgb,
  resolveBox,
  resolveBrandInk,
  resolveBrandType,
  type Size,
  type TextStyle,
  type TreatmentStep,
  VERNE_TITLE_BOLD_SIZE,
  VERNE_TITLE_LIGHT_SIZE,
} from '@continuum/contracts';
import {
  captionFontFaceCss,
  captionFontSpec,
  embedBrandFonts,
  ensureCaptionFonts,
} from '@/lib/clips/captionFonts';
import { type BlockExtent, blockOrigin, blockRect, headlineBlockExtent } from './burnInPlacement';
import type { DrawableImage } from './imageOps';

// ── Ink ──────────────────────────────────────────────────────────────────────────────────

/** `#abc`, `#abcd`, `#aabbcc`, `#aabbccdd` → bytes. Alpha is parsed and discarded: the ladder
 *  escalates the background, so a translucent headline is not a state this op can produce. */
export function parseHexColour(value: string): Rgb | null {
  const raw = value.trim();
  if (!isLiteralHex(raw)) return null;
  const hex = raw.slice(1);
  const wide = hex.length > 4;
  const step = wide ? 2 : 1;
  const channel = (index: number): number => {
    const piece = hex.slice(index * step, index * step + step);
    return Number.parseInt(wide ? piece : piece + piece, 16);
  };
  return [channel(0), channel(1), channel(2)];
}

export const rgbToHex = (rgb: Rgb): string =>
  `#${rgb.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;

/** The ink, plus WHERE it came from — the panel names the source beside the swatch. */
export interface HeadlineInk {
  readonly rgb: Rgb;
  /** Set when the config named a token nothing carries and the brand's default was used. */
  readonly substitutedFor?: string;
  /**
   * `fallback` only ever comes from {@link deriveHeadlineInk} — the brand walker cannot say it.
   * `custom` only ever comes from a hex the user picked, and is local to this module on
   * purpose: `BrandTypeSource` is the ladder of brand SHAPES a value was read from, and it
   * also types the FACE labels, so a colour nobody read from the brand does not belong in it.
   */
  readonly source: BrandTypeSource | 'custom';
  /** The token the colour was named by, when the source named one. */
  readonly tokenName: string | null;
  /** Which of the two measured candidates won, on the fallback rung only. */
  readonly fallbackName?: 'black' | 'white';
  /** What the winner measured against its own worst case. Reported by the bench. */
  readonly fallbackRatio?: number;
}

/**
 * The headline colour, from whichever brand shape actually carries colour.
 *
 * NULL rather than a throw, and never a default. Only {@link setImageText} knows whether the
 * TYPE resolved, and "this brand has no colour" and "nothing about this brand could be read"
 * are different sentences — the code this replaces printed one message for both, and blamed
 * the design system for a brand that had never uploaded one.
 *
 * The chain itself is `resolveBrandInk` (contracts, design-system/typeResolution.ts), which
 * has no fallback rung on purpose: a guessed brand colour is worse than a refusal.
 */
export function resolveHeadlineInk(inputs: BrandTypeInputs, tokenName = ''): HeadlineInk | null {
  const resolved = resolveBrandInk(inputs, tokenName);
  if (!resolved) return null;
  const rgb = parseHexColour(resolved.hex);
  return rgb ? { rgb, source: resolved.source, tokenName: resolved.tokenName } : null;
}

/**
 * The ink a user picked by hand, when they picked one.
 *
 * Null for null and for anything that is not a colour, so the caller falls through to the
 * palette chain rather than rendering a headline in a hex somebody mistyped.
 */
export function resolveCustomInk(hex: string | null): HeadlineInk | null {
  if (!hex) return null;
  const rgb = parseHexColour(hex);
  return rgb ? { rgb, source: 'custom', tokenName: null } : null;
}

// ── Faces ────────────────────────────────────────────────────────────────────────────────

/**
 * The two faces the headline flows in, as one CSS font stack plus two numeric weights.
 *
 * ONE STRING, USED TWICE — the canvas `ctx.font` that measures and the SVG `font-family` that
 * draws are built from the same {@link HeadlineFaces}, because a measure and a draw that
 * resolve different families produce a plan whose line breaks do not match the glyphs.
 *
 * A family we ship bytes for is made real on both sides by {@link embedFace}; every other
 * family still resolves to `FALLBACK_STACK` in both paths, because an SVG rasterised as an
 * image cannot fetch a webfont. `source` is honest about which brand SHAPE named the family —
 * it does not claim the bytes were found.
 */
export interface HeadlineFaces {
  readonly stack: string;
  readonly lightWeight: number;
  readonly boldWeight: number;
  /** The family the stack leads with: what the UI names, and the key the embed looks up. */
  readonly family: string;
  /** Which of the brand's shapes the family came from. `fallback` means none of them did. */
  readonly source: BrandTypeSource;
}

const FALLBACK_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** A family name safe to interpolate into a font shorthand and an XML attribute. */
const quoteFamily = (family: string): string | null => {
  const clean = family.trim().replace(/^['"]|['"]$/g, '');
  return /^[^'"(){};\\\r\n<>&]+$/.test(clean) && clean.length > 0 ? `'${clean}'` : null;
};

/**
 * The faces, from anywhere the brand keeps type — and always an answer.
 *
 * WHICH FAMILY is the chain's call (`resolveBrandType`), so the burn-in, the panel preview and
 * anything else that has to name the face read the same rung. WHAT WEIGHTS is still a design
 * system question: `w-light` / `w-bold` are type-scale tokens and no other brand shape carries
 * them, so a brand resolved off its brand book gets the 300/700 defaults rather than a weight
 * invented from a family name — moved to the weights an embed of the family actually holds
 * (`headlineWeights`, shared with the Backend planner that measures the same file).
 */
export function resolveHeadlineFaces(inputs: BrandTypeInputs): HeadlineFaces {
  const type = resolveBrandType(inputs);
  const family = quoteFamily(type.display);
  const weights = headlineWeights(inputs, type.display);
  return {
    stack: family ? `${family}, ${FALLBACK_STACK}` : FALLBACK_STACK,
    lightWeight: weights.light,
    boldWeight: weights.bold,
    family: type.display,
    source: type.source,
  };
}

/**
 * A face this product ships, named by the step rather than read off the brand: the display face
 * of a two-face layout (one giant word in Anton over a caption in the brand's face). Its weights
 * are the ones the file actually holds — Anton has only 400, and asking it for 700 draws a faux
 * bold — and it reports the `fallback` rung, which is exactly "a face Continuum ships".
 */
export function shippedFaces(family: string): HeadlineFaces {
  const weights = (captionFontSpec(family)?.weightRange ?? '400').split(' ').map(Number);
  const clamp = (weight: number) =>
    Math.min(Math.max(weight, Math.min(...weights)), Math.max(...weights));
  const quoted = quoteFamily(family);
  return {
    stack: quoted ? `${quoted}, ${FALLBACK_STACK}` : FALLBACK_STACK,
    lightWeight: clamp(300),
    boldWeight: clamp(700),
    family,
    source: 'fallback',
  };
}

/**
 * One sentence naming the face AND its rung, for the node badge and the config panel.
 *
 * Shared so the two surfaces cannot drift into saying different things about one render. A
 * substitute face is fine; an unlabelled substitute is the lie this product does not tell.
 */
export const describeHeadlineFaces = (faces: HeadlineFaces): string =>
  faces.source === 'fallback'
    ? `${faces.family} — no brand face found`
    : `${faces.family} — from ${BRAND_TYPE_SOURCE_LABEL[faces.source]}`;

/**
 * The same sentence for the INK, and the reason it is a separate function rather than a
 * parameter: the fallback rung means something different here. A fallback FACE is a face we
 * ship; a fallback INK is a measurement, so the label has to say what was measured and why,
 * not just that nothing was found.
 */
export const describeHeadlineInk = (ink: HeadlineInk): string => {
  if (ink.source === 'custom') {
    return `${rgbToHex(ink.rgb)} — picked by hand, not from the palette`;
  }
  if (ink.source === 'fallback') {
    return `no brand colour found — using ${ink.fallbackName ?? 'black'} for legibility`;
  }
  const named = `${ink.tokenName ?? rgbToHex(ink.rgb)} — from ${BRAND_INK_SOURCE_LABEL[ink.source]}`;
  // A substitution is still a substitution even when what replaced it is a real brand colour.
  return ink.substitutedFor ? `${named} (no token named "${ink.substitutedFor}")` : named;
};

const fontShorthand = (faces: HeadlineFaces, style: TextStyle): string =>
  `${style.weight === 'bold' ? faces.boldWeight : faces.lightWeight} ${style.sizePx}px ${faces.stack}`;

// ── Headline text ────────────────────────────────────────────────────────────────────────

/**
 * `**like this**` marks the bold run inside an otherwise light headline.
 *
 * The reference headline changes weight MID-SENTENCE on a shared baseline, which is what
 * `HeadlineToken[]` exists to express; a plain string would collapse it to one face. Markdown's
 * own emphasis marker is used rather than a new syntax because it is what a copywriter already
 * types, and because an unmatched `**` degrades to literal text instead of eating the headline.
 */
export function parseHeadline(text: string): HeadlineToken[] {
  const tokens: HeadlineToken[] = [];
  for (const [index, piece] of text.split('**').entries()) {
    if (piece.length === 0) continue;
    tokens.push({ text: piece, weight: index % 2 === 1 ? 'bold' : 'light' });
  }
  return tokens;
}

// ── Measurement ──────────────────────────────────────────────────────────────────────────

/**
 * Advance width from a real 2D context, with EVERY optional metric turned off.
 *
 * Kerning and ligatures are the reason a planned break and a drawn line disagree: the planner
 * sums per-word advances, the renderer lays out a glyph run, and any context-dependent
 * adjustment between two glyphs makes the second number smaller than the first. A line that
 * measured as fitting then overruns — or, worse, fits with a gap the balanced breaker would
 * have spent differently. Both sides are pinned to the same plain, additive metrics:
 * `font-kerning: none` and `font-variant-ligatures: none` here and in the SVG, and an explicit
 * `letterSpacing` so a UA default can never be the thing that differs.
 */
export function createMeasurer(faces: HeadlineFaces, trackingPx: number): MeasureText {
  const ctx = new OffscreenCanvas(1, 1).getContext('2d');
  if (!ctx) throw new Error('This browser could not create a 2D canvas context to measure type');
  return (text, style) => {
    ctx.font = fontShorthand(faces, style);
    ctx.letterSpacing = `${trackingPx}px`;
    ctx.fontKerning = 'none';
    return ctx.measureText(text).width;
  };
}

// ── Treatment ────────────────────────────────────────────────────────────────────────────

/** How far the harmonise pastel sits from the ink, toward white. */
const HARMONISE_PASTEL_MIX = 0.82;
/** How hard the pastel lifts the shadows. */
const HARMONISE_STRENGTH = 0.35;
/** Feather radius of the scrim, as a fraction of the BOX's short side (`_scrim`'s `pluma`). */
const SCRIM_FEATHER_FRACTION = 0.18;

/**
 * How far past the box the scrim's feather reaches, in px. Nothing beyond this is touched.
 *
 * Exported for `text:render:bench`, which asserts that every pixel outside this band is
 * byte-identical before and after. It calls the function rather than re-deriving the number, so
 * the fence cannot drift away from the thing it is fencing.
 */
export function scrimReachPx(frame: Size, box: FractionalBox): number {
  const rect = resolveBox(frame, box);
  return 2 * Math.max(2, Math.min(rect.width, rect.height) * SCRIM_FEATHER_FRACTION);
}

const pastelOf = (ink: Rgb): string =>
  rgbToHex([
    Math.round(ink[0] + (255 - ink[0]) * HARMONISE_PASTEL_MIX),
    Math.round(ink[1] + (255 - ink[1]) * HARMONISE_PASTEL_MIX),
    Math.round(ink[2] + (255 - ink[2]) * HARMONISE_PASTEL_MIX),
  ]);

type Ctx2d = OffscreenCanvasRenderingContext2D;

/**
 * `textPlacementConfig.plate`: a solid shape behind the block, or nothing. `band` is the colour
 * block of a split layout: full width, and on to whichever frame edge (top or bottom) is nearer.
 * `column` is the same block split the other way — full height, on to the nearer SIDE edge — so a
 * split can take the photo's negative space without cutting the subject at the waist.
 */
export type TextPlate = 'none' | 'pill' | 'box' | 'band' | 'column';

/** A plate as drawn: its shape, the body size its padding is measured in, and its colour. */
export interface PlateSpec {
  readonly shape: Exclude<TextPlate, 'none'>;
  /** The block's largest body size in px. Padding is in ems, never a share of the block. */
  readonly emPx: number;
  /** A chosen colour (brand or palette). Null is black or white, whichever the ink reads on. */
  readonly fill?: Rgb | null;
}

/** Where the first line's glyphs start below its em-box top: the cap height, roughly. */
const CAP_OFFSET_EM = 0.3;
const PLATE_PAD_Y_EM = { pill: 0.5, box: 0.4, band: 0.9, column: 0 } as const;
const PLATE_PAD_X_EM = { pill: 0.9, box: 0.5, band: 0, column: 0.9 } as const;
/** Clear space between two stacked plates, so they read as two shapes rather than one. */
const PLATE_GAP_EM = 0.2;
/** Between two unplated paragraphs: more than the line step, so the break reads as a break. */
const PARAGRAPH_GAP_EM = 0.45;

export const plateSpecFor = (
  plate: TextPlate,
  emPx: number,
  fill: Rgb | null = null,
): PlateSpec | null => (plate === 'none' ? null : { shape: plate, emPx, fill });

/**
 * The plate's rectangle, padded off the WORDS rather than the em box: the first line's glyphs
 * start about 0.3 em below the block top and the last baseline IS the block bottom, so the same
 * pad above the caps and below the baseline centres the type on its plate.
 */
export function plateRect(
  frame: Size,
  box: FractionalBox,
  plate: PlateSpec,
): { x: number; y: number; width: number; height: number; radius: number } {
  const rect = resolveBox(frame, box);
  const padY = plate.emPx * PLATE_PAD_Y_EM[plate.shape];
  const padX = plate.emPx * PLATE_PAD_X_EM[plate.shape];
  const y = rect.y + plate.emPx * CAP_OFFSET_EM - padY;
  const height = rect.y + rect.height + padY - y;
  if (plate.shape === 'band') {
    // Edge to edge, and on to the nearer frame edge: a block that sits low runs to the bottom.
    const low = rect.y + rect.height / 2 > frame.height / 2;
    return low
      ? { x: 0, y, width: frame.width, height: frame.height - y, radius: 0 }
      : { x: 0, y: 0, width: frame.width, height: y + height, radius: 0 };
  }
  if (plate.shape === 'column') {
    // Top to bottom, and on to the nearer side edge: a block set on the right runs to the right.
    const right = rect.x + rect.width / 2 > frame.width / 2;
    return right
      ? {
          x: rect.x - padX,
          y: 0,
          width: frame.width - rect.x + padX,
          height: frame.height,
          radius: 0,
        }
      : { x: 0, y: 0, width: rect.x + rect.width + padX, height: frame.height, radius: 0 };
  }
  return {
    x: rect.x - padX,
    y,
    width: rect.width + 2 * padX,
    height,
    radius: plate.shape === 'pill' ? height / 2 : plate.emPx * 0.25,
  };
}

/** Black or white, whichever the ink reads on: the plate's colour when none was chosen. */
export const plateFill = (ink: Rgb): Rgb =>
  contrastRatio(ink, FALLBACK_INK_LIGHT) >= contrastRatio(ink, FALLBACK_INK_DARK)
    ? FALLBACK_INK_LIGHT
    : FALLBACK_INK_DARK;

/**
 * Composite the treatment onto a frame that already holds the photo — BEHIND THE HEADLINE ONLY:
 * `box` plus the feather ring around it, and not one pixel further.
 *
 * This is `_scrim` (render_pieza.py:797), not `_velo_marca` (:836). The reference has both and
 * they are for different jobs: `_velo_marca` is one client's house-style horizontal ramp across
 * the whole frame, and `_scrim` is what a designer actually does when the headline lands on a
 * dark patch — *lighten only the indicated box, with blurred edges; lift the background just
 * beneath the text*. A general-purpose "Burn In Text" node wants the second one. Porting the
 * first is what made this wash out every photo it touched.
 *
 * FEATHERED, because a hard-edged rectangle reads as a box stuck on top of the photo. The
 * radius is `max(2, min(w, h) · 0.18)` of the BOX, exactly as `pluma` is. `ctx.filter = blur(σ)`
 * over one fillRect, not hand-rolled gradient stops: four edge gradients plus four corner
 * gradients would be more code for a worse approximation of a Gaussian.
 *
 * THE RAMP FALLS OUTSIDE THE BOX, NOT INSIDE IT, and that is a contrast requirement rather than
 * a taste one. Feathering inward puts half the box's area — a 0.18 ring on both sides — under a
 * ramp that reaches zero exactly where the type's edges are; the probe then reads the untreated
 * corners as its dark percentile and NO floor clears, not even 0.9. Measured: the dark bench
 * photo exhausted the whole ladder at 1.52:1. So the fill is the box grown by one feather and
 * the clip is the box grown by two, with σ = feather/2: the measured box sits at ≥ 97 % of the
 * chosen alpha, the ramp lives in the ring beyond it, and the clip caps the reach at
 * {@link scrimReachPx} so "only behind the headline" stays a guarantee rather than a hope.
 *
 * HARMONISE IS BOX-LOCAL TOO, deliberately. In the reference `_armonizar` is a global tone
 * treatment because that IS the client's look, applied to every piece whether or not a headline
 * needed rescuing. Here it is only ever reached BECAUSE the ladder is rescuing one headline, and
 * a global lift to fix a local problem is the same bug as the global veil. Keeping both rungs on
 * the same geometry also keeps the ladder honest: rung 1's measurement predicts rung 2's look.
 *
 * The steps are applied from the pristine photo, in order, and there is at most one veil among
 * them — `resolveTreatment` raises a floor rather than adding a layer.
 *
 * THE PLATE IS THE LAST STEP, and it lives here rather than beside the glyph draw so the probe
 * sees it: a CTA on a plate is measured against the plate, clears at rung 0, and the ladder never
 * veils a photo to rescue type that was never over the photo. Solid, unfeathered and unclipped —
 * a button with a blurred edge reads as a smudge.
 */
export function applyTreatment(
  ctx: Ctx2d,
  steps: readonly TreatmentStep[],
  frame: Size,
  ink: Rgb,
  box: FractionalBox,
  plate: PlateSpec | null = null,
): void {
  if (steps.length === 0 && !plate) return;
  const rect = resolveBox(frame, box);
  const reach = scrimReachPx(frame, box);
  const feather = reach / 2;
  const grown = (by: number) => ({
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  });
  const core = grown(feather);
  const bounds = grown(reach);
  const blur = `blur(${(feather / 2).toFixed(2)}px)`;
  for (const step of steps) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.x, bounds.y, bounds.width, bounds.height);
    ctx.clip();
    ctx.filter = blur;
    if (step.kind === 'harmonise') {
      ctx.globalCompositeOperation = 'lighten';
      ctx.globalAlpha = HARMONISE_STRENGTH;
      ctx.fillStyle = pastelOf(ink);
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = step.floor;
      ctx.fillStyle = '#ffffff';
    }
    ctx.fillRect(core.x, core.y, core.width, core.height);
    ctx.restore();
  }
  if (!plate) return;
  const shape = plateRect(frame, box, plate);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.fillStyle = rgbToHex(plate.fill ?? plateFill(ink));
  ctx.beginPath();
  ctx.roundRect(shape.x, shape.y, shape.width, shape.height, shape.radius);
  ctx.fill();
  ctx.restore();
}

/** The scratch frame the probe re-composites on, and the pixels it reads back. */
export function createProbe(
  image: DrawableImage,
  frame: Size,
  ink: Rgb,
  plate: PlateSpec | null = null,
): ProbeContrast {
  const canvas = new OffscreenCanvas(frame.width, frame.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create a 2D canvas context to probe pixels');
  return (box, state) => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, frame.width, frame.height);
    ctx.drawImage(image, 0, 0, frame.width, frame.height);
    applyTreatment(ctx, state.treatments, frame, ink, box, plate);
    return boxContrast(readBox(ctx, frame, box), ink);
  };
}

/**
 * The last ink rung: measure the photo where the type will sit, and take the legible one.
 *
 * The box is the one thing this needs and the plan has not produced yet — but the plan is not
 * required for it. `headlineBlockExtent` + `placementOptionsFor` derive where the block WILL
 * be from the faces and the settings alone, which is exactly what the panel does to draw the
 * drag rectangle. So the ink is measured over the same pixels the type will cover, before the
 * planner that needs an ink ever runs.
 *
 * Measured over the PRISTINE photo, deliberately. The treatment ladder runs afterwards and
 * exists to rescue whatever ink it is handed; choosing the ink against an already-veiled frame
 * would pick the colour that suits a treatment nobody has decided on yet.
 */
export function deriveHeadlineInk(
  image: DrawableImage,
  headline: string,
  faces: HeadlineFaces,
  settings: ImageTextSettings,
): HeadlineInk {
  const frame: Size = { width: image.width, height: image.height };
  const canvas = new OffscreenCanvas(frame.width, frame.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create a 2D canvas context to measure ink');
  ctx.drawImage(image, 0, 0, frame.width, frame.height);

  const extent = headlineBlockExtent({
    tokens: parseHeadline(headline),
    frame,
    measureText: createMeasurer(faces, 0),
    measureFraction: settings.measure,
    scale: settings.scale,
  });
  // `blockRect`, not `placementOptionsFor`: the same fractional box the panel draws the drag
  // rectangle from, so the ink is measured over exactly the pixels the user placed the type on.
  const box = blockRect(
    {
      anchor: settings.anchor,
      offsetX: settings.offsetX,
      offsetY: settings.offsetY,
      marginFrac: settings.marginFrac,
    },
    extent,
  );
  const derived = deriveLegibleInk(readBox(ctx, frame, box), FULL_FRAME);
  return {
    rgb: derived.rgb,
    source: 'fallback',
    tokenName: null,
    fallbackName: derived.name,
    fallbackRatio: derived.ratio,
  };
}

/** The box, as a packed buffer `darkPercentileContrast` can read whole. */
function readBox(ctx: Ctx2d, frame: Size, box: FractionalBox): PixelBuffer {
  const rect = resolveBox(frame, box);
  const image = ctx.getImageData(rect.x, rect.y, rect.width, rect.height);
  return { width: rect.width, height: rect.height, data: image.data, channels: 4 };
}

const boxContrast = (pixels: PixelBuffer, ink: Rgb): number =>
  darkPercentileContrast(pixels, FULL_FRAME, ink).ratio;

// ── The SVG ──────────────────────────────────────────────────────────────────────────────

export const escapeXml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char] ?? char,
  );

/**
 * The plan's glyph run as an SVG document.
 *
 * NOT `drawTextOverlays` (utils/render/effectSpec.ts), and the mismatch is structural rather
 * than a matter of taste: that renderer centres ONE line at a fractional point, hard-codes a
 * system-ui face, and strokes a black outline under the fill. Every one of those is the
 * opposite of what a plan needs — the plan is right-anchored, multi-line, mixed-weight on a
 * shared baseline, in the brand's face, and its ink may not be touched by an outline. There
 * is nothing to reuse but the idea of drawing text, so this is the second text renderer in
 * the codebase and deliberately so.
 *
 * Right-anchored: `text-anchor="end"` at the plan's anchor x, one `<text>` per line, one
 * `<tspan>` per word so a mixed-weight line keeps its per-word face. The inter-word space rides
 * on the FOLLOWING word's tspan, which is the same rule `breakLines` measured with — putting it
 * on the preceding one changes the advance on every light→bold boundary.
 *
 * The alphabetic baseline sits one em below the line's top slot, so mixed sizes on one line
 * share a BASELINE rather than a box top — the thing that made the reference's type "look
 * different" even when the faces were right.
 */
export function headlineSvg(
  plan: PlacementPlan,
  faces: HeadlineFaces,
  ink: Rgb,
  fontFaceCss?: string | null,
): string {
  const { width, height } = plan.frame;
  const lines = plan.lines
    .map((line) => {
      const baseline = plan.anchor.yPx + line.baselineOffsetPx + line.sizePx;
      const runs = line.words
        .map(
          (word, index) =>
            `<tspan font-size="${word.sizePx}" font-weight="${
              word.weight === 'bold' ? faces.boldWeight : faces.lightWeight
            }">${index > 0 ? ' ' : ''}${escapeXml(word.text)}</tspan>`,
        )
        .join('');
      return (
        `<text x="${plan.anchor.xPx}" y="${baseline}" text-anchor="end"` +
        ` letter-spacing="${line.trackingPx}" xml:space="preserve">${runs}</text>`
      );
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}">` +
    (fontFaceCss ? `<defs><style type="text/css">${escapeXml(fontFaceCss)}</style></defs>` : '') +
    `<g font-family="${escapeXml(faces.stack)}" fill="${rgbToHex(ink)}" font-kerning="none" ` +
    `style="font-variant-ligatures:none">${lines}</g></svg>`
  );
}

/**
 * Make one family real on BOTH sides of the render, or say it could not.
 *
 * Two different mechanisms, one call, because they have to agree: `registerCaptionFonts` puts
 * the face on this thread's `FontFaceSet` so `ctx.measureText` sizes the plan in it, and the
 * `@font-face` data URI puts the same bytes inside the SVG so the glyphs are drawn in it. Skip
 * either and the piece breaks in the direction that is hardest to see — a plan measured in
 * Montserrat and drawn in Helvetica breaks its own lines in the wrong places.
 *
 * A brand face travels as bytes with the request (`BrandTypeInputs.fontEmbeds`, which the server
 * lanes fill): when `embeds` carry the family, THOSE bytes are registered and inlined. Otherwise a
 * face we ship is, and null for a family we hold no bytes for — which then resolves to
 * `FALLBACK_STACK` in both paths: consistent, and not the brand's face. `HeadlineFaces.source` is
 * honest about which SHAPE named the family; it does not claim the bytes were found.
 *
 * Exported for the benches that call `renderHeadline` directly to read back a plan: they have to
 * feed it the SAME face this op fed it, or the frame they grade is not the frame the op drew.
 */
export async function embedFace(
  family: string,
  embeds?: readonly DesignSystemFontEmbed[] | null,
): Promise<string | null> {
  try {
    const own = embedsFor(embeds, family);
    if (own.length) return await embedBrandFonts(own);
    const [css] = await Promise.all([captionFontFaceCss(family), ensureCaptionFonts([family])]);
    return css;
  } catch {
    // NEVER THROWS. A 404 or a network blip on `/fonts/*.woff2` must not take the op down: the
    // whole point of the last rung is that it draws. Without the bytes the family resolves to
    // `FALLBACK_STACK` on both sides — consistent, and a headline in a substitute face beats an
    // exception. Found by `text:render:bench`, which serves no fonts at all.
    return null;
  }
}

/**
 * The SVG as a `data:` URI — never a `blob:` one.
 *
 * A blob-sourced SVG taints the canvas it is drawn onto, and the next Mediabunny frame read off
 * that canvas throws 'tainted sources'. This is a fixed bug; the data URI is the fix.
 */
export const headlineSvgDataUri = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Rasterise a frame-sized SVG over the canvas. `image.cta` draws its component through it too. */
export async function drawSvg(ctx: Ctx2d, svg: string, frame: Size): Promise<void> {
  if (typeof Image === 'undefined') {
    throw new Error('Setting type needs a document to rasterise the glyph run');
  }
  const image = new Image(frame.width, frame.height);
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('The type could not be rasterised'));
  });
  image.src = headlineSvgDataUri(svg);
  await loaded;
  // Belt and braces: whatever the treatment left on the context, the ink is drawn at full
  // opacity over the top in `source-over`. Nothing here may change the colour of the type.
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  ctx.drawImage(image, 0, 0, frame.width, frame.height);
}

// ── The op ───────────────────────────────────────────────────────────────────────────────

export interface ImageTextSettings {
  /** One of the nine anchor points the type block is pinned to. */
  readonly anchor: BurnInAnchor;
  /** Nudge off the anchor, as a fraction of the frame's width / height. Zero IS the anchor. */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly marginFrac: number;
  readonly inkToken: string;
  /** A hand-picked ink that outranks {@link inkToken}. Null means the palette chain decides. */
  readonly inkHex: string | null;
  readonly measure: number;
  readonly minContrast: number;
  readonly escalate: boolean;
  /** May the face fall back to one Continuum ships? Off restores a hard refusal. */
  readonly fallbackType: boolean;
  /** May the ink be MEASURED off the photo? Off restores a hard refusal. */
  readonly fallbackInk: boolean;
  /** A solid plate behind the block. Anything but `none` also shrinks the measure to the words. */
  readonly plate: TextPlate;
  /** The plate's colour, when one was chosen; null keeps black or white. */
  readonly plateHex: string | null;
  /** How the paragraphs of a stack line up: flush right (the reference), or centred. */
  readonly align: 'right' | 'center';
  /** Type size against the calibrated reference headline; 1 is the reference. */
  readonly scale: number;
  /** The size of an all-light paragraph (a subhead); null sizes it with {@link scale}. */
  readonly subScale: number | null;
  /** A face Continuum ships, named by the step; null reads the brand's (see {@link shippedFaces}). */
  readonly family: string | null;
  /** Throw on a word the lines broke in two instead of drawing it (headless stills set this). */
  readonly refuseSplit: boolean;
}

/** `textPlacementConfig`, already parsed by `parseActionConfig`, read as the shape it is. */
export const readSettings = (config: Record<string, unknown>): ImageTextSettings => ({
  anchor: config.anchor as BurnInAnchor,
  offsetX: config.offsetX as number,
  offsetY: config.offsetY as number,
  marginFrac: config.marginFrac as number,
  inkToken: (config.inkToken as string) ?? '',
  inkHex: typeof config.inkHex === 'string' ? config.inkHex : null,
  measure: config.measure as number,
  minContrast: config.minContrast as number,
  escalate: config.escalate as boolean,
  fallbackType: config.fallbackType !== false,
  fallbackInk: config.fallbackInk !== false,
  plate:
    config.plate === 'pill' ||
    config.plate === 'box' ||
    config.plate === 'band' ||
    config.plate === 'column'
      ? config.plate
      : 'none',
  plateHex: typeof config.plateHex === 'string' ? config.plateHex : null,
  align: config.align === 'center' ? 'center' : 'right',
  scale: typeof config.scale === 'number' && config.scale > 0 ? config.scale : 1,
  subScale: typeof config.subScale === 'number' && config.subScale > 0 ? config.subScale : null,
  family: typeof config.family === 'string' && config.family.trim() ? config.family : null,
  refuseSplit: config.refuseSplit === true,
});

/**
 * The measure a PLATED block breaks to: its own widest line, not the composition measure.
 *
 * The block is the measure box and the type is right-aligned inside it, so a short CTA on the
 * default 0.61 measure would sit at the right end of a plate twice its width. Breaking once at
 * the configured measure and then taking the widest line makes the box hug the words, which is
 * also what lets `bottom-center` actually centre them. One px of slack keeps the re-break from
 * wrapping a line that measured exactly at the edge.
 */
export function snugMeasure(
  headline: string,
  frame: Size,
  measureText: MeasureText,
  measureFraction: number,
  scale = 1,
): number {
  const broken = breakLines(parseHeadline(headline), measureText, {
    measure: frame.width * measureFraction,
    lightSizePx: frame.width * VERNE_TITLE_LIGHT_SIZE * scale,
    boldSizePx: frame.width * VERNE_TITLE_BOLD_SIZE * scale,
  });
  const widest = Math.max(0, ...broken.lines.map((line) => line.width));
  return Math.min(measureFraction, (widest + 1) / frame.width);
}

/**
 * The largest scale, up to `scale`, at which every word fits the measure whole. `breakLines`
 * splits a word wider than the measure mid-word, and the Easy Fit stills shipped "descuent / o"
 * and "anualida / d": a paragraph shrinks instead, however narrow its column.
 */
export function wordFitScale(
  tokens: readonly HeadlineToken[],
  frame: Size,
  measureText: MeasureText,
  measureFraction: number,
  scale: number,
): number {
  const limit = frame.width * measureFraction;
  const widest = (at: number) =>
    Math.max(
      0,
      ...tokens.flatMap((token) => {
        const size = token.weight === 'bold' ? VERNE_TITLE_BOLD_SIZE : VERNE_TITLE_LIGHT_SIZE;
        const style = { weight: token.weight, sizePx: frame.width * size * at };
        return token.text.split(/\s+/).map((word) => (word ? measureText(word, style) : 0));
      }),
    );
  const wide = widest(scale);
  if (wide <= limit) return scale;
  // Advance is near-linear in size; a real font's hinting can still round a word over, so step down.
  let fit = (scale * limit) / wide;
  while (fit > 0.01 && widest(fit) > limit) fit *= 0.98;
  return fit;
}

/** One paragraph of the stack: its words, its body size, and the box it is planned into. */
export interface StackedParagraph {
  readonly text: string;
  readonly tokens: HeadlineToken[];
  /** The type scale this paragraph is planned at: `subScale` for a subhead, else `scale`. */
  readonly scale: number;
  readonly emPx: number;
  readonly options: Required<
    Pick<PlacementOptions, 'rightMarginFraction' | 'boxTop' | 'boxBottom' | 'measureFraction'>
  >;
}

/**
 * A newline starts a new paragraph, and paragraphs STACK: one right-aligned column, each
 * paragraph on its own lines, placed as one block at the anchor.
 *
 * Why a paragraph and not just a second `image.text` step: the second block's position depends
 * on how many lines the first one broke into, which only the measurer here knows. Merging a
 * headline and a subhead into one flowing run is the other option, and it wraps the headline's
 * last word onto the subhead's line — "The jeans I live / in High rise, dark" — which reads as
 * one broken sentence.
 *
 * One paragraph reduces EXACTLY to the old single-block placement: no gap, the same origin, the
 * same right margin and box. Each paragraph is planned on its own, so each gets its own
 * contrast probe, treatment and (when plated) its own plate.
 */
export function stackParagraphs(args: {
  text: string;
  frame: Size;
  measureText: MeasureText;
  settings: ImageTextSettings;
}): StackedParagraph[] {
  const { frame, measureText, settings } = args;
  // A column is a panel, not a plate that hugs the words: it keeps the measure it was given and
  // the paragraph gaps of unplated type, and every paragraph paints the same full-height panel.
  const plated = settings.plate !== 'none' && settings.plate !== 'column';
  const blocks = args.text
    .split('\n')
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((text) => {
      const tokens = parseHeadline(text);
      const bold = tokens.some((token) => token.weight === 'bold');
      // A subhead is the all-light paragraph, and it is sized on its own: at a cover headline's
      // scale it would be body copy set as big as a headline. No word breaks mid-word.
      const scale = wordFitScale(
        tokens,
        frame,
        measureText,
        settings.measure,
        !bold && settings.subScale ? settings.subScale : settings.scale,
      );
      const measureFraction = plated
        ? snugMeasure(text, frame, measureText, settings.measure, scale)
        : settings.measure;
      const extent = headlineBlockExtent({ tokens, frame, measureText, measureFraction, scale });
      const size = bold ? VERNE_TITLE_BOLD_SIZE : VERNE_TITLE_LIGHT_SIZE;
      return { text, tokens, extent, scale, emPx: frame.width * size * scale };
    });
  if (blocks.length === 0) return [];

  const padY = plated ? PLATE_PAD_Y_EM[settings.plate] : 0;
  const gapFrac = blocks.map((block, index) => {
    if (index === 0) return 0;
    const upper = blocks[index - 1]!;
    const px = plated
      ? padY * upper.emPx + (padY - CAP_OFFSET_EM + PLATE_GAP_EM) * block.emPx
      : PARAGRAPH_GAP_EM * block.emPx;
    return px / frame.height;
  });
  const combined: BlockExtent = {
    widthFrac: Math.max(...blocks.map((block) => block.extent.widthFrac)),
    heightFrac: blocks.reduce(
      (sum, block, index) => sum + block.extent.heightFrac + (gapFrac[index] ?? 0),
      0,
    ),
    lines: blocks.reduce((sum, block) => sum + block.extent.lines, 0),
  };
  const origin = blockOrigin(
    {
      anchor: settings.anchor,
      offsetX: settings.offsetX,
      offsetY: settings.offsetY,
      marginFrac: settings.marginFrac,
    },
    combined,
  );
  const rightEdge = origin.x + combined.widthFrac;
  const centre = origin.x + combined.widthFrac / 2;
  let top = origin.y;
  return blocks.map((block, index) => {
    // Centred stacks centre each paragraph on the column; flush-right ones share its edge.
    const right = settings.align === 'center' ? centre + block.extent.widthFrac / 2 : rightEdge;
    const rightMarginFraction = Math.max(0, 1 - right);
    top += gapFrac[index] ?? 0;
    const boxTop = top;
    top += block.extent.heightFrac;
    return {
      text: block.text,
      tokens: block.tokens,
      scale: block.scale,
      emPx: block.emPx,
      options: {
        measureFraction: block.extent.widthFrac,
        rightMarginFraction,
        boxTop,
        // A block taller than the frame is clamped rather than allowed to describe a box the
        // probe would read off the end of the pixel buffer.
        boxBottom: Math.min(1, boxTop + block.extent.heightFrac),
      },
    };
  });
}

export interface HeadlineRender {
  /** The first paragraph's plan: the whole plan when the text is one paragraph. */
  readonly plan: PlacementPlan;
  readonly plans: readonly PlacementPlan[];
  readonly svg: string;
  readonly canvas: OffscreenCanvas;
}

/**
 * Plan the type against the photo, composite the treatment the plan chose, draw the glyphs.
 *
 * No framing search: the input image IS the frame, so there is no crop slack to spend and
 * re-cropping the user's picture is not what "set type on this" was asked for. `planPlacement`
 * takes the centred crop when no `source` is given, which is the identity here.
 *
 * THE PLACEMENT IS AN INPUT TO THE PLAN, NEVER A REPLACEMENT FOR IT. The anchor and the nudge
 * choose WHERE the measure sits; `planPlacement` still breaks the lines, sizes them, probes the
 * pixels behind them and walks the treatment ladder. Because the box moves WITH the block, a
 * hand-dragged headline over a dark patch escalates the BACKGROUND exactly as an anchored one
 * does — the ladder is documented never to move or resize the type, so the placement always
 * survives and readability is what changes.
 *
 * ONE MEASURER for the block extent and for the plan. Two would be the same drift
 * `createMeasurer` exists to prevent, one level up: a block sized by metrics the breaker did
 * not use sits somewhere the user never put it.
 */
export async function renderHeadline(args: {
  image: DrawableImage;
  headline: string;
  ink: Rgb;
  faces: HeadlineFaces;
  settings: ImageTextSettings;
  /**
   * The `@font-face` rule to inline, when the face is one we ship. Resolved by the CALLER and
   * awaited BEFORE the measurer is built — `createMeasurer` reads the thread's font set at
   * call time, so registering after this point would size the plan in the wrong face.
   */
  fontFaceCss?: string | null;
}): Promise<HeadlineRender> {
  const frame: Size = { width: args.image.width, height: args.image.height };
  const canvas = new OffscreenCanvas(frame.width, frame.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create a 2D canvas context to set type');

  const measureText = createMeasurer(args.faces, 0);
  const escalate = args.settings.escalate;
  const planned = stackParagraphs({
    text: args.headline,
    frame,
    measureText,
    settings: args.settings,
  }).map((paragraph) => {
    const plate = plateSpecFor(
      args.settings.plate,
      paragraph.emPx,
      args.settings.plateHex ? parseHexColour(args.settings.plateHex) : null,
    );
    const plan = planPlacement({
      tokens: paragraph.tokens,
      frame,
      measureText,
      probeContrast: createProbe(args.image, frame, args.ink, plate),
      options: {
        ...paragraph.options,
        scale: paragraph.scale,
        ink: args.ink,
        // escalate:false pins the piece at rung 0. A zero bar makes the ladder return `direct`
        // after ONE probe instead of walking eight it is forbidden to use; the ratio it carries
        // is the real measurement, and `cleared` is restated below against the real bar so a
        // piece that falls short says so rather than inheriting a bar it never faced.
        minContrast: escalate ? args.settings.minContrast : 0,
      },
    });
    return {
      plan: escalate ? plan : pinnedToRungZero(plan, args.settings.minContrast),
      plate,
    };
  });
  const first = planned[0];
  if (!first) throw new Error('Nothing is connected to this action\'s "text-in" input');
  if (args.settings.refuseSplit) refuseSplitWords(args.headline, planned.map(({ plan }) => plan));

  // Every treatment and plate first, then every glyph run: a lower paragraph's plate must never
  // be painted over the words of the one above it.
  ctx.drawImage(args.image, 0, 0, frame.width, frame.height);
  for (const { plan, plate } of planned)
    applyTreatment(ctx, plan.treatment.steps, frame, args.ink, plan.treatment.box, plate);
  const svgs = planned.map(({ plan }) => headlineSvg(plan, args.faces, args.ink, args.fontFaceCss));
  for (const svg of svgs) await drawSvg(ctx, svg, frame);
  return {
    plan: first.plan,
    plans: planned.map(({ plan }) => plan),
    svg: svgs[0] ?? '',
    canvas,
  };
}

/**
 * Throw when any drawn word is no whole word of the text: a word the lines broke in two. Opt-in
 * (`refuseSplit`) — a headless still refuses the frame and tries its next layout, where the canvas
 * keeps drawing. `wordFitScale` should make this unreachable; this is what makes it certain.
 */
export function refuseSplitWords(text: string, plans: readonly PlacementPlan[]): void {
  const whole = new Set(parseHeadline(text.replace(/\n/g, ' ')).flatMap((token) => token.text.split(/\s+/)));
  const pieces = plans.flatMap((plan) =>
    plan.lines.flatMap((line) => line.words.map((word) => word.text)),
  );
  const broken = pieces.filter((piece) => piece && !whole.has(piece));
  if (broken.length) throw new Error(`layout_fault:split_word:${broken.join(' / ')}`);
}

function pinnedToRungZero(plan: PlacementPlan, minContrast: number): PlacementPlan {
  const treatment: PlacementTreatment = {
    ...plan.treatment,
    cleared: plan.treatment.ratio >= minContrast,
  };
  return { ...plan, treatment };
}

/**
 * The `SYNC_OPS` adapter: resolve the brand's type and ink, render, hand back the frame.
 *
 * THE TWO REFUSALS ARE NOT THE SAME REFUSAL, and collapsing them is the bug this replaces. A
 * missing design system used to fail the whole node — correct for the INK, where a guess ships
 * an off-brand piece nobody catches, and wrong for the TYPE, where the brand's faces are very
 * often in its brand book instead. So: type always resolves, down to a face we ship and embed,
 * and says which rung it used; ink walks the same shapes and refuses when NONE of them carry a
 * colour. The message names which of the two is missing rather than blaming "the design system".
 *
 * Returns the CANVAS, not a `NodeOutput`: `imageOutput` in runAction.ts is the one place a
 * finished canvas becomes an output, and every other image op goes through it.
 */
export async function setImageText(args: {
  brand: BrandTypeInputs | null | undefined;
  config: Record<string, unknown>;
  image: DrawableImage;
  headline: string;
}): Promise<OffscreenCanvas> {
  if (!args.headline.trim()) {
    throw new Error('Nothing is connected to this action\'s "text-in" input');
  }

  const brand = args.brand ?? {};
  const settings = readSettings(args.config);
  const faces = settings.family ? shippedFaces(settings.family) : resolveHeadlineFaces(brand);
  // A face the step names is a choice, not a fallback the brand was denied.
  if (faces.source === 'fallback' && !settings.fallbackType && !settings.family) {
    throw new Error(
      'This brand names no typeface — not in a design system, a brand book, a brand kit or a ' +
        'website — and "Use a fallback typeface" is switched off for this action. Switch it on ' +
        `to set the headline in ${faces.family}, or add a typeface to the brand.`,
    );
  }

  // The face has to be registered BEFORE anything measures: `createMeasurer` reads this
  // thread's font set at call time, and the ink is chosen over the box those metrics produce.
  const fontFaceCss = await embedFace(faces.family, brand.fontEmbeds);

  // A HAND-PICKED INK SKIPS THE LADDER ENTIRELY, and has to: every rung below exists to answer
  // "the brand did not carry the colour we asked for", which a literal hex cannot be. Running
  // the refusal against it would reject a colour that is right there in the config.
  const custom = resolveCustomInk(settings.inkHex);

  // THREE STEPS, WORST LAST. A named token nothing carries falls back to the brand's OWN
  // default ink before it falls back to a measurement: the brand has a colour, it just is not
  // the one the config asked for, and reaching past it to a measured black would be a larger
  // substitution than the situation calls for. Every step that substitutes says so.
  const wanted = settings.inkToken.trim();
  const exact = custom ?? resolveHeadlineInk(brand, settings.inkToken);
  // OFF gates BOTH substitutions, not just the measured one. "Do not substitute" cannot mean
  // "substitute a different brand colour instead" — a user who switched this off and picked a
  // swatch wants that swatch or a refusal, and a broken token is exactly when they need to hear
  // about it. ON, the ladder below descends one step at a time.
  if (!exact && !settings.fallbackInk) {
    throw new Error(inkRefusal(brand, settings.inkToken, faces));
  }
  const substitute = exact ?? (wanted ? resolveHeadlineInk(brand, '') : null);
  // `substitutedFor` is a claim about a token that went missing, so it never rides on a
  // hand-picked colour — nothing was substituted for anything there.
  const brandInk = exact ?? (substitute ? { ...substitute, substitutedFor: wanted } : null);
  const ink = brandInk ?? deriveHeadlineInk(args.image, args.headline, faces, settings);

  const rendered = await renderHeadline({
    image: args.image,
    headline: args.headline,
    ink: ink.rgb,
    faces,
    settings,
    fontFaceCss,
  });
  return rendered.canvas;
}

/**
 * What to say when the ink, and only the ink, could not be found.
 *
 * Three different sentences because they have three different fixes: pick the token that
 * exists, add a colour to the brand, or pick a brand at all. The face is named in every one of
 * them, because "Burn In Text refused" reads as "it found nothing" unless it says otherwise.
 */
function inkRefusal(brand: BrandTypeInputs, tokenName: string, faces: HeadlineFaces): string {
  const type = `The type resolved (${describeHeadlineFaces(faces)}), so only the colour is missing.`;
  // What switching the toggle back on would ACTUALLY do, which is not the same sentence in
  // every branch: a brand that has SOME colour substitutes its own default ink, and only a
  // brand with none at all reaches the measurement.
  const onWould = resolveHeadlineInk(brand, '')
    ? 'Switching "Measure a fallback ink" back on uses this brand\'s default ink instead.'
    : 'Switching "Measure a fallback ink" back on sets it in a legible black or white measured from the photo.';
  // "Nothing could be read" OUTRANKS "that token is missing", and the order is the whole point:
  // a config naming `--ink` against a brand nobody could read is not a broken token, and telling
  // someone to fix a swatch they cannot see is worse than telling them nothing.
  if (!hasAnyBrandShape(brand)) {
    return (
      'No brand could be read, so there is no ink to set this type in. Pick a brand, then run ' +
      `"Burn In Text" again. ${type} ${onWould}`
    );
  }
  if (tokenName.trim()) {
    return (
      `No colour token named "${tokenName}" resolves to a literal colour anywhere in this ` +
      `brand — its design system, brand book, kit and website were all checked. Pick a ` +
      `different swatch or fix the token; "Burn In Text" will not guess an ink. ${type} ${onWould}`
    );
  }
  return (
    'This brand carries no colour — not in a design system, a brand book, a brand kit or a ' +
    `website scrape. Add one brand colour and "Burn In Text" will use it. ${type} ${onWould}`
  );
}
