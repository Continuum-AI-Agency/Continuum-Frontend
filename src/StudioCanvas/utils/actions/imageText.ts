// `image.text` — set the brand's type over a still, at a place that was MEASURED.
//
// The decision is not made here. `planPlacement` (contracts, design-system/placement.ts)
// decides where the lines break, how big each one is, which edge they anchor to and what has
// to happen to the BACKGROUND for the ink to read; this module supplies the two things that
// decision needs and cannot compute — font metrics and real pixels — and then draws the plan.
//
// Three invariants hold the whole thing up:
//
//   • THE INK IS THE TOKEN. It is resolved from the brand's design system once, handed to the
//     planner, and written into the SVG `fill` verbatim. Nothing in the draw path recolours
//     it, and an unresolvable token throws — a silent black headline on a brand piece is a
//     worse outcome than a refusal somebody can act on.
//   • ONE TREATMENT FUNCTION. {@link applyTreatment} is what the contrast PROBE composites and
//     what the final frame composites. Two implementations would drift, and they would drift
//     in the flattering direction: the plan would claim a ratio the render never reached.
//   • THE METRICS THE PLAN WAS COMPUTED FROM ARE THE METRICS THAT GET DRAWN. See
//     {@link createMeasurer} — this is the single biggest source of drift in type placement.

import {
  type BurnInAnchor,
  type DesignSection,
  type DesignSystemSnapshot,
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
  planPlacement,
  type Rgb,
  resolveBox,
  type Size,
  sectionForToken,
  type TextStyle,
  type TreatmentStep,
} from '@continuum/contracts';
import { headlineBlockExtent, placementOptionsFor } from './burnInPlacement';
import type { DrawableImage } from './imageOps';

// Type comes from typography and ink comes from the palette. These were config fields once —
// two `designSectionSchema` enums that offered `motion`, `voice`, `radii` and `iconography` as
// the source of a headline colour, purely so the generic Zod panel had something to render.
// They are constants because there is no second right answer, and a question with one right
// answer and eleven wrong ones is not a setting.
const TYPE_SECTION: DesignSection = 'typography';
const INK_SECTION: DesignSection = 'palette';

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

const bareName = (name: string): string => name.trim().toLowerCase().replace(/^--/, '');

/**
 * Names a design system gives its body ink, in preference order — the same vocabulary
 * `projectSectionsToBrandTokens` reads for the `text` colour role, so "the section's default
 * ink" means the same colour on both sides rather than "whichever token was listed first".
 */
const DEFAULT_INK_NAMES = /^(fg-1|text|ink|foreground|body|navy)$/;

const tokensIn = (
  snapshot: DesignSystemSnapshot,
  section: DesignSection,
  kind: DesignToken['kind'],
): DesignToken[] =>
  snapshot.tokens.filter((token) => token.kind === kind && sectionForToken(token) === section);

/**
 * The headline colour, from the brand's own tokens.
 *
 * THROWS rather than falling back. A design-system reference that silently resolves to black
 * produces a piece that looks finished and is off-brand, which is the failure nobody catches
 * until it is published; an error names the token and the section so it can be fixed.
 */
export function resolveInk(
  snapshot: DesignSystemSnapshot,
  section: DesignSection,
  tokenName: string,
): Rgb {
  const colours = tokensIn(snapshot, section, 'color');
  const wanted = bareName(tokenName);
  const named = wanted ? colours.filter((token) => bareName(token.name) === wanted) : [];
  const defaults = colours.filter((token) => DEFAULT_INK_NAMES.test(bareName(token.name)));
  const pool = wanted ? named : [...defaults, ...colours];

  for (const token of pool) {
    const rgb = parseHexColour(token.resolvedValue ?? token.value);
    if (rgb) return rgb;
  }
  throw new Error(
    wanted
      ? `The "${section}" section has no colour token named "${tokenName}" that resolves to a literal colour — set the type in the brand's real ink or fix the token, do not ship a guessed one.`
      : `The "${section}" section carries no resolvable colour token, so there is no brand ink to set this type in.`,
  );
}

// ── Faces ────────────────────────────────────────────────────────────────────────────────

/**
 * The two faces the headline flows in, as one CSS font stack plus two numeric weights.
 *
 * ONE STRING, USED TWICE — the canvas `ctx.font` that measures and the SVG `font-family` that
 * draws are built from the same {@link HeadlineFaces}, because a measure and a draw that
 * resolve different families produce a plan whose line breaks do not match the glyphs.
 *
 * CEILING: an SVG rendered as an image cannot load a remote webfont, so a brand family that is
 * not installed locally resolves to the fallback in BOTH paths — consistent, and not yet the
 * brand's face. Embedding the binary as an `@font-face` data URI (the shape
 * `designSystemFontEmbedSchema` already describes) is the upgrade, and it needs a byte source.
 */
export interface HeadlineFaces {
  readonly stack: string;
  readonly lightWeight: number;
  readonly boldWeight: number;
}

const FALLBACK_STACK = "'Helvetica Neue', Helvetica, Arial, sans-serif";

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

export function resolveFaces(
  snapshot: DesignSystemSnapshot,
  section: DesignSection,
): HeadlineFaces {
  const fontTokens = tokensIn(snapshot, section, 'font');
  const declared = fontTokens
    .map((token) => quoteFamily((token.resolvedValue ?? token.value).split(',')[0] ?? ''))
    .find((family): family is string => family !== null);
  const family = declared ?? quoteFamily(snapshot.fonts[0]?.family ?? '');
  const scale = snapshot.tokens.filter((token) => sectionForToken(token) === section);
  return {
    stack: family ? `${family}, ${FALLBACK_STACK}` : FALLBACK_STACK,
    lightWeight: weightFrom(scale, /light|thin/) ?? 300,
    boldWeight: weightFrom(scale, /bold|black|heavy/) ?? 700,
  };
}

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

const pastelOf = (ink: Rgb): string =>
  rgbToHex([
    Math.round(ink[0] + (255 - ink[0]) * HARMONISE_PASTEL_MIX),
    Math.round(ink[1] + (255 - ink[1]) * HARMONISE_PASTEL_MIX),
    Math.round(ink[2] + (255 - ink[2]) * HARMONISE_PASTEL_MIX),
  ]);

type Ctx2d = OffscreenCanvasRenderingContext2D;

/**
 * Composite one treatment stack onto a frame that already holds the photo.
 *
 * THE STACK IS CUMULATIVE and it is applied from the pristine photo every time, in order —
 * which is what makes veiling correct: white at `m1` then at `m2` leaves `m1 + m2 − m1·m2`,
 * not `max(m1, m2)`. Deriving each rung from the original with only that rung's own step gives
 * numbers that are wrong in the flattering direction.
 *
 * `harmonise` lifts the shadows toward a pastel of the brand ink with a `lighten` composite, so
 * a pixel already brighter than the pastel is untouched and only the shadows move.
 *
 * CEILING: the veil is a flat wash over the whole frame, not the brand's gradient. It is what
 * the probe measures and therefore what the plan is true about; a gradient pinned to the
 * anchored edge is the upgrade, and it changes the measurement, so it lands with a re-bench.
 */
export function applyTreatment(
  ctx: Ctx2d,
  steps: readonly TreatmentStep[],
  frame: Size,
  ink: Rgb,
): void {
  for (const step of steps) {
    ctx.save();
    if (step.kind === 'harmonise') {
      ctx.globalCompositeOperation = 'lighten';
      ctx.globalAlpha = HARMONISE_STRENGTH;
      ctx.fillStyle = pastelOf(ink);
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = step.floor;
      ctx.fillStyle = '#ffffff';
    }
    ctx.fillRect(0, 0, frame.width, frame.height);
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
    applyTreatment(ctx, state.treatments, frame, ink);
    return boxContrast(readBox(ctx, frame, box), ink);
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
export function headlineSvg(plan: PlacementPlan, faces: HeadlineFaces, ink: Rgb): string {
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
    `<g font-family="${escapeXml(faces.stack)}" fill="${rgbToHex(ink)}" font-kerning="none" ` +
    `style="font-variant-ligatures:none">${lines}</g></svg>`
  );
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
  applyTreatment(ctx, plan.treatment.steps, frame, args.ink);
  const svg = headlineSvg(plan, args.faces, args.ink);
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
 * The `SYNC_OPS` adapter: resolve the brand's tokens, render, hand back the finished frame.
 *
 * The design system is required, not optional. Without it there is no ink and no faces, and the
 * only thing this op could do is invent them — which is the one thing it must never do.
 *
 * Returns the CANVAS, not a `NodeOutput`: `imageOutput` in runAction.ts is the one place a
 * finished canvas becomes an output, and every other image op goes through it.
 */
export async function setImageText(args: {
  designSystem: DesignSystemSnapshot | null | undefined;
  config: Record<string, unknown>;
  image: DrawableImage;
  headline: string;
}): Promise<OffscreenCanvas> {
  if (!args.designSystem) {
    throw new Error(
      'Setting type needs the brand\'s design system — pick a brand with one before running "Set Type".',
    );
  }
  if (!args.headline.trim()) {
    throw new Error('Nothing is connected to this action\'s "text-in" input');
  }

  const settings = readSettings(args.config);
  const ink = resolveInk(args.designSystem, INK_SECTION, settings.inkToken);
  const faces = resolveFaces(args.designSystem, TYPE_SECTION);
  const rendered = await renderHeadline({
    image: args.image,
    headline: args.headline,
    ink,
    faces,
    settings,
  });
  return rendered.canvas;
}
