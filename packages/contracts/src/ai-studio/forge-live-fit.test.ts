/**
 * Does a row's value still fit the design — asked of the Live kit, in code, per keystroke.
 *
 * A 100x60 comp with a face whose every number is round (letters 5 px apart, each glyph a 1x7 px
 * bar standing on its baseline). The rows, top of the stack first: a side panel over the right
 * edge, the speaker's name, their title, the white box both sit on, and the background.
 */
import { describe, expect, test } from 'bun:test';
import { planFitCheck } from './api-render-fit';
import { checkLiveFit, worstFitByKey } from './forge-live-fit';
import { layoutText } from './forge-live-text';
import type { ForgeRenderLive } from './forge-render-preview';
import type { SceneGlyphKit, SceneLayer, SceneTextKit } from './forge-scene';

const BAR =
  'M 0 0 C 0 0 100 0 100 0 C 100 0 100 700 100 700 C 100 700 0 700 0 700 C 0 700 0 0 0 0 Z';
const FACE: SceneGlyphKit = {
  upem: 1000,
  ascender: 0.8,
  chars: {
    ...Object.fromEntries([...'abcdefghijklmnopqrstuvwxyz'].map((ch) => [ch, [500, 500, BAR]])),
    ' ': [250, 250, ''],
  },
  kern: {},
};

const pointKit = (x: number, y: number, over: Partial<SceneTextKit> = {}): SceneTextKit => ({
  font: 'Round-Regular',
  size: 10,
  tracking: 0,
  hscale: 1,
  fauxbold: false,
  caps: 0,
  leading: 12,
  justify: 7413,
  indents: [0, 0, 0],
  box: null,
  matrix: [1, 0, 0, 1, x, y],
  ...over,
});

const row = (id: number, name: string, over: Partial<SceneLayer>): SceneLayer => ({
  id,
  name,
  kind: 'shape',
  depth: 0,
  enabled: true,
  guide: false,
  opacity: 100,
  onscreen: true,
  tier: 'measured',
  fill: '#ffffff',
  corners: null,
  ...over,
});

const rect = (x0: number, y0: number, x1: number, y1: number): SceneLayer['corners'] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** A text row as the kit sends it: laid out in its authored value, carrying its kit. */
const textRow = (id: number, name: string, value: string, kit: SceneTextKit): SceneLayer => {
  const shell = row(id, name, { kind: 'text', text: { value, fill: '#111111' }, kit });
  const laid = layoutText(shell, value, FACE);
  if ('why' in laid) throw new Error(laid.why);
  return laid.layer;
};

const scene = (layers: SceneLayer[]): ForgeRenderLive => ({
  scene: {
    ok: true,
    comp: { name: 'Speaker 5:3', width: 100, height: 60 },
    at: 0,
    layers,
    glyphs: { 'Round-Regular': FACE },
  },
  variables: [
    { key: 'nombre', label: 'Nombre', kind: 'text', reserved: false, layerIds: [2] },
    { key: 'cargo', label: 'Cargo', kind: 'text', reserved: false, layerIds: [3] },
  ],
  brandMark: null,
  comp: 'Speaker 5:3',
  at: 0,
  notes: [],
});

const card = (over: { box?: Partial<SceneLayer>; name?: SceneTextKit } = {}) =>
  scene([
    row(1, 'Side panel', { corners: rect(85, 0, 100, 60), fill: '#6b2bd9' }),
    textRow(2, 'Name', 'ana', over.name ?? pointKit(10, 20)),
    textRow(3, 'Title', 'ana', pointKit(10, 40)),
    row(4, 'White box', { corners: rect(5, 5, 75, 50), ...over.box }),
    row(5, 'Background', { kind: 'solid', corners: rect(0, 0, 100, 60), fill: '#f26b1d' }),
  ]);

const verdictOf = (kit: ForgeRenderLive, values: Record<string, string>, key = 'nombre') => {
  const found = checkLiveFit({ kit, values }).find((verdict) => verdict.key === key);
  if (!found) throw new Error(`no verdict for ${key}`);
  return found;
};

describe('a value the design has room for', () => {
  test('the authored value itself fits — every flag is measured against the designer’s own', () => {
    const verdict = verdictOf(card(), { nombre: 'ana' });
    expect(verdict.state).toBe('ok');
    expect(verdict.subject).toBe('text');
  });

  test('a longer value still inside its box fits', () => {
    expect(verdictOf(card(), { nombre: 'anaana' }).state).toBe('ok');
  });

  test('a variable the row did not set is not checked', () => {
    expect(checkLiveFit({ kit: card(), values: {} })).toEqual([]);
  });
});

describe('a value that breaks the layout', () => {
  test('runs past the panel it sat on, by how much', () => {
    // 13 letters: ink from x=10 to 71, then the 14th reaches 76 — past the box's right edge at 75.
    const verdict = verdictOf(card(), { nombre: 'anaanaanaanaan' });
    expect(verdict.state).toBe('clipped');
    expect(verdict.why).toContain('past White box');
    expect(verdict.why).toContain('1 px');
  });

  test('slides under a layer stacked above it', () => {
    const verdict = verdictOf(card(), { nombre: 'anaanaanaanaanaana' });
    expect(verdict.state).toBe('clipped');
    expect(verdict.why).toContain('covered by Side panel');
  });

  test('runs off the canvas, per edge', () => {
    const verdict = verdictOf(card(), { nombre: 'anaanaanaanaanaanaanaana' });
    expect(verdict.state).toBe('clipped');
    expect(verdict.clippedPx?.[2]).toBeGreaterThan(0);
    expect(verdict.why).toContain('off the right edge');
  });

  test('collides with another text, and both sides say so', () => {
    // Point text grows downward a leading at a time: a third line lands on the title's baseline.
    const values = { nombre: 'ana\rana\rana', cargo: 'ana' };
    const name = verdictOf(card(), values);
    expect(name.state).toBe('clipped');
    expect(name.why).toContain('collides with Cargo');
    expect(name.covers.map((cover) => cover.label)).toContain('Cargo');
    expect(verdictOf(card(), values, 'cargo').why).toContain('collides with Nombre');
  });

  test('a box text too long for its box drops lines, and says it', () => {
    const boxed = card({ name: pointKit(10, 20, { box: [0, -8, 60, 14, 0] }) });
    const verdict = verdictOf(boxed, { nombre: 'ana ana ana ana ana ana ana ana ana ana ana' });
    expect(verdict.state).toBe('clipped');
    expect(verdict.why).toContain('too long for its text box');
  });
});

describe('what production templates carry', () => {
  test('a visibility toggle bound to the same layer does not hide the text’s own value', () => {
    // PSD imports bind `show_<slot>` to the very layer the text writes. Found on production
    // 2026-09-29: the toggle, listed after the text, took the layer and the value was never laid out.
    const kit = card();
    const toggled: ForgeRenderLive = {
      ...kit,
      variables: [
        ...kit.variables,
        {
          key: 'show_nombre',
          label: 'Show nombre',
          kind: 'boolean',
          reserved: false,
          layerIds: [2],
        },
      ],
    };
    const verdict = verdictOf(toggled, { nombre: 'anaanaanaanaan', show_nombre: true } as never);
    expect(verdict.state).toBe('clipped');
  });

  test('a cutout photo above the text does not cover it — a raster’s box is not its pixels', () => {
    // Production 2026-09-29, UTEC Official Typography: the speaker cutout's box ran over the name
    // while its pixels there were transparent; the judge passed it and so must this.
    const kit = card();
    const layers = [
      row(9, 'speaker', { kind: 'file', corners: rect(0, 0, 60, 18) }),
      ...kit.scene.layers,
    ];
    const verdict = verdictOf({ ...kit, scene: { ...kit.scene, layers } }, { nombre: 'anaana' });
    expect(verdict.state).toBe('ok');
  });

  test('a field blanked with a zero-width space is laid out as empty, not refused', () => {
    const verdict = verdictOf(card(), { nombre: '\u200b' });
    expect(verdict.state).toBe('ok');
  });
});

describe('what the kit cannot answer is unknown, never ok', () => {
  test('a layer with no layout kit escalates as unlaid', () => {
    const kit = card();
    const layers = kit.scene.layers.map((layer) =>
      layer.id === 2 ? { ...layer, kit: null, kitWhy: 'anchorAligment moves it' } : layer,
    );
    const verdict = verdictOf({ ...kit, scene: { ...kit.scene, layers } }, { nombre: 'ana' });
    expect(verdict.state).toBe('unknown');
    expect(verdict.unknownReason).toBe('unlaid');
    expect(verdict.why).toContain('anchorAligment');
  });

  test('a panel an expression resizes is not a boundary — its authored corners are stale', () => {
    const resizing = card({ box: { driven: ['ADBE Scale'] } });
    const verdict = verdictOf(resizing, { nombre: 'anaanaanaanaan' });
    expect(verdict.why).not.toContain('White box');
  });
});

describe('a rig-placed picture, answered by the rig’s own arithmetic', () => {
  const rigged = (method: number) =>
    scene([
      row(10, 'Frame', { corners: rect(40, 10, 90, 50) }),
      row(11, 'Product', {
        kind: 'file',
        corners: rect(40, 10, 90, 50),
        fit: { follow: 10, method, anchor: 5 },
        asset: { width: 50, height: 40 },
      }),
    ]);
  const withSlot = (kit: ForgeRenderLive): ForgeRenderLive => ({
    ...kit,
    variables: [
      { key: 'producto', label: 'Producto', kind: 'image', reserved: false, layerIds: [11] },
    ],
  });

  test('contained in its frame: fits', () => {
    const [verdict] = checkLiveFit({
      kit: withSlot(rigged(4)),
      values: {},
      assetSize: () => ({ w: 400, h: 100 }),
    });
    expect(verdict?.state).toBe('ok');
    expect(verdict?.subject).toBe('media');
  });

  test('covering its frame spills off the canvas, and says which edge', () => {
    const [verdict] = checkLiveFit({
      kit: withSlot(rigged(5)),
      values: {},
      assetSize: () => ({ w: 400, h: 100 }),
    });
    expect(verdict?.state).toBe('clipped');
    expect(verdict?.why).toContain('off the');
  });

  test('no picture chosen is not checked', () => {
    expect(checkLiveFit({ kit: withSlot(rigged(5)), values: {}, assetSize: () => null })).toEqual(
      [],
    );
  });
});

describe('formats', () => {
  test('the worst verdict per key wins, named by the format that decided it', () => {
    const fits = checkLiveFit({ kit: card(), values: { nombre: 'ana' } });
    const breaks = checkLiveFit({ kit: card(), values: { nombre: 'anaanaanaanaan' } });
    const [merged] = worstFitByKey([
      { format: '1:1', verdicts: fits },
      { format: '16:9', verdicts: breaks },
    ]);
    expect(merged?.state).toBe('clipped');
    expect(merged?.why).toStartWith('16:9: ');
  });
});

describe('a text verdict in the escalation rule', () => {
  test('a known text problem is answered — it does not send the frame to the judge', () => {
    const verdict = verdictOf(card(), { nombre: 'anaanaanaanaan' });
    expect(planFitCheck({ comp: null, slots: [verdict] }).escalate).toBe(false);
  });

  test('text the kit could not lay out does', () => {
    const kit = card();
    const layers = kit.scene.layers.map((layer) =>
      layer.id === 2 ? { ...layer, kit: null, kitWhy: 'no kit' } : layer,
    );
    const verdict = verdictOf({ ...kit, scene: { ...kit.scene, layers } }, { nombre: 'ana' });
    expect(planFitCheck({ comp: null, slots: [verdict] }).escalate).toBe(true);
  });
});
