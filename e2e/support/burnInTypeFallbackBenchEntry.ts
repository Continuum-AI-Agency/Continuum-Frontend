// The browser half of `burnin:type:bench`.
//
// The claim under test is that Burn In Text RESOLVES its typeface rather than refusing when the
// design system is not the place the brand keeps type — and that whichever rung it lands on, it
// says which one. Both halves matter and only one of them is visible in a type checker:
//
//   • RENDERS. Every rung is driven through the real dispatcher (`runAction` ->
//     `parseActionConfig` -> `setImageText`) against a real photo in real Chrome, and graded on
//     the INK PIXELS of the decoded PNG. A chain that compiles and burns nothing is not a chain.
//   • IS LABELLED. The source is read back off the same `resolveHeadlineFaces` the panel and the
//     node badge call. The bench's own negative control re-grades every case against a stubbed
//     resolver that always claims `design-system`, so a label that stopped being load-bearing
//     shows up as a control that no longer fails.
//
// The last rung gets one extra proof, because it is the one that can lie quietly: naming
// Montserrat in a font stack costs nothing and renders Helvetica on a machine without the face.
// So the fallback case asserts the rendered SVG carries an inlined `@font-face` AND that its ink
// box differs from the same headline drawn through the bare fallback stack. Two faces, two sets
// of metrics; if the embed silently did nothing, both renders are Helvetica and the boxes match.

import {
  type BrandTypeInputs,
  type BrandTypeSource,
  FALLBACK_INK_DARK,
  FALLBACK_INK_LIGHT,
  type DesignSystemSnapshot,
  EMPTY_ADHERENCE,
  type PixelBuffer,
  PRELOADED_TYPE_FACES,
  type Rgb,
  type Size,
  VERNE_TITLE_MEASURE,
  VERNE_TITLE_MIN_CONTRAST,
  VERNE_TITLE_RIGHT_MARGIN,
} from '@continuum/contracts';
import { captionFontFaceCss, ensureCaptionFonts } from '../../src/lib/clips/captionFonts';
import { canvasToDataUrl } from '../../src/StudioCanvas/utils/actions/imageOps';
import {
  describeHeadlineFaces,
  describeHeadlineInk,
  deriveHeadlineInk,
  renderHeadline,
  resolveHeadlineFaces,
  resolveHeadlineInk,
} from '../../src/StudioCanvas/utils/actions/imageText';
import { runAction } from '../../src/StudioCanvas/utils/actions/runAction';

const INK_HEX = '#0f1f43';
const INK: Rgb = [0x0f, 0x1f, 0x43];
const HEADLINE = 'Estudia una carrera internacional **con University of London**';
const FRAME: Size = { width: 1080, height: 1350 };

/** Same tolerance the placement bench uses: only pixels that are unambiguously glyph. */
const INK_MATCH_DISTANCE = 30;

/** One family across the four BRAND rungs, so the only thing that differs is the SOURCE. */
const BRAND_FAMILY = 'Georgia';

const colourToken = (name: string, value: string) => ({
  name,
  value,
  kind: 'color' as const,
  resolvedValue: value,
  definedIn: null,
  description: null,
});

const designSystem = (withType: boolean): DesignSystemSnapshot => ({
  schemaVersion: 1,
  brandName: 'Bench Brand',
  sourceKind: 'ds_export',
  rigor: {
    tier: 'strict',
    evidence: {
      tokenCount: 2,
      imperativeRuleCount: 0,
      hasAdherenceConfig: false,
      declaredSectionCount: 1,
      exemplarCount: 0,
    },
    override: null,
  },
  tokens: [colourToken('--ink', INK_HEX), colourToken('--bg-1', '#f6f2ea')],
  fonts: withType ? [{ family: BRAND_FAMILY, tokens: [], source: null }] : [],
  adherence: EMPTY_ADHERENCE,
  sections: [],
  conflicts: [],
});

/**
 * The five rungs, each brand shaped so exactly ONE of them can answer.
 *
 * A brand that carries type in two places would still resolve, and would prove nothing about
 * precedence or about the rung under test — so every case here is deliberately impoverished
 * down to the single source it is named after.
 */
const CASES: ReadonlyArray<{
  label: string;
  expect: BrandTypeSource;
  expectFamily: string;
  brand: BrandTypeInputs;
}> = [
  {
    label: 'design system only',
    expect: 'design-system',
    expectFamily: BRAND_FAMILY,
    brand: { designSystem: designSystem(true) },
  },
  {
    label: 'brand.md tokens only — no design system at all',
    expect: 'brand-md',
    expectFamily: BRAND_FAMILY,
    brand: {
      brandMd: {
        colors: [{ value: INK_HEX, role: 'text' }],
        typography: [{ family: BRAND_FAMILY, role: 'display' }],
      },
    },
  },
  {
    label: 'brand kit only',
    expect: 'brand-kit',
    expectFamily: BRAND_FAMILY,
    brand: { brandKit: { colors: [INK_HEX], typography: { primary: BRAND_FAMILY } } },
  },
  {
    label: 'website scrape only',
    expect: 'scrape',
    expectFamily: BRAND_FAMILY,
    brand: { scrape: { palette: { text: INK_HEX }, typography: { primary: BRAND_FAMILY } } },
  },
  {
    // Colour but NO face anywhere: the rung the whole change exists for.
    label: 'no type anywhere — colour only',
    expect: 'fallback',
    expectFamily: PRELOADED_TYPE_FACES.display,
    brand: { brandKit: { colors: [INK_HEX] } },
  },
];

/** A deterministic photo. `floor`/`ceiling` set the luma range, so a night scene is one call. */
function photo(frame: Size, seed: number, floor = 168, ceiling = 244): OffscreenCanvas {
  const canvas = new OffscreenCanvas(frame.width, frame.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for the bench photo');
  const image = ctx.createImageData(frame.width, frame.height);
  let state = seed >>> 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const dither = ((state >>> 16) % 23) - 11;
      const ramp = (x / frame.width) * 0.55 + (y / frame.height) * 0.45;
      const level = floor + (ceiling - floor) * ramp;
      const i = (y * frame.width + x) * 4;
      image.data[i] = Math.max(0, Math.min(255, Math.round(level + dither)));
      image.data[i + 1] = Math.max(0, Math.min(255, Math.round(level * 0.9 + dither)));
      image.data[i + 2] = Math.max(0, Math.min(255, Math.round(level * 0.78 + dither)));
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

async function decode(dataUrl: string): Promise<PixelBuffer> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context to decode the rendered frame');
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, data: image.data, channels: 4 };
}

const l1 = (a: Rgb, b: Rgb): number =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

export interface InkBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  pixels: number;
}

function inkBox(frame: PixelBuffer, ink: Rgb): InkBox {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  let pixels = 0;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const i = (y * frame.width + x) * frame.channels;
      if (l1([frame.data[i], frame.data[i + 1], frame.data[i + 2]], ink) >= INK_MATCH_DISTANCE) {
        continue;
      }
      pixels += 1;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (pixels === 0) return { x0: 0, y0: 0, x1: 0, y1: 0, pixels: 0 };
  return {
    x0: x0 / frame.width,
    y0: y0 / frame.height,
    x1: (x1 + 1) / frame.width,
    y1: (y1 + 1) / frame.height,
    pixels,
  };
}

const CONFIG = {
  anchor: 'top-right' as const,
  offsetX: 0,
  offsetY: 0,
  marginFrac: VERNE_TITLE_RIGHT_MARGIN,
  inkToken: '',
  measure: VERNE_TITLE_MEASURE,
  minContrast: VERNE_TITLE_MIN_CONTRAST,
  escalate: true,
};

export interface RungCase {
  label: string;
  /** What the chain SHOULD have said. */
  expectedSource: BrandTypeSource;
  expectedFamily: string;
  /** What it actually said, read back through the resolver the UI calls. */
  source: BrandTypeSource;
  family: string;
  /** The sentence the node badge and the config panel show for this brand. */
  note: string;
  /** Where the ink came from — a separate chain with no fallback rung. */
  inkSource: string | null;
  ink: InkBox;
  bytes: number;
}

/** Drive one rung through the REAL dispatcher and grade the decoded pixels. */
async function runRung(entry: (typeof CASES)[number], photoUrl: string): Promise<RungCase> {
  const faces = resolveHeadlineFaces(entry.brand);
  const output = await runAction({
    actionId: 'image.text',
    inputs: [
      { handle: 'in', imageUrl: photoUrl },
      { handle: 'text-in', text: HEADLINE },
    ],
    config: CONFIG,
    brand: entry.brand,
  });
  if (output.type !== 'image') throw new Error(`${entry.label}: the op returned ${output.type}`);
  const dataUrl = `data:${output.mimeType};base64,${output.base64}`;
  const pixels = await decode(dataUrl);
  return {
    label: entry.label,
    expectedSource: entry.expect,
    expectedFamily: entry.expectFamily,
    source: faces.source,
    family: faces.family,
    note: describeHeadlineFaces(faces),
    inkSource: resolveHeadlineInk(entry.brand, '')?.source ?? null,
    ink: inkBox(pixels, INK),
    bytes: output.base64.length,
  };
}

export interface FallbackFaceProof {
  /** The rendered SVG carries the inlined face, not merely a family string in a stack. */
  embedsFontFace: boolean;
  embeddedFamily: string;
  /** Bytes of base64 font data actually inlined; 0 means the embed did nothing. */
  embeddedBytes: number;
  /** The real render: preloaded family in the stack AND its bytes in the document. */
  withPreloadedFace: InkBox;
  /** The same headline through the bare fallback stack — neither measured nor drawn in it. */
  withoutPreloadedFace: InkBox;
  /** Same STACK, bytes withheld: isolates the draw from the measure. Reported, see below. */
  measuredNotDrawn: InkBox;
  lineCountWithFace: number;
  lineCountWithoutFace: number;
}

/**
 * The proof that `fallback` is a face and not a label.
 *
 * Both renders go through `renderHeadline`, so both walk the same planner over the same photo;
 * the ONLY difference is whether the preloaded family is in the stack and its bytes are in the
 * SVG. Identical ink boxes would mean the embed never took effect and both drew Helvetica.
 */
async function proveFallbackFace(source: OffscreenCanvas): Promise<FallbackFaceProof> {
  const image = (await createImageBitmap(
    await source.convertToBlob(),
  )) as unknown as CanvasImageSource & { width: number; height: number };

  const faces = resolveHeadlineFaces({});
  await ensureCaptionFonts([faces.family]);
  const fontFaceCss = await captionFontFaceCss(faces.family);
  const withFace = await renderHeadline({
    image,
    headline: HEADLINE,
    ink: INK,
    faces,
    settings: CONFIG,
    fontFaceCss,
  });

  // What the op produced before any of this existed: the family gone from the stack and no
  // `@font-face` in the document, so neither the measure nor the draw can reach it. This is the
  // asserted comparison, and it is machine-independent — a Helvetica stack is Helvetica anywhere.
  const withoutFace = await renderHeadline({
    image,
    headline: HEADLINE,
    ink: INK,
    faces: { ...faces, stack: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
    settings: CONFIG,
    fontFaceCss: null,
  });

  // Same stack, bytes withheld: the plan is identical and only the GLYPHS can differ, which
  // isolates the draw. Reported rather than asserted, because it is the one comparison this
  // bench cannot make machine-independent — a developer with Montserrat installed system-wide
  // gets the real face in the SVG anyway, and the two renders legitimately match.
  const measuredNotDrawn = await renderHeadline({
    image,
    headline: HEADLINE,
    ink: INK,
    faces,
    settings: CONFIG,
    fontFaceCss: null,
  });

  const base64 = /base64,([A-Za-z0-9+/=]+)\)/.exec(fontFaceCss ?? '')?.[1] ?? '';
  // The CSS is XML-escaped into the <style> node, so the quotes around the family arrive as
  // &apos; — the family name and the base64 run themselves pass through verbatim.
  return {
    embedsFontFace:
      withFace.svg.includes('@font-face') &&
      withFace.svg.includes(faces.family) &&
      /base64,[A-Za-z0-9+/=]{10000,}/.test(withFace.svg),
    embeddedFamily: faces.family,
    embeddedBytes: base64.length,
    withPreloadedFace: inkBox(await decode(await canvasToDataUrl(withFace.canvas)), INK),
    withoutPreloadedFace: inkBox(await decode(await canvasToDataUrl(withoutFace.canvas)), INK),
    measuredNotDrawn: inkBox(await decode(await canvasToDataUrl(measuredNotDrawn.canvas)), INK),
    lineCountWithFace: withFace.plan.lines.length,
    lineCountWithoutFace: withoutFace.plan.lines.length,
  };
}

export interface InkRefusal {
  threw: boolean;
  message: string;
}

/** One brand with NO colour at all, rendered over one photo, with the fallback ink allowed. */
export interface DerivedInkCase {
  label: string;
  /** The luma range the photo was generated over — the thing the choice must respond to. */
  photo: { floor: number; ceiling: number };
  /** Which candidate the MEASUREMENT picked. */
  name: 'black' | 'white';
  rgb: [number, number, number];
  ratio: number;
  /** The sentence a user reads for this render. */
  note: string;
  /** Ink pixels of the CHOSEN colour in the decoded PNG — proof it drew, in that colour. */
  ink: InkBox;
}

/**
 * A brand with a face and NO colour, over a bright photo and a dark one.
 *
 * The two cases share everything except the photo's luma range, so the ink flipping between
 * them is the assertion that the fallback is a MEASUREMENT. A hard-coded black passes the
 * bright case and fails the dark one; anything that reads the same value twice is not reading
 * the photo at all.
 */
async function runDerivedInk(
  label: string,
  seed: number,
  floor: number,
  ceiling: number,
): Promise<DerivedInkCase> {
  const brand: BrandTypeInputs = { brandKit: { typography: { primary: BRAND_FAMILY } } };
  const source = photo(FRAME, seed, floor, ceiling);
  const photoUrl = await canvasToDataUrl(source);
  const faces = resolveHeadlineFaces(brand);

  // The op's OWN derivation, on the same image, so the colour asserted below is the colour the
  // dispatcher will have drawn rather than a second guess about it.
  const image = (await createImageBitmap(
    await source.convertToBlob(),
  )) as unknown as CanvasImageSource & { width: number; height: number };
  const derived = deriveHeadlineInk(image, HEADLINE, faces, {
    ...CONFIG,
    fallbackType: true,
    fallbackInk: true,
  });

  const output = await runAction({
    actionId: 'image.text',
    inputs: [
      { handle: 'in', imageUrl: photoUrl },
      { handle: 'text-in', text: HEADLINE },
    ],
    config: CONFIG,
    brand,
  });
  if (output.type !== 'image') throw new Error(`${label}: the op returned ${output.type}`);
  const pixels = await decode(`data:${output.mimeType};base64,${output.base64}`);

  return {
    label,
    photo: { floor, ceiling },
    name: derived.fallbackName ?? 'black',
    rgb: [...derived.rgb] as [number, number, number],
    ratio: derived.fallbackRatio ?? 0,
    note: describeHeadlineInk(derived),
    // Counted against the colour the measurement CHOSE — if the op drew the other one, or drew
    // the brand ink it does not have, this box comes back empty.
    ink: inkBox(pixels, derived.rgb),
  };
}

/** The same colourless brand with the ink fallback switched OFF. */
async function inkFallbackOffRefusal(photoUrl: string): Promise<InkRefusal> {
  try {
    await runAction({
      actionId: 'image.text',
      inputs: [
        { handle: 'in', imageUrl: photoUrl },
        { handle: 'text-in', text: HEADLINE },
      ],
      config: { ...CONFIG, fallbackInk: false },
      brand: { brandKit: { typography: { primary: BRAND_FAMILY } } },
    });
    return { threw: false, message: '' };
  } catch (error) {
    return { threw: true, message: error instanceof Error ? error.message : String(error) };
  }
}

/** A brand with a colour and NO face, with the type fallback switched OFF. */
async function typeFallbackOffRefusal(photoUrl: string): Promise<InkRefusal> {
  try {
    await runAction({
      actionId: 'image.text',
      inputs: [
        { handle: 'in', imageUrl: photoUrl },
        { handle: 'text-in', text: HEADLINE },
      ],
      config: { ...CONFIG, fallbackType: false },
      brand: { brandKit: { colors: [INK_HEX] } },
    });
    return { threw: false, message: '' };
  } catch (error) {
    return { threw: true, message: error instanceof Error ? error.message : String(error) };
  }
}

export interface BurnInTypeBenchRun {
  ink: [number, number, number];
  preloaded: { display: string; body: string };
  rungs: RungCase[];
  fallbackFace: FallbackFaceProof;
  /**
   * The NEGATIVE CONTROL: the same five cases re-graded against a resolver that always claims
   * `design-system`. The runner asserts this DISAGREES with the real labels — a source check
   * that a constant could satisfy is not evidence of anything.
   */
  stubbedSources: BrandTypeSource[];
  /** Whether the brand with type but NO design system produced an image at all. */
  brandMdWithoutDesignSystemRan: boolean;
  /** The measured ink rung, over two photos that should not agree. */
  derivedInk: { onLight: DerivedInkCase; onDark: DerivedInkCase };
  /** The two opt-outs, each proved to restore a refusal. */
  inkFallbackOff: InkRefusal;
  typeFallbackOff: InkRefusal;
  /** The candidates the measurement chooses between, so the runner can name them. */
  candidates: { dark: [number, number, number]; light: [number, number, number] };
}

async function run(): Promise<BurnInTypeBenchRun> {
  const source = photo(FRAME, 0xb0a71);
  const photoUrl = await canvasToDataUrl(source);

  const rungs: RungCase[] = [];
  for (const entry of CASES) rungs.push(await runRung(entry, photoUrl));

  return {
    ink: [...INK] as [number, number, number],
    preloaded: { ...PRELOADED_TYPE_FACES },
    rungs,
    fallbackFace: await proveFallbackFace(source),
    derivedInk: {
      onLight: await runDerivedInk('bright photo, no brand colour', 0xd1, 168, 244),
      onDark: await runDerivedInk('night photo, no brand colour', 0xd2, 8, 54),
    },
    inkFallbackOff: await inkFallbackOffRefusal(photoUrl),
    typeFallbackOff: await typeFallbackOffRefusal(photoUrl),
    candidates: {
      dark: [...FALLBACK_INK_DARK] as [number, number, number],
      light: [...FALLBACK_INK_LIGHT] as [number, number, number],
    },
    stubbedSources: CASES.map(() => 'design-system' as BrandTypeSource),
    brandMdWithoutDesignSystemRan:
      (rungs.find((rung) => rung.expectedSource === 'brand-md')?.ink.pixels ?? 0) > 0,
  };
}

declare global {
  interface Window {
    __burnInTypeBench: { run: () => Promise<BurnInTypeBenchRun> };
  }
}

window.__burnInTypeBench = { run };
