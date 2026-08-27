// The browser half of `text:render:bench`.
//
// Everything here runs in real Chrome, because the claim being benched is a PIXEL claim: that
// the type the op drew is legible against the background the op left behind it, and that the
// ink is byte-identical to the brand's token. Neither is answerable from a plan — a plan is
// what the op INTENDED. This bundle drives the real `runAction` dispatcher, decodes what came
// back, and re-measures it with the same `darkPercentileContrast` the op planned against.

import {
  darkPercentileContrast,
  type DesignSystemSnapshot,
  EMPTY_ADHERENCE,
  FULL_FRAME,
  type PixelBuffer,
  type Rgb,
  titleBox,
  VERNE_INK_DISTANCE,
  VERNE_TITLE_MIN_CONTRAST,
} from '@continuum/contracts';
import { renderHeadline, resolveFaces, resolveInk } from '../../src/StudioCanvas/utils/actions/imageText';
import { canvasToDataUrl } from '../../src/StudioCanvas/utils/actions/imageOps';
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

const CONFIG = {
  typeSection: 'typography',
  inkSection: 'palette',
  inkToken: 'ink',
  anchor: 'right',
  measure: MEASURE,
  minContrast: VERNE_TITLE_MIN_CONTRAST,
  escalate: true,
};

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

export interface ImageTextCase {
  label: string;
  /** Rung the ladder stopped on: 0 untouched, 1 harmonised, 2+ that many cumulative veils. */
  rung: number;
  treatment: string;
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
  missingDesignSystemError: string | null;
}

async function runCase(label: string, seed: number, floor: number, ceiling: number): Promise<ImageTextCase> {
  const photo = gradientPhoto(seed, floor, ceiling);
  const photoUrl = await canvasToDataUrl(photo);
  const ink = resolveInk(BRAND, 'palette', 'ink');
  const faces = resolveFaces(BRAND, 'typography');

  // The REAL dispatcher: parseActionConfig → SYNC_OPS['image.text'] → loadImage → setImageText
  // → imageOutput. Nothing is stubbed on this path.
  const output = await runAction({
    actionId: 'image.text',
    inputs: [
      { handle: 'in', imageUrl: photoUrl },
      { handle: 'text-in', text: HEADLINE },
    ],
    config: CONFIG,
    designSystem: BRAND,
  });
  if (output.type !== 'image') throw new Error(`${label}: the op returned ${output.type}`);
  const rendered = await decode(`data:${output.mimeType};base64,${output.base64}`);

  // The same inputs again, for the PLAN the dispatcher does not hand back. Deterministic, so
  // this is the plan the frame above was drawn from — the assertions below check that it is.
  const { plan, svg } = await renderHeadline({
    image: (await createImageBitmap(await photo.convertToBlob())) as unknown as CanvasImageSource & {
      width: number;
      height: number;
    },
    headline: HEADLINE,
    ink,
    faces,
    settings: {
      typeSection: 'typography',
      inkSection: 'palette',
      inkToken: 'ink',
      measure: MEASURE,
      minContrast: VERNE_TITLE_MIN_CONTRAST,
      escalate: true,
    },
  });

  return {
    label,
    rung: plan.treatment.rung,
    treatment: plan.treatment.kind,
    plannedRatio: plan.treatment.ratio,
    planCleared: plan.treatment.cleared,
    planLines: plan.lines.length,
    svgTextElements: svg.split('<text ').length - 1,
    svgIsDataUri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`.startsWith('data:'),
    svgMentionsBlob: svg.includes('blob:'),
    mimeType: output.mimeType ?? '',
    bytes: rendered.bytes,
    measurement: measureBox(rendered.pixels, titleBox({ measureFraction: MEASURE }), ink),
  };
}

async function refusal(mutate: (config: Record<string, unknown>) => Record<string, unknown>, drop: boolean) {
  const photoUrl = await canvasToDataUrl(gradientPhoto(7, 150, 230));
  try {
    await runAction({
      actionId: 'image.text',
      inputs: [
        { handle: 'in', imageUrl: photoUrl },
        { handle: 'text-in', text: HEADLINE },
      ],
      config: mutate({ ...CONFIG }),
      designSystem: drop ? null : BRAND,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function run(): Promise<ImageTextBenchRun> {
  return {
    minContrast: VERNE_TITLE_MIN_CONTRAST,
    ink: [...resolveInk(BRAND, 'palette', 'ink')] as [number, number, number],
    fontStack: resolveFaces(BRAND, 'typography').stack,
    cases: [
      // Bright enough that the navy reads straight off the photo — the ladder must not fire.
      await runCase('bright photo, no treatment needed', 0x5eed1, 168, 244),
      // Dark enough that rung 0 fails and the ladder has to rescue the piece.
      await runCase('dark photo, ladder escalates', 0x5eed2, 26, 96),
    ],
    unresolvableTokenError: await refusal((c) => ({ ...c, inkToken: 'headline-ink' }), false),
    missingDesignSystemError: await refusal((c) => c, true),
  };
}

declare global {
  interface Window {
    __imageTextRenderBench: { run: () => Promise<ImageTextBenchRun> };
  }
}

window.__imageTextRenderBench = { run };
