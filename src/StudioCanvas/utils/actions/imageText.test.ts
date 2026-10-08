import { describe, expect, it } from 'bun:test';
import {
  breakLines,
  type DesignSystemSnapshot,
  EMPTY_ADHERENCE,
  type MeasureText,
  type PlacementPlan,
  PRELOADED_TYPE_FACES,
  type ProbeContrast,
  planPlacement,
  type TreatmentStep,
  VERNE_TITLE_BOLD_SIZE,
  VERNE_TITLE_LIGHT_SIZE,
  VERNE_VEIL_FLOORS,
} from '@continuum/contracts';
import {
  applyTreatment,
  createProbe,
  describeHeadlineFaces,
  describeHeadlineInk,
  embedFace,
  type HeadlineInk,
  headlineSvg,
  headlineSvgDataUri,
  type PlateSpec,
  parseHeadline,
  parseHexColour,
  plateRect,
  readSettings,
  refuseSplitWords,
  resolveCustomInk,
  resolveHeadlineFaces,
  resolveHeadlineInk,
  scrimReachPx,
  shippedFaces,
  snugMeasure,
  stackParagraphs,
  wordFitScale,
} from './imageText';

// COVERAGE GAP, on purpose, and the same one `imageOps.test.ts` declares: bun + happy-dom has
// no OffscreenCanvas and no 2D context, so nothing here rasterises. What IS exercised is every
// decision the raster depends on — the token resolution, the real `planPlacement`, the real
// SVG serialisation and the real treatment compositing (against a recording context). The
// DRAWN result is graded on decoded pixels by `text:render:bench`, in a real browser.

const INK_HEX = '#0f1f43';
const INK = [0x0f, 0x1f, 0x43] as const;

function designSystem(
  tokens: DesignSystemSnapshot['tokens'],
  fonts: DesignSystemSnapshot['fonts'] = [],
): DesignSystemSnapshot {
  return {
    schemaVersion: 1,
    brandName: 'Bench Brand',
    sourceKind: 'ds_export',
    rigor: {
      tier: 'strict',
      evidence: {
        tokenCount: tokens.length,
        imperativeRuleCount: 0,
        hasAdherenceConfig: false,
        declaredSectionCount: 1,
        exemplarCount: 0,
      },
      override: null,
    },
    tokens,
    fonts,
    adherence: EMPTY_ADHERENCE,
    sections: [],
    conflicts: [],
  };
}

const colourToken = (name: string, value: string): DesignSystemSnapshot['tokens'][number] => ({
  name,
  value,
  kind: 'color',
  resolvedValue: value,
  definedIn: null,
  description: null,
});

const PALETTE = designSystem([
  colourToken('--accent', '#de8218'),
  colourToken('--ink', INK_HEX),
  colourToken('--bg-1', '#ffffff'),
]);

// Advance widths that do not need a font: proportional to the body size, so the balanced
// breaker has real numbers to minimise over and the plan is a real plan.
const measureText: MeasureText = (text, style) => text.length * style.sizePx * 0.52;

/**
 * A probe that refuses every rung UNTIL the given one, so a plan can be produced standing on
 * each step of the escalation ladder in turn. `state.treatments.length` is the rung.
 */
const probeClearingAtRung = (rung: number, min: number): ProbeContrast =>
  ((_box, state) => (state.treatments.length >= rung ? min + 1 : 1.05)) as ProbeContrast;

function planAtRung(rung: number): PlacementPlan {
  return planPlacement({
    tokens: parseHeadline('Estudia una carrera **con University of London**'),
    frame: { width: 1080, height: 1350 },
    measureText,
    probeContrast: probeClearingAtRung(rung, 3.2),
    options: { ink: INK, minContrast: 3.2 },
  });
}

describe('parseHexColour', () => {
  it('reads every literal hex form the token schema accepts', () => {
    expect(parseHexColour('#0f1f43')).toEqual([0x0f, 0x1f, 0x43]);
    expect(parseHexColour('#F0A')).toEqual([0xff, 0x00, 0xaa]);
    expect(parseHexColour('#0f1f43ff')).toEqual([0x0f, 0x1f, 0x43]);
    expect(parseHexColour('  #0F1F43  ')).toEqual([0x0f, 0x1f, 0x43]);
  });

  it('refuses anything that is not a literal — an alias is not a colour', () => {
    expect(parseHexColour('var(--ink)')).toBeNull();
    expect(parseHexColour('rgb(15,31,67)')).toBeNull();
    expect(parseHexColour('')).toBeNull();
  });
});

describe('resolveHeadlineInk', () => {
  const brand = { designSystem: PALETTE };

  it('resolves the named token, and names where it read it', () => {
    expect(resolveHeadlineInk(brand, 'ink')).toEqual({
      rgb: [0x0f, 0x1f, 0x43],
      source: 'design-system',
      tokenName: '--ink',
    });
    expect(resolveHeadlineInk(brand, '--ink')?.rgb).toEqual([0x0f, 0x1f, 0x43]);
    expect(resolveHeadlineInk(brand, 'ACCENT')?.rgb).toEqual([0xde, 0x82, 0x18]);
  });

  it('takes the default ink by ROLE, not by source order', () => {
    // `--accent` is listed first; `--ink` is the body ink. An empty token name must not mean
    // "whichever colour happens to be first in the export".
    expect(resolveHeadlineInk(brand, '')?.rgb).toEqual([0x0f, 0x1f, 0x43]);
  });

  it('returns NULL on a token that does not exist rather than defaulting to black', () => {
    // The refusal moved to the caller — `setImageText` owns the message, because only it knows
    // whether the TYPE resolved. What must never happen here is a guessed colour.
    expect(resolveHeadlineInk(brand, 'headline-ink')).toBeNull();
  });

  it('returns NULL on a token that exists but resolves to no literal colour', () => {
    const aliased = designSystem([
      { ...colourToken('--ink', 'var(--brand)'), resolvedValue: null },
    ]);
    expect(resolveHeadlineInk({ designSystem: aliased }, 'ink')).toBeNull();
  });

  it('returns NULL when the brand carries no colour at all', () => {
    expect(resolveHeadlineInk({ designSystem: designSystem([]) }, '')).toBeNull();
  });
});

describe('resolveCustomInk', () => {
  it('reads a hand-picked hex as an ink that came from nobody', () => {
    expect(resolveCustomInk('#0f1f43')).toEqual({
      rgb: [0x0f, 0x1f, 0x43],
      source: 'custom',
      tokenName: null,
    });
  });

  it('falls through on null and on anything that is not a colour', () => {
    // Falling through hands the decision back to the palette chain. Rendering a headline in
    // a mistyped hex would be the worse answer.
    expect(resolveCustomInk(null)).toBeNull();
    expect(resolveCustomInk('')).toBeNull();
    expect(resolveCustomInk('var(--ink)')).toBeNull();
    expect(resolveCustomInk('nope')).toBeNull();
  });
});

describe('describeHeadlineInk', () => {
  it('says a hand-picked colour is hand-picked, and does not blame a brand shape', () => {
    const described = describeHeadlineInk(resolveCustomInk('#0f1f43') as HeadlineInk);
    expect(described).toContain('#0f1f43');
    expect(described).toContain('picked by hand');
  });
});

describe('shippedFaces', () => {
  it('sets a display face in the weights its file holds, never a faux bold', () => {
    const anton = shippedFaces('Anton');
    expect(anton.stack.startsWith("'Anton'")).toBe(true);
    expect([anton.lightWeight, anton.boldWeight]).toEqual([400, 400]);
    expect(anton.source).toBe('fallback');
    const montserrat = shippedFaces('Montserrat');
    expect([montserrat.lightWeight, montserrat.boldWeight]).toEqual([300, 700]);
  });
});

describe('readSettings', () => {
  it('reads the plate colour and the alignment, defaulting to black-or-white and flush right', () => {
    expect(readSettings({ plateHex: '#c05a2b', align: 'center', plate: 'band' })).toMatchObject({
      plateHex: '#c05a2b',
      align: 'center',
      plate: 'band',
    });
    expect(readSettings({})).toMatchObject({ plateHex: null, align: 'right' });
  });

  it('reads a named face and the column plate, defaulting to the brand face', () => {
    expect(readSettings({ family: 'Anton', plate: 'column' })).toMatchObject({
      family: 'Anton',
      plate: 'column',
    });
    expect(readSettings({}).family).toBeNull();
  });

  it('reads the scale, defaulting to the reference size', () => {
    expect(readSettings({ scale: 1.4 }).scale).toBe(1.4);
    expect(readSettings({}).scale).toBe(1);
  });

  it('reads the plate, and anything it does not know as no plate', () => {
    expect(readSettings({ plate: 'pill' }).plate).toBe('pill');
    expect(readSettings({ plate: 'box' }).plate).toBe('box');
    expect(readSettings({}).plate).toBe('none');
    expect(readSettings({ plate: 'banner' }).plate).toBe('none');
  });

  it('carries the hand-picked ink, and reads a missing one as null rather than a string', () => {
    expect(readSettings({ inkHex: '#0f1f43' }).inkHex).toBe('#0f1f43');
    expect(readSettings({}).inkHex).toBeNull();
    expect(readSettings({ inkHex: null }).inkHex).toBeNull();
  });
});

describe('resolveHeadlineFaces', () => {
  const declaredInter = designSystem([], [{ family: 'Inter', tokens: [], source: null }]);

  it('reads the family off a typography font token and keeps a real fallback stack', () => {
    const system = designSystem([
      {
        name: '--font-display',
        value: "'Sohne Breit', sans-serif",
        kind: 'font',
        resolvedValue: null,
        definedIn: null,
        description: null,
      },
    ]);
    const faces = resolveHeadlineFaces({ designSystem: system });
    expect(faces.family).toBe('Sohne Breit');
    expect(faces.stack.startsWith("'Sohne Breit', ")).toBe(true);
    expect(faces.stack).toContain('sans-serif');
  });

  it('falls back to the declared families, then to the face this product SHIPS', () => {
    expect(resolveHeadlineFaces({ designSystem: declaredInter }).stack).toContain("'Inter'");

    // CHANGED, and the point of the chain: a brand with type nowhere no longer lands on a bare
    // system stack. It lands on the preloaded face — bytes this product can embed — and SAYS so.
    const none = resolveHeadlineFaces({ designSystem: designSystem([]) });
    expect(none.family).toBe(PRELOADED_TYPE_FACES.display);
    expect(none.source).toBe('fallback');
    expect(none.stack).toContain(PRELOADED_TYPE_FACES.display);
  });

  it('reads numeric weights from the section when the brand declared them', () => {
    const system = designSystem([
      {
        name: '--w-light',
        value: '250',
        kind: 'dimension',
        resolvedValue: null,
        definedIn: null,
        description: null,
      },
      {
        name: '--w-bold',
        value: '800',
        kind: 'dimension',
        resolvedValue: null,
        definedIn: null,
        description: null,
      },
    ]);
    expect(resolveHeadlineFaces({ designSystem: system })).toMatchObject({
      lightWeight: 250,
      boldWeight: 800,
    });
    expect(resolveHeadlineFaces({ designSystem: designSystem([]) })).toMatchObject({
      lightWeight: 300,
      boldWeight: 700,
    });
  });
});

describe('describeHeadlineFaces', () => {
  it('names the face AND the rung it came from', () => {
    const described = describeHeadlineFaces(
      resolveHeadlineFaces({
        designSystem: designSystem([], [{ family: 'Inter', tokens: [], source: null }]),
      }),
    );
    expect(described).toContain('Inter');
    expect(described).toMatch(/design system/i);
  });

  it('says a substitute is a substitute rather than passing it off as the brand', () => {
    const described = describeHeadlineFaces(resolveHeadlineFaces({}));
    expect(described).toContain(PRELOADED_TYPE_FACES.display);
    expect(described).toMatch(/no brand face found/i);
  });
});

describe('parseHeadline', () => {
  it('keeps the weight change MID-SENTENCE instead of collapsing to one face', () => {
    expect(parseHeadline('Estudia **con Londres** hoy')).toEqual([
      { text: 'Estudia ', weight: 'light' },
      { text: 'con Londres', weight: 'bold' },
      { text: ' hoy', weight: 'light' },
    ]);
  });

  it('degrades an unmatched marker to a light run rather than eating the headline', () => {
    expect(
      parseHeadline('Estudia ** hoy')
        .map((t) => t.text)
        .join(''),
    ).toBe('Estudia  hoy');
  });
});

describe('headlineSvg', () => {
  const faces = {
    stack: "'Test', sans-serif",
    lightWeight: 300,
    boldWeight: 700,
    family: 'Test',
    source: 'design-system',
  } as const;

  it('draws exactly the lines the plan decided — no more, no fewer', () => {
    for (const rung of [0, 1, 3]) {
      const plan = planAtRung(rung);
      const svg = headlineSvg(plan, faces, INK);
      expect(plan.lines.length).toBeGreaterThan(1);
      expect(svg.split('<text ').length - 1).toBe(plan.lines.length);
      for (const line of plan.lines) {
        expect(svg.split('<tspan ').length - 1).toBeGreaterThanOrEqual(line.words.length);
      }
    }
  });

  it('sets the ink to the TOKEN on every rung of the ladder, and nothing else', () => {
    // rung 0 is the untouched photo, 1 is harmonised, 2..7 are the cumulative veils. The ladder
    // escalates the BACKGROUND; if any rung could reach the type this is where it shows.
    for (let rung = 0; rung <= VERNE_VEIL_FLOORS.length + 1; rung += 1) {
      const plan = planAtRung(rung);
      expect(plan.treatment.ink).toEqual([...INK]);
      expect(plan.ink).toEqual([...INK]);
      const svg = headlineSvg(plan, faces, INK);
      const fills = [...svg.matchAll(/fill="([^"]+)"/g)].map((m) => m[1]);
      expect(fills).toEqual([INK_HEX]);
    }
  });

  it('pins the metrics the plan was measured with — no kerning, no ligatures', () => {
    const svg = headlineSvg(planAtRung(0), faces, INK);
    expect(svg).toContain('font-kerning="none"');
    expect(svg).toContain('font-variant-ligatures:none');
    expect(svg).toContain('letter-spacing="0"');
    expect(svg).toContain('text-anchor="end"');
  });

  it('escapes headline text instead of letting it close a tag', () => {
    const plan = planPlacement({
      tokens: parseHeadline('a </text><script>b'),
      frame: { width: 1080, height: 1350 },
      measureText,
      probeContrast: probeClearingAtRung(0, 3.2),
      options: { ink: INK },
    });
    const svg = headlineSvg(plan, faces, INK);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;/text&gt;');
  });
});

describe('headlineSvgDataUri', () => {
  it('is a data: URI and never a blob: one', () => {
    // A blob-sourced SVG taints the canvas, and the next Mediabunny frame read throws
    // 'tainted sources'. This assertion is the regression fence on a fixed bug.
    const uri = headlineSvgDataUri(
      headlineSvg(
        planAtRung(0),
        { stack: 'x', lightWeight: 300, boldWeight: 700, family: 'x', source: 'fallback' },
        INK,
      ),
    );
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(uri).not.toContain('blob:');
    expect(decodeURIComponent(uri.split(',')[1])).toContain('<svg');
  });
});

describe('applyTreatment', () => {
  // 200x100 frame, box pinned top-right: rect = 90x40 px, so the feather is 40 * 0.18 = 7.2 px
  // and the inset fill is inside the box on every edge. An 8x8 frame cannot show that.
  const FRAME = { width: 200, height: 100 };
  const BOX = { x0: 0.5, y0: 0.1, x1: 0.95, y1: 0.5 };
  const RECT = { x: 100, y: 10, width: 90, height: 40 };
  const FEATHER = 40 * 0.18;
  const CORE = {
    x: RECT.x - FEATHER,
    y: RECT.y - FEATHER,
    width: RECT.width + 2 * FEATHER,
    height: RECT.height + 2 * FEATHER,
  };
  const BOUNDS = {
    x: RECT.x - 2 * FEATHER,
    y: RECT.y - 2 * FEATHER,
    width: RECT.width + 4 * FEATHER,
    height: RECT.height + 4 * FEATHER,
  };

  interface Painted {
    op: string;
    alpha: number;
    fill: string;
    filter: string;
    clip: { x: number; y: number; width: number; height: number } | null;
    rect: { x: number; y: number; width: number; height: number };
    radius?: number;
  }

  const recordingContext = () => {
    const painted: Painted[] = [];
    const state = {
      globalCompositeOperation: 'source-over',
      globalAlpha: 1,
      fillStyle: '#000000',
      filter: 'none',
    };
    let path: Painted['clip'] = null;
    let radius: number | undefined;
    let clip: Painted['clip'] = null;
    const ctx = {
      ...state,
      save() {},
      restore() {
        Object.assign(ctx, state);
        clip = null;
      },
      beginPath() {
        path = null;
        radius = undefined;
      },
      rect(x: number, y: number, width: number, height: number) {
        path = { x, y, width, height };
      },
      roundRect(x: number, y: number, width: number, height: number, r: number) {
        path = { x, y, width, height };
        radius = r;
      },
      fill() {
        if (!path) return;
        painted.push({
          op: ctx.globalCompositeOperation,
          alpha: ctx.globalAlpha,
          fill: ctx.fillStyle,
          filter: ctx.filter,
          clip,
          rect: path,
          radius,
        });
      },
      clip() {
        clip = path;
      },
      fillRect(x: number, y: number, width: number, height: number) {
        painted.push({
          op: ctx.globalCompositeOperation,
          alpha: ctx.globalAlpha,
          fill: ctx.fillStyle,
          filter: ctx.filter,
          clip,
          rect: { x, y, width, height },
        });
      },
    };
    return { ctx, painted };
  };

  // One body size for the plate's padding: the box's own height, as a one-line block has.
  const PILL: PlateSpec = { shape: 'pill', emPx: RECT.height };
  const SQUARE: PlateSpec = { shape: 'box', emPx: RECT.height };
  const run = (steps: TreatmentStep[], plate: PlateSpec | null = null) => {
    const { ctx, painted } = recordingContext();
    applyTreatment(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      steps,
      FRAME,
      INK,
      BOX,
      plate,
    );
    return painted;
  };

  const blurRadius = (filter: string) =>
    Number(/blur\(([\d.]+)px\)/.exec(filter)?.[1] ?? Number.NaN);

  it('lightens the box and its feather — it never fills the frame', () => {
    // The user report this fixes was "why does it always wash out the image?". A fillRect over
    // the frame is that bug, and this is the fence on it. The clip is the hard stop: whatever
    // the blur does, nothing outside `scrimReachPx` of the box can be painted.
    for (const painted of [run([{ kind: 'harmonise' }]), run([{ kind: 'veil', floor: 0.42 }])]) {
      expect(painted).toHaveLength(1);
      const [step] = painted;
      expect(step.clip).toEqual(BOUNDS);
      expect(step.clip?.width).toBeLessThan(FRAME.width);
      expect(step.clip?.height).toBeLessThan(FRAME.height);
    }
  });

  it('keeps the MEASURED box at full strength and puts the ramp outside it', () => {
    // Feathering inward is the trap: a 0.18 ring on both sides is half the box's area, the ramp
    // hits zero exactly where the type's edges are, and no floor on the ladder ever clears.
    const [step] = run([{ kind: 'veil', floor: 0.42 }]);
    expect(step.rect).toEqual(CORE);
    expect(step.rect.x).toBeLessThan(RECT.x);
    expect(step.rect.x + step.rect.width).toBeGreaterThan(RECT.x + RECT.width);
    // A hard-edged rectangle reads as a box stuck on top of the photo — the blur is the fix, and
    // it is derived from the box, not from the frame. σ = feather/2 puts the box edge 2σ inside
    // the fill, i.e. at >= 97 % of the chosen alpha.
    expect(blurRadius(step.filter)).toBeCloseTo(FEATHER / 2, 1);
    expect(scrimReachPx(FRAME, BOX)).toBeCloseTo(2 * FEATHER, 5);
  });

  it('holds a 2 px floor on the feather for a box too small to have one', () => {
    const { ctx, painted } = recordingContext();
    const tiny = { x0: 0, y0: 0, x1: 0.01, y1: 0.01 };
    applyTreatment(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      [{ kind: 'veil', floor: 0.42 }],
      FRAME,
      INK,
      tiny,
    );
    expect(scrimReachPx(FRAME, tiny)).toBe(4);
    expect(painted[0].rect.width).toBeGreaterThan(0);
    expect(painted[0].rect.height).toBeGreaterThan(0);
    expect(blurRadius(painted[0].filter)).toBeCloseTo(1, 5);
  });

  it('composites ONE veil at the resolved floor, not one per floor tried', () => {
    // `resolveTreatment` no longer emits a step per floor, so this is what a real escalation
    // hands the renderer: harmonise, then a single veil.
    const painted = run([{ kind: 'harmonise' }, { kind: 'veil', floor: 0.42 }]);
    expect(painted).toHaveLength(2);
    expect(painted[1]).toMatchObject({ op: 'source-over', alpha: 0.42, fill: '#ffffff' });
  });

  it('lifts the shadows with a LIGHTEN composite, so a bright pixel is untouched', () => {
    const [harmonise] = run([{ kind: 'harmonise' }]);
    expect(harmonise.op).toBe('lighten');
    expect(harmonise.alpha).toBeLessThan(1);
  });

  it('never paints the ink — the ladder escalates the background, never the type', () => {
    const painted = run([
      { kind: 'harmonise' },
      ...VERNE_VEIL_FLOORS.map((floor) => ({ kind: 'veil' as const, floor })),
    ]);
    expect(painted.length).toBe(VERNE_VEIL_FLOORS.length + 1);
    for (const step of painted) expect(step.fill).not.toBe(INK_HEX);
  });

  it('paints nothing at all when the plan asked for no treatment', () => {
    expect(run([])).toEqual([]);
  });

  it('paints the plate even when the ladder asked for nothing — it is part of the treatment', () => {
    const [plate] = run([], PILL);
    expect(plate).toBeDefined();
    // Solid and sharp: a blurred or translucent button reads as a smudge over the photo.
    expect(plate).toMatchObject({ op: 'source-over', alpha: 1, filter: 'none', clip: null });
    // The ink here is a dark navy, so the plate is the white it reads on — never the ink itself.
    expect(plate.fill).toBe('#ffffff');
    expect(plate.rect.x).toBeLessThan(RECT.x);
    expect(plate.rect.y).toBeLessThan(RECT.y);
    expect(plate.rect.x + plate.rect.width).toBeGreaterThan(RECT.x + RECT.width);
    expect(plate.rect.y + plate.rect.height).toBeGreaterThan(RECT.y + RECT.height);
    expect(plate.radius).toBeCloseTo(plate.rect.height / 2, 5);
  });

  it('gives a box plate corners, not a pill', () => {
    const [plate] = run([], SQUARE);
    expect(plate.radius).toBeLessThan(plate.rect.height / 4);
    expect(plateRect(FRAME, BOX, SQUARE).width).toBeLessThan(plateRect(FRAME, BOX, PILL).width);
  });

  it('puts the plate on TOP of any scrim, so the scrim can never tint it', () => {
    const painted = run([{ kind: 'veil', floor: 0.42 }], SQUARE);
    expect(painted).toHaveLength(2);
    expect(painted[1].radius).toBeDefined();
  });

  it('fills a chosen plate colour instead of black or white', () => {
    const [plate] = run([], { shape: 'box', emPx: RECT.height, fill: [0xc0, 0x5a, 0x2b] });
    expect(plate.fill).toBe('#c05a2b');
  });

  it('runs a band edge to edge and on to the nearer frame edge — the colour block', () => {
    // BOX sits in the top half of the frame, so its band runs up to the top edge.
    const top = plateRect(FRAME, BOX, { shape: 'band', emPx: RECT.height });
    expect(top).toMatchObject({ x: 0, y: 0, width: FRAME.width, radius: 0 });
    expect(top.height).toBeGreaterThan(RECT.y + RECT.height);
    const low = plateRect(
      FRAME,
      { x0: 0.2, y0: 0.7, x1: 0.8, y1: 0.8 },
      { shape: 'band', emPx: 10 },
    );
    expect(low.x).toBe(0);
    expect(low.width).toBe(FRAME.width);
    expect(low.y + low.height).toBe(FRAME.height);
    expect(low.y).toBeLessThan(0.7 * FRAME.height);
  });

  it('runs a column top to bottom and on to the nearer SIDE edge — the split that keeps the subject', () => {
    const right = plateRect(
      FRAME,
      { x0: 0.6, y0: 0.2, x1: 0.94, y1: 0.4 },
      { shape: 'column', emPx: 10 },
    );
    expect(right).toMatchObject({ y: 0, height: FRAME.height, radius: 0 });
    expect(right.x + right.width).toBe(FRAME.width);
    // Padded off the words toward the photo, never the whole frame.
    expect(right.x).toBe(0.6 * FRAME.width - 9);
    const left = plateRect(
      FRAME,
      { x0: 0.06, y0: 0.5, x1: 0.4, y1: 0.7 },
      { shape: 'column', emPx: 10 },
    );
    expect(left).toMatchObject({ x: 0, y: 0, height: FRAME.height });
    expect(left.width).toBe(0.4 * FRAME.width + 9);
  });

  it('takes a dark plate for a light ink', () => {
    const { ctx, painted } = recordingContext();
    applyTreatment(
      ctx as unknown as OffscreenCanvasRenderingContext2D,
      [],
      FRAME,
      [0xf5, 0xf0, 0xe8],
      BOX,
      PILL,
    );
    expect(painted[0].fill).toBe('#111111');
  });
});

describe('the plate, as the contrast probe sees it', () => {
  // A 2D context over REAL pixel bytes: drawImage floods the photo colour, fill/fillRect blend
  // the fill style at globalAlpha. Enough to run the real `createProbe` → `applyTreatment` →
  // `readBox` → `darkPercentileContrast` chain end to end, which is the thing the plate has to
  // get right: the probe must MEASURE the plate, or the plan claims a ratio the frame never had.
  const FRAME = { width: 200, height: 120 };
  const PHOTO = [0x18, 0x1c, 0x22] as const;

  class PixelCanvas {
    readonly data: Uint8ClampedArray;
    constructor(
      readonly width: number,
      readonly height: number,
    ) {
      this.data = new Uint8ClampedArray(width * height * 4);
    }
    getContext() {
      const canvas = this;
      let path: { x: number; y: number; width: number; height: number } | null = null;
      const paint = (
        x: number,
        y: number,
        width: number,
        height: number,
        hex: string,
        a: number,
      ) => {
        const rgb = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
        for (let row = Math.max(0, Math.floor(y)); row < Math.min(canvas.height, y + height); row++)
          for (let col = Math.max(0, Math.floor(x)); col < Math.min(canvas.width, x + width); col++)
            for (let c = 0; c < 3; c++) {
              const at = (row * canvas.width + col) * 4 + c;
              canvas.data[at] = canvas.data[at] * (1 - a) + (rgb[c] ?? 0) * a;
            }
      };
      const ctx = {
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        fillStyle: '#000000',
        filter: 'none',
        save() {},
        restore() {},
        clip() {},
        beginPath() {
          path = null;
        },
        rect(x: number, y: number, width: number, height: number) {
          path = { x, y, width, height };
        },
        roundRect(x: number, y: number, width: number, height: number) {
          path = { x, y, width, height };
        },
        clearRect() {
          canvas.data.fill(0);
        },
        drawImage(image: { rgb: readonly number[] }) {
          for (let at = 0; at < canvas.data.length; at += 4) {
            canvas.data.set([image.rgb[0], image.rgb[1], image.rgb[2], 255], at);
          }
        },
        fillRect(x: number, y: number, width: number, height: number) {
          paint(x, y, width, height, ctx.fillStyle, ctx.globalAlpha);
        },
        fill() {
          if (path) paint(path.x, path.y, path.width, path.height, ctx.fillStyle, ctx.globalAlpha);
        },
        getImageData(x: number, y: number, width: number, height: number) {
          const out = new Uint8ClampedArray(width * height * 4);
          for (let row = 0; row < height; row++) {
            const from = ((y + row) * canvas.width + x) * 4;
            out.set(canvas.data.subarray(from, from + width * 4), row * width * 4);
          }
          return { data: out, width, height };
        },
      };
      return ctx;
    }
  }

  const withPixelCanvas = <T>(body: () => T): T => {
    const original = (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = PixelCanvas;
    try {
      return body();
    } finally {
      (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas = original;
    }
  };

  const photo = { width: FRAME.width, height: FRAME.height, rgb: PHOTO } as never;
  const box = { x0: 0.35, y0: 0.7, x1: 0.65, y1: 0.8 };
  const state = { framing: { axis: 'horizontal' as const, focal: 0.5 }, treatments: [] };

  it('measures the plate, not the photo under it', () => {
    const [bare, plated] = withPixelCanvas(() => [
      createProbe(photo, FRAME, INK, null)(box, state),
      createProbe(photo, FRAME, INK, { shape: 'pill', emPx: 12 })(box, state),
    ]);
    // Navy on a near-black photo is illegible; navy on the white plate is not.
    expect(bare).toBeLessThan(1.5);
    expect(plated).toBeGreaterThan(12);
  });

  it('lets a plated CTA clear at rung 0 — the ladder never veils the photo to rescue it', () => {
    const plan = withPixelCanvas(() =>
      planPlacement({
        tokens: parseHeadline('Shop now'),
        frame: FRAME,
        measureText,
        probeContrast: createProbe(photo, FRAME, INK, { shape: 'pill', emPx: 12 }),
        options: { ink: INK, minContrast: 4.5, boxTop: 0.7, boxBottom: 0.8 },
      }),
    );
    expect(plan.treatment.rung).toBe(0);
    expect(plan.treatment.steps).toEqual([]);
    expect(plan.treatment.cleared).toBe(true);
    expect(plan.contrastRatio).toBeGreaterThan(12);
  });
});

describe('stackParagraphs', () => {
  const FRAME = { width: 1080, height: 1920 };
  const settings = {
    ...readSettings({
      anchor: 'top-right',
      offsetX: 0,
      offsetY: 0.1,
      marginFrac: 0.06,
      measure: 0.61,
      minContrast: 3.2,
      escalate: true,
    }),
  };
  const HEADLINE = '**The jeans I live in**\nHigh rise, dark wash, zero fuss';

  it('puts the subhead on its OWN lines, below the headline, never sharing one', () => {
    const [headline, subhead] = stackParagraphs({
      text: HEADLINE,
      frame: FRAME,
      measureText,
      settings,
    });
    expect(headline?.tokens.every((token) => token.weight === 'bold')).toBe(true);
    expect(subhead?.tokens.every((token) => token.weight === 'light')).toBe(true);
    expect(subhead!.options.boxTop).toBeGreaterThan(headline!.options.boxBottom);
    // One right-aligned column: both paragraphs end on the same edge.
    expect(subhead!.options.rightMarginFraction).toBe(headline!.options.rightMarginFraction);
  });

  it('reduces to the single-block placement for one paragraph', () => {
    const [only] = stackParagraphs({
      text: '**Post-set ritual**',
      frame: FRAME,
      measureText,
      settings,
    });
    expect(only!.options).toEqual({
      measureFraction: 0.61,
      rightMarginFraction: expect.closeTo(0.06, 9),
      boxTop: expect.closeTo(0.16, 9),
      boxBottom: expect.any(Number),
    });
  });

  it('keeps stacked PLATES apart, so two plates never merge into one shape', () => {
    const plated = { ...settings, plate: 'box' as const };
    const [upper, lower] = stackParagraphs({
      text: HEADLINE,
      frame: FRAME,
      measureText,
      settings: plated,
    });
    const box = (options: typeof upper.options) => ({
      x0: 1 - options.rightMarginFraction - options.measureFraction,
      y0: options.boxTop,
      x1: 1 - options.rightMarginFraction,
      y1: options.boxBottom,
    });
    const top = plateRect(FRAME, box(upper!.options), { shape: 'box', emPx: upper!.emPx });
    const bottom = plateRect(FRAME, box(lower!.options), { shape: 'box', emPx: lower!.emPx });
    expect(bottom.y).toBeGreaterThan(top.y + top.height);
  });

  it('scales the type, and a bigger headline takes more lines rather than a wider column', () => {
    const [plain] = stackParagraphs({
      text: '**Post-set ritual for real**',
      frame: FRAME,
      measureText,
      settings,
    });
    const [big] = stackParagraphs({
      text: '**Post-set ritual for real**',
      frame: FRAME,
      measureText,
      settings: { ...settings, scale: 1.4 },
    });
    expect(big!.emPx).toBeCloseTo(plain!.emPx * 1.4, 6);
    expect(big!.options.measureFraction).toBe(plain!.options.measureFraction);
    expect(big!.options.boxBottom - big!.options.boxTop).toBeGreaterThan(
      plain!.options.boxBottom - plain!.options.boxTop,
    );
  });

  it('centres each paragraph on the column when asked — story text, not a flush-right headline', () => {
    const centred = {
      ...settings,
      anchor: 'center' as const,
      offsetY: 0,
      align: 'center' as const,
      // Snug plates are what give paragraphs different widths to centre.
      plate: 'box' as const,
    };
    const [upper, lower] = stackParagraphs({
      text: 'Post-set\nritual time',
      frame: FRAME,
      measureText,
      settings: centred,
    });
    const middle = (options: typeof upper.options) =>
      1 - options.rightMarginFraction - options.measureFraction / 2;
    expect(middle(upper!.options)).toBeCloseTo(0.5, 6);
    expect(middle(lower!.options)).toBeCloseTo(0.5, 6);
    expect(upper!.options.rightMarginFraction).not.toBeCloseTo(
      lower!.options.rightMarginFraction,
      6,
    );
  });

  it('sizes a subhead on its own scale under a big cover line', () => {
    const [head, sub] = stackParagraphs({
      text: '**Post-set ritual**\nOrange Gatorade, straight from my gym bag',
      frame: FRAME,
      measureText,
      settings: { ...settings, scale: 1.8, subScale: 1.1 },
    });
    expect(head!.scale).toBe(1.8);
    expect(sub!.scale).toBe(1.1);
    expect(sub!.emPx).toBeCloseTo(FRAME.width * 0.0443 * 1.1, 6);
  });

  it('is empty for text with no words', () => {
    expect(stackParagraphs({ text: ' \n ', frame: FRAME, measureText, settings })).toEqual([]);
  });
});

describe('a word never breaks mid-word (the Easy Fit stills: "descuent / o", "anualida / d")', () => {
  const FRAME = { width: 1080, height: 1350 };
  // A face wider than the planner's estimate, as Easy Fit's was: bold 0.62 em a character.
  const wide: MeasureText = (text, style) =>
    text.length * style.sizePx * (style.weight === 'bold' ? 0.62 : 0.55);
  // The native-story edge column the run set them in: 0.3 of the width, centred story text.
  const column = (scale: number) => ({
    ...readSettings({
      anchor: 'top-right',
      offsetX: 0,
      offsetY: 0,
      marginFrac: 0.03,
      measure: 0.3,
      minContrast: 3.2,
      escalate: false,
    }),
    align: 'center' as const,
    scale,
  });
  // The words as the renderer breaks each paragraph: its own box, at its own scale.
  const setWords = (text: string, scale: number) =>
    stackParagraphs({ text, frame: FRAME, measureText: wide, settings: column(scale) }).flatMap(
      (paragraph) =>
        breakLines(paragraph.tokens, wide, {
          measure: FRAME.width * paragraph.options.measureFraction,
          boldSizePx: FRAME.width * VERNE_TITLE_BOLD_SIZE * paragraph.scale,
          lightSizePx: FRAME.width * VERNE_TITLE_LIGHT_SIZE * paragraph.scale,
        }).lines.flatMap((line) => line.words.map((word) => word.text)),
    );
  const wordsOf = (text: string) => text.replaceAll('**', '').split(/\s+/).filter(Boolean);

  it.each([
    ['**50% de descuento**\n**en tu anualidad**', 0.9],
    ['**50% en tu anualidad**', 1.2],
    ['**Tu primer mes**\nEmpieza hoy sin complicaciones ni pretextos en Easy Fit.', 1.2],
  ])('%p at scale %p sets every word whole', (text, scale) => {
    expect(setWords(text, scale)).toEqual(wordsOf(text));
  });

  it('shrinks only the paragraph whose longest word overruns, and only as far as it must', () => {
    const [headline, subhead] = stackParagraphs({
      text: '**Tu primer mes**\nEmpieza hoy sin complicaciones ni pretextos en Easy Fit.',
      frame: FRAME,
      measureText: wide,
      settings: column(1.2),
    });
    expect(headline?.scale).toBe(1.2);
    const longest = wide('complicaciones', {
      weight: 'light',
      sizePx: FRAME.width * VERNE_TITLE_LIGHT_SIZE * subhead!.scale,
    });
    expect(subhead!.scale).toBeLessThan(1.2);
    expect(longest).toBeLessThanOrEqual(FRAME.width * 0.3);
    expect(longest).toBeGreaterThan(FRAME.width * 0.3 * 0.97);
  });

  it('leaves a scale alone when every word already fits', () => {
    expect(wordFitScale([{ text: 'Tu primer mes', weight: 'bold' }], FRAME, wide, 0.7, 1.2)).toBe(
      1.2,
    );
  });
});

describe('a brand face carried as bytes (headless lanes)', () => {
  const embed = (weight: number) => ({
    family: 'Oswald',
    weight,
    format: 'ttf' as const,
    base64: 'AAEAAA==',
  });

  it('inlines the brand embeds for the draw, and leaves a face with none to the shipped path', async () => {
    const css = await embedFace('Oswald', [embed(300), embed(700)]);
    expect(css).toContain("font-family: 'Oswald';");
    expect(css).toContain('font-weight: 300;');
    expect(css).toContain('font-weight: 700;');
    expect(css).toContain('data:font/ttf;base64,AAEAAA==');
    expect(await embedFace('Oswald', [])).toBeNull();
  });

  it('sets the weights the embeds hold, so the planner and the draw ask the same file', () => {
    const faces = resolveHeadlineFaces({
      ads: { typography: { primary: 'Oswald' } },
      fontEmbeds: [embed(400), embed(600)],
    });
    expect(faces).toMatchObject({ family: 'Oswald', source: 'ads', lightWeight: 400, boldWeight: 600 });
  });
});

describe('refuseSplitWords (image.text refuseSplit)', () => {
  const plan = (lines: string[][]) =>
    ({
      lines: lines.map((words) => ({ words: words.map((text) => ({ text })) })),
    }) as unknown as PlacementPlan;

  it('throws on a piece that is no whole word of the text', () => {
    expect(() =>
      refuseSplitWords('**50% de descuento en tu anualidad**', [
        plan([['50%', 'de'], ['descuent'], ['o', 'en', 'tu'], ['anualidad']]),
      ]),
    ).toThrow('layout_fault:split_word:descuent / o');
  });

  it('passes whole words across paragraphs', () => {
    expect(() =>
      refuseSplitWords('**50% de descuento**\nEntrena cómodo', [
        plan([['50%', 'de'], ['descuento']]),
        plan([['Entrena', 'cómodo']]),
      ]),
    ).not.toThrow();
  });

  it('is off unless a step asks for it', () => {
    expect(readSettings({}).refuseSplit).toBe(false);
    expect(readSettings({ refuseSplit: true }).refuseSplit).toBe(true);
  });
});

describe('snugMeasure', () => {
  const FRAME = { width: 1080, height: 1350 };

  it('shrinks a plated block to its widest line, so the plate hugs the words', () => {
    const measure = snugMeasure('Shop now', FRAME, measureText, 0.61);
    const words = measureText('Shop now', { weight: 'light', sizePx: FRAME.width * 0.0443 });
    expect(measure).toBeLessThan(0.61);
    expect(measure * FRAME.width).toBeCloseTo(words + 1, 5);
  });

  it('never grows past the configured measure', () => {
    const long = 'Order the full summer set today and get free shipping on every size';
    expect(snugMeasure(long, FRAME, measureText, 0.3)).toBeLessThanOrEqual(0.3);
  });
});
