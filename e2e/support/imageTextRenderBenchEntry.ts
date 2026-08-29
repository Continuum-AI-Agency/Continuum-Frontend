// The browser half of `text:render:bench`.
//
// Everything here runs in real Chrome, because the claim being benched is a PIXEL claim: that
// the type the op drew is legible against the background the op left behind it, and that the
// ink is byte-identical to the brand's token. Neither is answerable from a plan — a plan is
// what the op INTENDED. This bundle drives the real `runAction` dispatcher, decodes what came
// back, and re-measures it with the same `darkPercentileContrast` the op planned against.

import {
  type BrandTypeInputs,
  type BrandTypeSource,
  type DesignSystemSnapshot,
  darkPercentileContrast,
  EMPTY_ADHERENCE,
  FULL_FRAME,
  type PixelBuffer,
  type Rgb,
  VERNE_INK_DISTANCE,
  VERNE_TITLE_ANCHOR_OFFSET_Y,
  VERNE_TITLE_MIN_CONTRAST,
  VERNE_TITLE_RIGHT_MARGIN,
} from '@continuum/contracts';
import {
  blockRect,
  headlineBlockExtent,
} from '../../src/StudioCanvas/utils/actions/burnInPlacement';
import { canvasToDataUrl } from '../../src/StudioCanvas/utils/actions/imageOps';
import {
  createMeasurer,
  embedFace,
  parseHeadline,
  renderHeadline,
  resolveHeadlineFaces,
  resolveHeadlineInk,
  scrimReachPx,
} from '../../src/StudioCanvas/utils/actions/imageText';
import { runAction } from '../../src/StudioCanvas/utils/actions/runAction';

const WIDTH = 1080;
const HEIGHT = 1350;
const INK_HEX = '#0f1f43';
const INK: Rgb = [0x0f, 0x1f, 0x43];
const MEASURE = 0.61;
const HEADLINE = 'Estudia una carrera internacional **con University of London**';

/**
 * The photo, generated rather than checked in: a two-axis linear gradient plus a DETERMINISTIC
 * dither from a 32-bit LCG seeded per run-case. No `Math.random` — a bench whose input changes
 * between runs cannot ratchet. The dither matters: a pure gradient has a degenerate luma
 * histogram, and the 20th percentile of a degenerate histogram is not a real measurement.
 */
function gradientPhoto(seed: number, floor: number, ceiling: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context for the bench photo');
  const image = ctx.createImageData(WIDTH, HEIGHT);
  let state = seed >>> 0;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const dither = ((state >>> 16) % 23) - 11;
      const ramp = (x / WIDTH) * 0.55 + (y / HEIGHT) * 0.45;
      const level = floor + (ceiling - floor) * ramp;
      const i = (y * WIDTH + x) * 4;
      image.data[i] = Math.max(0, Math.min(255, Math.round(level + dither)));
      image.data[i + 1] = Math.max(0, Math.min(255, Math.round(level * 0.96 + dither)));
      image.data[i + 2] = Math.max(0, Math.min(255, Math.round(level * 0.9 + dither)));
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

const colourToken = (name: string, value: string) => ({
  name,
  value,
  kind: 'color' as const,
  resolvedValue: value,
  definedIn: null,
  description: null,
});

const BRAND: DesignSystemSnapshot = {
  schemaVersion: 1,
  brandName: 'Bench Brand',
  sourceKind: 'ds_export',
  rigor: {
    tier: 'strict',
    evidence: {
      tokenCount: 3,
      imperativeRuleCount: 0,
      hasAdherenceConfig: false,
      declaredSectionCount: 1,
      exemplarCount: 0,
    },
    override: null,
  },
  tokens: [
    colourToken('--accent', '#de8218'),
    colourToken('--ink', INK_HEX),
    colourToken('--bg-1', '#f6f2ea'),
  ],
  fonts: [{ family: 'Georgia', tokens: [], source: null }],
  adherence: EMPTY_ADHERENCE,
  sections: [],
  conflicts: [],
};

/**
 * The same brand values reached through two different rungs of the type chain.
 *
 * Georgia and `#0f1f43` on both, deliberately: the legibility measurements below are then
 * comparable across rungs, and anything that differs between the two cases is the RESOLUTION
 * rather than the typeface. The brand.md colour carries `name: 'ink'` so one CONFIG — including
 * its named `inkToken` — drives both, which also proves a named ink token is not a
 * design-system-only affordance.
 */
const FROM_DESIGN_SYSTEM: BrandTypeInputs = { designSystem: BRAND };
const FROM_BRAND_MD: BrandTypeInputs = {
  brandMd: {
    colors: [{ value: INK_HEX, role: 'text', name: 'ink' }],
    typography: [{ family: 'Georgia', role: 'display' }],
  },
};

const CONFIG = {
  anchor: 'top-right' as const,
  offsetX: 0,
  offsetY: VERNE_TITLE_ANCHOR_OFFSET_Y,
  marginFrac: VERNE_TITLE_RIGHT_MARGIN,
  inkToken: 'ink',
  measure: MEASURE,
  minContrast: VERNE_TITLE_MIN_CONTRAST,
  escalate: true,
};

/**
 * The box the type was actually set in, for this run's config.
 *
 * `titleBox({measureFraction})` used to answer this, and it stopped being able to: placement is
 * now an anchor plus a nudge, so the box is wherever the block was PUT. Derived from the same
 * two functions the op derives it from, which is what keeps this measurement pointed at the
 * type rather than at a band the type may no longer be in.
 */
function headlineBox(brand: BrandTypeInputs) {
  const frame = { width: WIDTH, height: HEIGHT };
  const extent = headlineBlockExtent({
    tokens: parseHeadline(HEADLINE),
    frame,
    measureText: createMeasurer(resolveHeadlineFaces(brand), 0),
    measureFraction: MEASURE,
  });
  return blockRect(
    {
      anchor: CONFIG.anchor,
      offsetX: CONFIG.offsetX,
      offsetY: CONFIG.offsetY,
      marginFrac: CONFIG.marginFrac,
    },
    extent,
  );
}

async function decode(dataUrl: string): Promise<{ pixels: PixelBuffer; bytes: number }> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context to decode the rendered frame');
  ctx.drawImage(bitmap, 0, 0);
  const image = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return {
    pixels: { width: bitmap.width, height: bitmap.height, data: image.data, channels: 4 },
    bytes: blob.size,
  };
}

const l1 = (px: Rgb, colour: Rgb): number =>
  Math.abs(px[0] - colour[0]) + Math.abs(px[1] - colour[1]) + Math.abs(px[2] - colour[2]);

interface BoxMeasurement {
  /** WCAG ratio of the ink against the darkest fifth of the box, with the GLYPHS removed. */
  backgroundRatio: number;
  /** The same measurement with nothing removed — the type is in it, so it is not the claim. */
  rawRatio: number;
  /** Pixels inside the box within {@link VERNE_INK_DISTANCE} of the token colour. */
  inkishPixels: number;
  /** The most common colour among those, and how many pixels wear it. */
  modalInk: [number, number, number];
  modalInkPixels: number;
  boxPixels: number;
}

/**
 * Re-measure the RENDERED frame inside the box the plan set type in.
 *
 * The glyphs are excluded before the percentile is taken, and they have to be: the type is the
 * darkest thing in the box by construction, so a dark-percentile taken over the drawn frame
 * measures the headline against ITSELF and returns ~1.0 for a perfectly legible piece. What is
 * actually being asked is "what is BEHIND the type, after the treatment the plan chose" — so
 * every pixel wearing the ink is dropped and the remainder is measured. `rawRatio` is carried
 * alongside so the exclusion is visible rather than quietly assumed.
 */
function measureBox(frame: PixelBuffer, box: typeof FULL_FRAME, ink: Rgb): BoxMeasurement {
  const x0 = Math.trunc(box.x0 * frame.width);
  const y0 = Math.trunc(box.y0 * frame.height);
  const x1 = Math.trunc(box.x1 * frame.width);
  const y1 = Math.trunc(box.y1 * frame.height);
  const background: number[] = [];
  const all: number[] = [];
  const histogram = new Map<number, number>();
  let inkish = 0;

  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * frame.width + x) * frame.channels;
      const px: Rgb = [frame.data[i], frame.data[i + 1], frame.data[i + 2]];
      all.push(px[0], px[1], px[2]);
      if (l1(px, ink) < VERNE_INK_DISTANCE) {
        inkish += 1;
        const key = (px[0] << 16) | (px[1] << 8) | px[2];
        histogram.set(key, (histogram.get(key) ?? 0) + 1);
      } else {
        background.push(px[0], px[1], px[2]);
      }
    }
  }

  let modalKey = -1;
  let modalCount = 0;
  for (const [key, count] of histogram) {
    if (count > modalCount) {
      modalKey = key;
      modalCount = count;
    }
  }

  const asBuffer = (values: number[]): PixelBuffer => ({
    width: Math.max(1, values.length / 3),
    height: 1,
    data: new Uint8ClampedArray(values),
    channels: 3,
  });

  return {
    backgroundRatio: darkPercentileContrast(asBuffer(background), FULL_FRAME, ink).ratio,
    rawRatio: darkPercentileContrast(asBuffer(all), FULL_FRAME, ink).ratio,
    inkishPixels: inkish,
    modalInk: [(modalKey >> 16) & 0xff, (modalKey >> 8) & 0xff, modalKey & 0xff],
    modalInkPixels: modalCount,
    boxPixels: all.length / 3,
  };
}

/**
 * What the treatment actually TOUCHED — source photo against rendered frame, split by the box.
 *
 * The bug this measures is invisible to every other assertion in this bench: a treatment that
 * washes the WHOLE photo still clears the contrast bar behind the type, still draws the token
 * ink, still breaks the right number of lines. Only a before/after over pixels nowhere near the
 * headline can see it. `outside` skips the band the scrim's feather is allowed to reach — from
 * `scrimReachPx`, the renderer's OWN number, so the fence cannot drift from the thing it fences
 * — and everything past it must be byte-identical. `inside` skips the glyphs, so it measures the
 * BACKGROUND moving rather than the type arriving: that is what stops this passing by doing
 * nothing.
 */
export interface TreatmentFootprint {
  /** Mean per-channel |Δ| over the frame OUTSIDE the box and its margin. Should be ~0. */
  outsideMeanDelta: number;
  /** The single worst per-channel |Δ| out there. One washed pixel is still a wash. */
  outsideMaxDelta: number;
  outsidePixels: number;
  /** Mean per-channel |Δ| INSIDE the box, over pixels the glyphs do not cover. */
  insideMeanDelta: number;
  insidePixels: number;
  /** How far past the box the scrim was allowed to reach, in px — the excluded band. */
  reachPx: number;
}

function treatmentFootprint(
  before: PixelBuffer,
  after: PixelBuffer,
  box: typeof FULL_FRAME,
  ink: Rgb,
): TreatmentFootprint {
  const x0 = Math.trunc(box.x0 * after.width);
  const y0 = Math.trunc(box.y0 * after.height);
  const x1 = Math.trunc(box.x1 * after.width);
  const y1 = Math.trunc(box.y1 * after.height);
  // One px of slack past the scrim's own reach, for the rounding at the clip's edge.
  const margin = scrimReachPx({ width: after.width, height: after.height }, box) + 1;
  let outsideSum = 0;
  let outsideMax = 0;
  let outsideCount = 0;
  let insideSum = 0;
  let insideCount = 0;

  for (let y = 0; y < after.height; y += 1) {
    for (let x = 0; x < after.width; x += 1) {
      const i = (y * after.width + x) * after.channels;
      const j = (y * before.width + x) * before.channels;
      const dr = Math.abs(after.data[i] - before.data[j]);
      const dg = Math.abs(after.data[i + 1] - before.data[j + 1]);
      const db = Math.abs(after.data[i + 2] - before.data[j + 2]);
      const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
      if (inside) {
        const px: Rgb = [after.data[i], after.data[i + 1], after.data[i + 2]];
        if (l1(px, ink) >= VERNE_INK_DISTANCE) {
          insideSum += (dr + dg + db) / 3;
          insideCount += 1;
        }
        continue;
      }
      if (x >= x0 - margin && x < x1 + margin && y >= y0 - margin && y < y1 + margin) continue;
      outsideSum += (dr + dg + db) / 3;
      outsideMax = Math.max(outsideMax, dr, dg, db);
      outsideCount += 1;
    }
  }

  return {
    outsideMeanDelta: outsideCount === 0 ? 0 : outsideSum / outsideCount,
    outsideMaxDelta: outsideMax,
    outsidePixels: outsideCount,
    insideMeanDelta: insideCount === 0 ? 0 : insideSum / insideCount,
    insidePixels: insideCount,
    reachPx: margin - 1,
  };
}

export interface ImageTextCase {
  label: string;
  /** Which rung of the chain named the face — so "it rendered" is attributed, not assumed. */
  typeSource: BrandTypeSource;
  family: string;
  inkSource: string;
  /** True when the named ink token did not resolve and the brand default stood in for it. */
  substituted: boolean;
  /** Rung the ladder stopped on: 0 untouched, 1 harmonised, 2+ harmonised plus ONE veil. */
  rung: number;
  treatment: string;
  /** Every step the plan handed the renderer, in order — `harmonise` / `veil@0.42`. */
  steps: string[];
  /** The floor of each veil in the plan. Length must be 0 or 1; N is the stacking bug. */
  veilFloors: number[];
  /** The floor the ladder RESOLVED on, for a veiled treatment. */
  resolvedVeilFloor: number | null;
  footprint: TreatmentFootprint;
  plannedRatio: number;
  planCleared: boolean;
  planLines: number;
  svgTextElements: number;
  svgIsDataUri: boolean;
  svgMentionsBlob: boolean;
  mimeType: string;
  bytes: number;
  measurement: BoxMeasurement;
}

export interface ImageTextBenchRun {
  minContrast: number;
  ink: [number, number, number];
  fontStack: string;
  cases: ImageTextCase[];
  unresolvableTokenError: string | null;
  /** The same bad token with the fallback ON — a labelled substitution, not a measurement. */
  unresolvableTokenFallback: ImageTextCase;
  noBrandAtAllError: string | null;
  typeButNoInkError: string | null;
}

async function runCase(
  label: string,
  seed: number,
  floor: number,
  ceiling: number,
  brand: BrandTypeInputs = FROM_DESIGN_SYSTEM,
  overrides: Partial<typeof CONFIG> = {},
): Promise<ImageTextCase> {
  const config = { ...CONFIG, ...overrides };
  const photo = gradientPhoto(seed, floor, ceiling);
  const photoUrl = await canvasToDataUrl(photo);
  // The op decodes `photoUrl`, so the honest BEFORE is that round-trip, not the canvas that
  // produced it — a lossy encode would otherwise show up as a treatment that touched the frame.
  const source = await decode(photoUrl);
  const faces = resolveHeadlineFaces(brand);
  // The op's own three-step ink resolution, so a substituted token is graded as what it drew.
  const exact = resolveHeadlineInk(brand, config.inkToken);
  const ink = exact ?? resolveHeadlineInk(brand, '');
  if (!ink) throw new Error(`${label}: the bench brand yielded no ink`);

  // The REAL dispatcher: parseActionConfig → SYNC_OPS['image.text'] → loadImage → setImageText
  // → imageOutput. Nothing is stubbed on this path.
  const output = await runAction({
    actionId: 'image.text',
    inputs: [
      { handle: 'in', imageUrl: photoUrl },
      { handle: 'text-in', text: HEADLINE },
    ],
    config,
    brand,
  });
  if (output.type !== 'image') throw new Error(`${label}: the op returned ${output.type}`);
  const rendered = await decode(`data:${output.mimeType};base64,${output.base64}`);

  // The same inputs again, for the PLAN the dispatcher does not hand back. Deterministic, so
  // this is the plan the frame above was drawn from — the assertions below check that it is.
  // `embedFace` is the op's OWN call, not a copy of it: a family whose bytes we ship changes
  // both the metrics and the glyphs, so re-planning without it would grade a different frame.
  const { plan, svg } = await renderHeadline({
    image: (await createImageBitmap(
      await photo.convertToBlob(),
    )) as unknown as CanvasImageSource & {
      width: number;
      height: number;
    },
    headline: HEADLINE,
    ink: ink.rgb,
    faces,
    settings: config,
    fontFaceCss: await embedFace(faces.family),
  });

  const box = headlineBox(brand);
  return {
    label,
    typeSource: faces.source,
    family: faces.family,
    inkSource: ink.source,
    rung: plan.treatment.rung,
    treatment: plan.treatment.kind,
    steps: plan.treatment.steps.map((step) =>
      step.kind === 'veil' ? `veil@${step.floor}` : step.kind,
    ),
    veilFloors: plan.treatment.steps.flatMap((step) => (step.kind === 'veil' ? [step.floor] : [])),
    resolvedVeilFloor: plan.treatment.kind === 'veiled' ? plan.treatment.veilFloor : null,
    footprint: treatmentFootprint(source.pixels, rendered.pixels, box, ink.rgb),
    plannedRatio: plan.treatment.ratio,
    planCleared: plan.treatment.cleared,
    planLines: plan.lines.length,
    svgTextElements: svg.split('<text ').length - 1,
    svgIsDataUri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`.startsWith('data:'),
    svgMentionsBlob: svg.includes('blob:'),
    mimeType: output.mimeType ?? '',
    bytes: rendered.bytes,
    substituted: exact === null,
    measurement: measureBox(rendered.pixels, box, ink.rgb),
  };
}

async function refusal(
  mutate: (config: Record<string, unknown>) => Record<string, unknown>,
  brand: BrandTypeInputs | null,
) {
  const photoUrl = await canvasToDataUrl(gradientPhoto(7, 150, 230));
  try {
    await runAction({
      actionId: 'image.text',
      inputs: [
        { handle: 'in', imageUrl: photoUrl },
        { handle: 'text-in', text: HEADLINE },
      ],
      config: mutate({ ...CONFIG }),
      brand,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function run(): Promise<ImageTextBenchRun> {
  const ink = resolveHeadlineInk(FROM_DESIGN_SYSTEM, CONFIG.inkToken);
  if (!ink) throw new Error('the bench design system yielded no ink');
  return {
    minContrast: VERNE_TITLE_MIN_CONTRAST,
    ink: [...ink.rgb] as [number, number, number],
    fontStack: resolveHeadlineFaces(FROM_DESIGN_SYSTEM).stack,
    // APPEND-ONLY: the runner indexes [0], [1], [2] and [3].
    cases: [
      // Bright enough that the navy reads straight off the photo — the ladder must not fire.
      await runCase('bright photo, no treatment needed', 0x5eed1, 168, 244),
      // Dark enough that rung 0 fails and the ladder has to rescue the piece.
      await runCase('dark photo, ladder escalates', 0x5eed2, 26, 96),
      // The same bright photo through a brand with NO design system. Every legibility and ink
      // assertion in the per-case loop applies to it unchanged, which is the point: the rung the
      // op used to refuse over now has to clear the same contrast bar in the same measured box.
      await runCase('bright photo, brand.md only', 0x5eed1, 168, 244, FROM_BRAND_MD),
      // NEAR-BLACK against a bar it has to CLIMB for, which is the case the stacking bug needed:
      // at floor 0.15 a stacked veil and a single one paint nearly the same picture, so only a
      // photo forced several rungs up the ladder tells the two apart. Graded against the
      // standard 3.2 like every other case — a piece that clears 7 clears 3.2 by construction.
      await runCase('near-black photo, a bar it must climb for', 0x5eed3, 0, 24, FROM_DESIGN_SYSTEM, {
        minContrast: 7,
      }),
    ],
    // A token nothing carries, with the ink fallback OFF: still the loud failure it always was.
    unresolvableTokenError: await refusal(
      (c) => ({ ...c, inkToken: 'headline-ink', fallbackInk: false }),
      FROM_DESIGN_SYSTEM,
    ),
    // The same token with the fallback ON. It must NOT reach the measured black — the brand has
    // a real ink and the substitution stops there, labelled.
    unresolvableTokenFallback: await runCase(
      'bright photo, ink token that does not exist',
      0x5eed1,
      168,
      244,
      FROM_DESIGN_SYSTEM,
      { inkToken: 'headline-ink' },
    ),
    // No brand reachable at all. Still a refusal — the ink chain has no fallback rung — but the
    // message may no longer blame the design system, because a design system is now one of four
    // places an ink can come from rather than the only one.
    noBrandAtAllError: await refusal((c) => ({ ...c, fallbackInk: false }), null),
    // A brand with a FACE and no colour: the exact split this change introduced. Type resolves,
    // ink does not, and the refusal has to say which of the two is missing.
    typeButNoInkError: await refusal((c) => ({ ...c, fallbackInk: false }), {
      brandKit: { typography: { primary: 'Georgia' } },
    }),
  };
}

declare global {
  interface Window {
    __imageTextRenderBench: { run: () => Promise<ImageTextBenchRun> };
  }
}

window.__imageTextRenderBench = { run };
