// The browser half of `burnin:placement:bench`.
//
// The claim under test is a PIXEL claim, and it is specifically NOT a state claim: that when
// the user drags the type block, the BURNED INK lands somewhere else in the decoded output.
// A test that asserts the config now holds `offsetY: 0.45` proves the panel wrote a number;
// it says nothing about whether anything downstream reads it. Every assertion here is taken
// from the ink pixels of a rendered PNG.
//
// Real Chrome, because `OffscreenCanvas`, `createImageBitmap` and SVG rasterisation are the
// code under test. The photos are GENERATED — a deterministic ramp plus a seeded LCG dither —
// so the input is real pixels with a real luma histogram and identical on every run.

import {
  type DesignSystemSnapshot,
  darkPercentileContrast,
  EMPTY_ADHERENCE,
  FULL_FRAME,
  type PixelBuffer,
  type Rgb,
  type Size,
  VERNE_INK_DISTANCE,
  VERNE_TITLE_ANCHOR_OFFSET_Y,
  VERNE_TITLE_MEASURE,
  VERNE_TITLE_MIN_CONTRAST,
  VERNE_TITLE_RIGHT_MARGIN,
} from '@continuum/contracts';
import {
  anchorOrigin,
  type BlockExtent,
  BURN_IN_SNAP_RADIUS,
  blockRect,
  headlineBlockExtent,
  snapToAnchor,
} from '../../src/StudioCanvas/utils/actions/burnInPlacement';
import { canvasToDataUrl } from '../../src/StudioCanvas/utils/actions/imageOps';
import {
  createMeasurer,
  parseHeadline,
  renderHeadline,
  resolveFaces,
  resolveInk,
} from '../../src/StudioCanvas/utils/actions/imageText';
import { runAction } from '../../src/StudioCanvas/utils/actions/runAction';

const INK_HEX = '#0f1f43';
const HEADLINE = 'Estudia una carrera internacional **con University of London**';

/**
 * Tighter than `VERNE_INK_DISTANCE` (60) on purpose. 60 is the "was this photo cropped out of
 * a composed piece" detector and it is deliberately generous; a POSITION measurement wants
 * only pixels that are unambiguously glyph, because one stray background pixel at the far
 * corner would widen the bounding box and hide a placement bug.
 */
const INK_MATCH_DISTANCE = 30;

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
 * A photo, deterministic to the byte.
 *
 * `darkQuadrant` drops one corner into shadow so a block placed THERE has to escalate while
 * the same block placed elsewhere does not — which is the only way to show that the ladder is
 * reading the box the placement moved, rather than a fixed band.
 */
function photo(
  frame: Size,
  seed: number,
  floor: number,
  ceiling: number,
  darkQuadrant?: 'bottom-left',
): OffscreenCanvas {
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
      const inQuadrant =
        darkQuadrant === 'bottom-left' && x < frame.width * 0.72 && y > frame.height * 0.5;
      const level = inQuadrant ? 18 + 26 * ramp : floor + (ceiling - floor) * ramp;
      const i = (y * frame.width + x) * 4;
      // Warm, so nothing in the photo sits near the navy ink and widens the ink box.
      image.data[i] = Math.max(0, Math.min(255, Math.round(level + dither)));
      image.data[i + 1] = Math.max(0, Math.min(255, Math.round(level * 0.9 + dither)));
      image.data[i + 2] = Math.max(0, Math.min(255, Math.round(level * 0.78 + dither)));
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

async function decode(dataUrl: string): Promise<{ pixels: PixelBuffer; bytes: number }> {
  const blob = await (await fetch(dataUrl)).blob();
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

const l1 = (a: Rgb, b: Rgb): number =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** Where the BURNED INK actually is, as fractions of the frame. The whole bench turns on this. */
export interface InkBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  centroidX: number;
  centroidY: number;
  pixels: number;
}

function inkBox(frame: PixelBuffer, ink: Rgb): InkBox {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  let sumX = 0;
  let sumY = 0;
  let pixels = 0;

  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const i = (y * frame.width + x) * frame.channels;
      if (l1([frame.data[i], frame.data[i + 1], frame.data[i + 2]], ink) >= INK_MATCH_DISTANCE) {
        continue;
      }
      pixels += 1;
      sumX += x;
      sumY += y;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }

  if (pixels === 0) {
    return { x0: 0, y0: 0, x1: 0, y1: 0, centroidX: 0, centroidY: 0, pixels: 0 };
  }
  return {
    x0: x0 / frame.width,
    y0: y0 / frame.height,
    x1: (x1 + 1) / frame.width,
    y1: (y1 + 1) / frame.height,
    centroidX: sumX / pixels / frame.width,
    centroidY: sumY / pixels / frame.height,
    pixels,
  };
}

/** Both readings of "what is behind the type", so the difference between them is visible. */
export interface BackgroundContrast {
  /** Glyph pixels AND their anti-aliased halo removed. This is the claim. */
  ratio: number;
  /** Only exact-ish glyph pixels removed. Reported, not asserted — see below. */
  ratioWithoutHalo: number;
  sampled: number;
}

/**
 * The WCAG ratio behind the type, re-measured on the RENDERED frame with the glyphs removed.
 *
 * The exclusion is mandatory: the type is the darkest thing in its own box by construction, so
 * a dark-percentile taken over the drawn frame measures the headline against ITSELF.
 *
 * THE HALO IS PART OF THE TYPE. A colour-distance mask alone keeps every anti-aliased glyph
 * edge — a pixel that is half ink and half background, therefore darker than the background
 * and nowhere near the ink — and those edges ring every letterform, so they dominate the dark
 * 20th percentile of a box that is mostly type. Measured here: 3.04:1 with the edges left in
 * against 3.2 required, on a piece the planner's own probe (which measures the treated photo
 * BEFORE any glyph is drawn) had cleared. The probe is not wrong and the render is not
 * unreadable; the naive mask is measuring the type's own anti-aliasing and calling it
 * background. Dilating the mask by two pixels is what makes this the same question the probe
 * answered. `ratioWithoutHalo` is carried so the correction is stated rather than assumed.
 */
function backgroundContrast(
  frame: PixelBuffer,
  region: { x0: number; y0: number; x1: number; y1: number },
  ink: Rgb,
): BackgroundContrast {
  const x0 = Math.trunc(region.x0 * frame.width);
  const y0 = Math.trunc(region.y0 * frame.height);
  const x1 = Math.trunc(region.x1 * frame.width);
  const y1 = Math.trunc(region.y1 * frame.height);
  const width = Math.max(0, x1 - x0);
  const height = Math.max(0, y1 - y0);
  if (width === 0 || height === 0) return { ratio: 0, ratioWithoutHalo: 0, sampled: 0 };

  const isInk = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = ((y + y0) * frame.width + (x + x0)) * frame.channels;
      const px: Rgb = [frame.data[i], frame.data[i + 1], frame.data[i + 2]];
      if (l1(px, ink) < VERNE_INK_DISTANCE) isInk[y * width + x] = 1;
    }
  }

  const HALO = 2;
  const bare: number[] = [];
  const haloed: number[] = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (isInk[y * width + x] === 1) continue;
      const i = ((y + y0) * frame.width + (x + x0)) * frame.channels;
      const px: Rgb = [frame.data[i], frame.data[i + 1], frame.data[i + 2]];
      bare.push(px[0], px[1], px[2]);

      let nearInk = false;
      for (let dy = -HALO; dy <= HALO && !nearInk; dy += 1) {
        for (let dx = -HALO; dx <= HALO; dx += 1) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || nx < 0 || ny >= height || nx >= width) continue;
          if (isInk[ny * width + nx] === 1) {
            nearInk = true;
            break;
          }
        }
      }
      if (!nearInk) haloed.push(px[0], px[1], px[2]);
    }
  }

  const ratioOf = (values: number[]): number =>
    values.length === 0
      ? 0
      : darkPercentileContrast(
          { width: values.length / 3, height: 1, data: new Uint8ClampedArray(values), channels: 3 },
          FULL_FRAME,
          ink,
        ).ratio;

  return {
    ratio: ratioOf(haloed),
    ratioWithoutHalo: ratioOf(bare),
    sampled: haloed.length / 3,
  };
}

const BASE_CONFIG = {
  anchor: 'top-right' as const,
  offsetX: 0,
  offsetY: 0,
  marginFrac: VERNE_TITLE_RIGHT_MARGIN,
  inkToken: 'ink',
  measure: VERNE_TITLE_MEASURE,
  minContrast: VERNE_TITLE_MIN_CONTRAST,
  escalate: true,
};

export interface PlacedCase {
  label: string;
  frame: Size;
  config: typeof BASE_CONFIG;
  /** Where the ink landed in the DECODED PNG. */
  ink: InkBox;
  /** The box the plan set type in — proof the ladder never moved what the placement chose. */
  planBox: { x0: number; y0: number; x1: number; y1: number };
  /** The box the placement asked for, computed before the render. */
  askedBox: { x0: number; y0: number; x1: number; y1: number };
  planLines: number;
  rung: number;
  treatment: string;
  measured: BackgroundContrast;
  bytes: number;
}

/** The block extent for a frame, from the same measurer and breaker the render uses. */
function extentFor(frame: Size, measure: number): BlockExtent {
  const faces = resolveFaces(BRAND, 'typography');
  return headlineBlockExtent({
    tokens: parseHeadline(HEADLINE),
    frame,
    measureText: createMeasurer(faces, 0),
    measureFraction: measure,
  });
}

async function runCase(
  label: string,
  frame: Size,
  config: typeof BASE_CONFIG,
  source: OffscreenCanvas,
): Promise<PlacedCase> {
  const photoUrl = await canvasToDataUrl(source);
  const ink = resolveInk(BRAND, 'palette', 'ink');
  const faces = resolveFaces(BRAND, 'typography');

  // The REAL dispatcher: parseActionConfig -> SYNC_OPS['image.text'] -> setImageText. If the
  // schema stops carrying the offset, or the op stops reading it, it fails HERE and not in a
  // unit test of a helper nothing calls.
  const output = await runAction({
    actionId: 'image.text',
    inputs: [
      { handle: 'in', imageUrl: photoUrl },
      { handle: 'text-in', text: HEADLINE },
    ],
    config,
    designSystem: BRAND,
  });
  if (output.type !== 'image') throw new Error(`${label}: the op returned ${output.type}`);
  const decoded = await decode(`data:${output.mimeType};base64,${output.base64}`);

  // The same inputs again, for the PLAN the dispatcher does not hand back. `renderHeadline` is
  // deterministic, so this is the plan the frame above was drawn from — which is what lets the
  // bench assert that the ladder never moved the box the placement chose.
  const { plan } = await renderHeadline({
    image: (await createImageBitmap(
      await source.convertToBlob(),
    )) as unknown as CanvasImageSource & {
      width: number;
      height: number;
    },
    headline: HEADLINE,
    ink,
    faces,
    settings: config,
  });

  const asked = blockRect(
    {
      anchor: config.anchor,
      offsetX: config.offsetX,
      offsetY: config.offsetY,
      marginFrac: config.marginFrac,
    },
    extentFor(frame, config.measure),
  );

  return {
    label,
    frame,
    config,
    ink: inkBox(decoded.pixels, ink),
    planBox: plan.box,
    askedBox: asked,
    planLines: plan.lines.length,
    rung: plan.treatment.rung,
    treatment: plan.treatment.kind,
    measured: backgroundContrast(decoded.pixels, asked, ink),
    bytes: decoded.bytes,
  };
}

export interface BurnInPlacementBenchRun {
  ink: [number, number, number];
  minContrast: number;
  snapRadius: number;
  drag: { before: PlacedCase; after: PlacedCase; brokenOffset: PlacedCase };
  snap: {
    released: { x: number; y: number };
    stored: { anchor: string; offsetX: number; offsetY: number; snapped: boolean };
    anchorBox: { x0: number; y0: number; x1: number; y1: number };
    rendered: PlacedCase;
  };
  proportional: { short: PlacedCase; tall: PlacedCase };
  /** The same photo, twice: the block ON the shadow, and the block away from it. */
  shadow: { onIt: PlacedCase; awayFromIt: PlacedCase };
}

async function run(): Promise<BurnInPlacementBenchRun> {
  const shortFrame: Size = { width: 1080, height: 1350 };
  const tallFrame: Size = { width: 1080, height: 1920 };
  const bright = photo(shortFrame, 0xb0a71, 168, 244);
  const brightTall = photo(tallFrame, 0xb0a71, 168, 244);
  const shadowed = photo(shortFrame, 0xb0a72, 176, 240, 'bottom-left');

  // ── The drag ────────────────────────────────────────────────────────────────────────────
  const dragged = { ...BASE_CONFIG, offsetX: -0.3, offsetY: 0.45 };
  const before = await runCase('anchored', shortFrame, { ...BASE_CONFIG }, bright);
  const after = await runCase('dragged', shortFrame, dragged, bright);
  // The NEGATIVE CONTROL: the same drag against a build that does not apply the offset. It is
  // reproduced by rendering the destination config with the offset zeroed, which is
  // byte-for-byte what "the runner stopped reading offsetX/offsetY" produces.
  const brokenOffset = await runCase(
    'dragged, offset not applied',
    shortFrame,
    { ...dragged, offsetX: 0, offsetY: 0 },
    bright,
  );

  // ── The snap ────────────────────────────────────────────────────────────────────────────
  const extent = extentFor(shortFrame, VERNE_TITLE_MEASURE);
  const corner = anchorOrigin('bottom-left', extent, VERNE_TITLE_RIGHT_MARGIN);
  // Released NEAR the corner, not on it — a snap that only works from zero distance is not one.
  const released = {
    x: corner.x + BURN_IN_SNAP_RADIUS * 0.6,
    y: corner.y - BURN_IN_SNAP_RADIUS * 0.5,
  };
  const stored = snapToAnchor(released, extent, VERNE_TITLE_RIGHT_MARGIN);
  const snapRendered = await runCase(
    'snapped to bottom-left',
    shortFrame,
    { ...BASE_CONFIG, anchor: stored.anchor, offsetX: stored.offsetX, offsetY: stored.offsetY },
    bright,
  );

  // ── Two frame sizes, one config ─────────────────────────────────────────────────────────
  const proportionalConfig = { ...BASE_CONFIG, offsetY: VERNE_TITLE_ANCHOR_OFFSET_Y };
  const short = await runCase('1080x1350', shortFrame, proportionalConfig, bright);
  const tall = await runCase('1080x1920', tallFrame, proportionalConfig, brightTall);

  // ── A hand-placed block over a dark patch ───────────────────────────────────────────────
  // Both on ONE photo. Only the placement differs, so if the block over the shadow escalates
  // and the block away from it does not, the ladder is demonstrably reading the box the
  // PLACEMENT moved rather than a fixed band the config cannot reach.
  const onShadow = await runCase(
    'hand-placed ON the shadow',
    shortFrame,
    { ...BASE_CONFIG, anchor: 'bottom-left' as const, offsetX: 0, offsetY: 0 },
    shadowed,
  );
  const offShadow = await runCase(
    'same photo, block away from the shadow',
    shortFrame,
    { ...BASE_CONFIG, anchor: 'top-right' as const, offsetX: 0, offsetY: 0 },
    shadowed,
  );

  return {
    ink: [...resolveInk(BRAND, 'palette', 'ink')] as [number, number, number],
    minContrast: VERNE_TITLE_MIN_CONTRAST,
    snapRadius: BURN_IN_SNAP_RADIUS,
    drag: { before, after, brokenOffset },
    snap: {
      released,
      stored: {
        anchor: stored.anchor,
        offsetX: stored.offsetX,
        offsetY: stored.offsetY,
        snapped: stored.snapped,
      },
      anchorBox: blockRect(
        { anchor: 'bottom-left', offsetX: 0, offsetY: 0, marginFrac: VERNE_TITLE_RIGHT_MARGIN },
        extent,
      ),
      rendered: snapRendered,
    },
    proportional: { short, tall },
    shadow: { onIt: onShadow, awayFromIt: offShadow },
  };
}

declare global {
  interface Window {
    __burnInPlacementBench: { run: () => Promise<BurnInPlacementBenchRun> };
  }
}

window.__burnInPlacementBench = { run };
