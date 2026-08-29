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
  type BrandInkSource,
  type BrandTypeInputs,
  type BrandTypeSource,
  type BurnInAnchor,
  type DesignSection,
  type DesignToken,
  darkPercentileContrast,
  type FractionalBox,
  FULL_FRAME,
  type HeadlineToken,
  isLiteralHex,
  type MeasureText,
  type PixelBuffer,
  type PlacementPlan,
  type PlacementTreatment,
  type ProbeContrast,
  deriveLegibleInk,
  hasAnyBrandShape,
  planPlacement,
  resolveBrandInk,
  resolveBrandType,
  type Rgb,
  resolveBox,
  type Size,
  sectionForToken,
  type TextStyle,
  type TreatmentStep,
} from '@continuum/contracts';
import { captionFontFaceCss, ensureCaptionFonts } from '@/lib/clips/captionFonts';
import { blockRect, headlineBlockExtent, placementOptionsFor } from './burnInPlacement';
import type { DrawableImage } from './imageOps';

// Type comes from typography. This was a config field once — a `designSectionSchema` enum that
// offered `motion`, `voice`, `radii` and `iconography` as the source of a headline face, purely
// so the generic Zod panel had something to render. It is a constant because there is no second
// right answer, and a question with one right answer and eleven wrong ones is not a setting.
// The ink's own section died with it: `resolveBrandInk` walks the brand's shapes and names the
// one it read, which is strictly more than a section name ever said.
const TYPE_SECTION: DesignSection = 'typography';

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
  /** `fallback` only ever comes from {@link deriveHeadlineInk} — the brand walker cannot say it. */
  readonly source: BrandTypeSource;
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

const bareName = (name: string): string => name.trim().toLowerCase().replace(/^--/, '');

/** A family name safe to interpolate into a font shorthand and an XML attribute. */
const quoteFamily = (family: string): string | null => {
  const clean = family.trim().replace(/^['"]|['"]$/g, '');
  return /^[^'"(){};\\\r\n<>&]+$/.test(clean) && clean.length > 0 ? `'${clean}'` : null;
};

const weightFrom = (tokens: readonly DesignToken[], match: RegExp): number | null => {
  for (const token of tokens) {
    if (!match.test(bareName(token.name))) continue;
    const value = Number.parseInt((token.resolvedValue ?? token.value).trim(), 10);
    if (Number.isFinite(value) && value >= 1 && value <= 1000) return value;
  }
  return null;
};

/**
 * The faces, from anywhere the brand keeps type — and always an answer.
 *
 * WHICH FAMILY is the chain's call (`resolveBrandType`), so the burn-in, the panel preview and
 * anything else that has to name the face read the same rung. WHAT WEIGHTS is still a design
 * system question: `w-light` / `w-bold` are type-scale tokens and no other brand shape carries
 * them, so a brand resolved off its brand book gets the 300/700 defaults rather than a weight
 * invented from a family name.
 */
export function resolveHeadlineFaces(inputs: BrandTypeInputs): HeadlineFaces {
  const type = resolveBrandType(inputs);
  const family = quoteFamily(type.display);
  const scale = (inputs.designSystem?.tokens ?? []).filter(
    (token) => sectionForToken(token) === TYPE_SECTION,
  );
  return {
    stack: family ? `${family}, ${FALLBACK_STACK}` : FALLBACK_STACK,
    lightWeight: weightFrom(scale, /light|thin/) ?? 300,
    boldWeight: weightFrom(scale, /bold|black|heavy/) ?? 700,
    family: type.display,
    source: type.source,
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
 */
export function applyTreatment(
  ctx: Ctx2d,
  steps: readonly TreatmentStep[],
  frame: Size,
  ink: Rgb,
  box: FractionalBox,
): void {
  if (steps.length === 0) return;
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
}

/** The scratch frame the probe re-composites on, and the pixels it reads back. */
function createProbe(image: DrawableImage, frame: Size, ink: Rgb): ProbeContrast {
  const canvas = new OffscreenCanvas(frame.width, frame.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser could not create a 2D canvas context to probe pixels');
  return (box, state) => {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, frame.width, frame.height);
    ctx.drawImage(image, 0, 0, frame.width, frame.height);
    applyTreatment(ctx, state.treatments, frame, ink, box);
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

const escapeXml = (value: string): string =>
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
 * Null for a family we do not hold bytes for, which today is every brand face.
 *
 * CEILING, unchanged and now stated where it bites: an SVG rasterised as an image cannot fetch
 * a webfont, so a BRAND family that is not installed on this machine still resolves to
 * `FALLBACK_STACK` in both paths. Consistent, and not yet the brand's face. `HeadlineFaces.source`
 * is honest about which SHAPE named the family; it does not claim the bytes were found. The
 * upgrade is a byte source for brand faces (`designSystemFontEmbedSchema` already describes the
 * shape) — and when it lands it plugs in exactly here.
 *
 * Exported for the benches that call `renderHeadline` directly to read back a plan: they have to
 * feed it the SAME face this op fed it, or the frame they grade is not the frame the op drew.
 */
export async function embedFace(family: string): Promise<string | null> {
  try {
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

async function drawSvg(ctx: Ctx2d, svg: string, frame: Size): Promise<void> {
  if (typeof Image === 'undefined') {
    throw new Error('Setting type needs a document to rasterise the glyph run');
  }
  const image = new Image(frame.width, frame.height);
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('The headline could not be rasterised'));
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
  readonly measure: number;
  readonly minContrast: number;
  readonly escalate: boolean;
  /** May the face fall back to one Continuum ships? Off restores a hard refusal. */
  readonly fallbackType: boolean;
  /** May the ink be MEASURED off the photo? Off restores a hard refusal. */
  readonly fallbackInk: boolean;
}

/** `textPlacementConfig`, already parsed by `parseActionConfig`, read as the shape it is. */
export const readSettings = (config: Record<string, unknown>): ImageTextSettings => ({
  anchor: config.anchor as BurnInAnchor,
  offsetX: config.offsetX as number,
  offsetY: config.offsetY as number,
  marginFrac: config.marginFrac as number,
  inkToken: (config.inkToken as string) ?? '',
  measure: config.measure as number,
  minContrast: config.minContrast as number,
  escalate: config.escalate as boolean,
  fallbackType: config.fallbackType !== false,
  fallbackInk: config.fallbackInk !== false,
});

export interface HeadlineRender {
  readonly plan: PlacementPlan;
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

  const tokens = parseHeadline(args.headline);
  const measureText = createMeasurer(args.faces, 0);
  const extent = headlineBlockExtent({
    tokens,
    frame,
    measureText,
    measureFraction: args.settings.measure,
  });
  const placement = placementOptionsFor(
    {
      anchor: args.settings.anchor,
      offsetX: args.settings.offsetX,
      offsetY: args.settings.offsetY,
      marginFrac: args.settings.marginFrac,
    },
    extent,
  );

  const probe = createProbe(args.image, frame, args.ink);
  const escalate = args.settings.escalate;
  const planned = planPlacement({
    tokens,
    frame,
    measureText,
    probeContrast: probe,
    options: {
      ...placement,
      ink: args.ink,
      // escalate:false pins the piece at rung 0. A zero bar makes the ladder return `direct`
      // after ONE probe instead of walking eight it is forbidden to use; the ratio it carries
      // is the real measurement, and `cleared` is restated below against the real bar so a
      // piece that falls short says so rather than inheriting a bar it never faced.
      minContrast: escalate ? args.settings.minContrast : 0,
    },
  });
  const plan = escalate ? planned : pinnedToRungZero(planned, args.settings.minContrast);

  ctx.drawImage(args.image, 0, 0, frame.width, frame.height);
  applyTreatment(ctx, plan.treatment.steps, frame, args.ink, plan.treatment.box);
  const svg = headlineSvg(plan, args.faces, args.ink, args.fontFaceCss);
  await drawSvg(ctx, svg, frame);
  return { plan, svg, canvas };
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
  const faces = resolveHeadlineFaces(brand);
  if (faces.source === 'fallback' && !settings.fallbackType) {
    throw new Error(
      'This brand names no typeface — not in a design system, a brand book, a brand kit or a ' +
        'website — and "Use a fallback typeface" is switched off for this action. Switch it on ' +
        `to set the headline in ${faces.family}, or add a typeface to the brand.`,
    );
  }

  // The face has to be registered BEFORE anything measures: `createMeasurer` reads this
  // thread's font set at call time, and the ink is chosen over the box those metrics produce.
  const fontFaceCss = await embedFace(faces.family);

  // THREE STEPS, WORST LAST. A named token nothing carries falls back to the brand's OWN
  // default ink before it falls back to a measurement: the brand has a colour, it just is not
  // the one the config asked for, and reaching past it to a measured black would be a larger
  // substitution than the situation calls for. Every step that substitutes says so.
  const wanted = settings.inkToken.trim();
  const exact = resolveHeadlineInk(brand, settings.inkToken);
  // OFF gates BOTH substitutions, not just the measured one. "Do not substitute" cannot mean
  // "substitute a different brand colour instead" — a user who switched this off and picked a
  // swatch wants that swatch or a refusal, and a broken token is exactly when they need to hear
  // about it. ON, the ladder below descends one step at a time.
  if (!exact && !settings.fallbackInk) {
    throw new Error(inkRefusal(brand, settings.inkToken, faces));
  }
  const substitute = exact ?? (wanted ? resolveHeadlineInk(brand, '') : null);
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
