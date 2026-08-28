import {
  type DesignSystemSnapshot,
  EMPTY_ADHERENCE,
  type MeasureText,
  type PlacementPlan,
  planPlacement,
  PRELOADED_TYPE_FACES,
  type ProbeContrast,
  type TreatmentStep,
  VERNE_VEIL_FLOORS,
} from '@continuum/contracts';
import { describe, expect, it } from 'bun:test';
import {
  applyTreatment,
  describeHeadlineFaces,
  headlineSvg,
  headlineSvgDataUri,
  parseHeadline,
  parseHexColour,
  resolveHeadlineFaces,
  resolveHeadlineInk,
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
    expect(parseHeadline('Estudia ** hoy').map((t) => t.text).join('')).toBe('Estudia  hoy');
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
  interface Painted {
    op: string;
    alpha: number;
    fill: string;
  }

  const recordingContext = () => {
    const painted: Painted[] = [];
    const state = { globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '#000000' };
    const ctx = {
      ...state,
      save() {},
      restore() {
        Object.assign(ctx, state);
      },
      fillRect() {
        painted.push({
          op: ctx.globalCompositeOperation,
          alpha: ctx.globalAlpha,
          fill: ctx.fillStyle,
        });
      },
    };
    return { ctx, painted };
  };

  const run = (steps: TreatmentStep[]) => {
    const { ctx, painted } = recordingContext();
    applyTreatment(ctx as unknown as OffscreenCanvasRenderingContext2D, steps, { width: 8, height: 8 }, INK);
    return painted;
  };

  it('composites each veil floor in order, so coverage accumulates', () => {
    const painted = run([
      { kind: 'veil', floor: 0.15 },
      { kind: 'veil', floor: 0.28 },
    ]);
    expect(painted).toEqual([
      { op: 'source-over', alpha: 0.15, fill: '#ffffff' },
      { op: 'source-over', alpha: 0.28, fill: '#ffffff' },
    ]);
  });

  it('lifts the shadows with a LIGHTEN composite, so a bright pixel is untouched', () => {
    const [harmonise] = run([{ kind: 'harmonise' }]);
    expect(harmonise.op).toBe('lighten');
    expect(harmonise.alpha).toBeLessThan(1);
  });

  it('never paints the ink — the ladder escalates the background, never the type', () => {
    const painted = run([{ kind: 'harmonise' }, ...VERNE_VEIL_FLOORS.map((floor) => ({ kind: 'veil' as const, floor }))]);
    expect(painted.length).toBe(VERNE_VEIL_FLOORS.length + 1);
    for (const step of painted) expect(step.fill).not.toBe(INK_HEX);
  });
});
