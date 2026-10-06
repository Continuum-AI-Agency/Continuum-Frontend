import { describe, expect, test } from 'bun:test';
import type { TemplateEditableLayer } from '@continuum/contracts';
import { poseDelta, previewMarkup, safeSvg } from './layerPreviewSvg';

const layer = (over: Partial<TemplateEditableLayer>): TemplateEditableLayer => ({
  compId: 1,
  comp: 'Main',
  layerId: 1,
  name: 'Layer',
  kind: 'artwork',
  visible: true,
  visibilityReason: null,
  textReason: null,
  text: null,
  font: null,
  fontSize: null,
  slotKeys: [],
  visibilitySlotKeys: [],
  index: 0,
  position: [100, 100],
  rotation: 0,
  scale: [100, 100],
  opacity: 100,
  transformLocks: {},
  parentName: null,
  parentId: null,
  ...over,
});

/** Apply an SVG transform list to a point, right to left, the way a renderer does. */
function apply(transform: string, [x0, y0]: [number, number]): [number, number] {
  const ops = [...transform.matchAll(/(\w+)\(([^)]*)\)/g)].map(([, op, args]) => ({
    op,
    n: (args ?? '')
      .trim()
      .split(/[\s,]+/)
      .map(Number),
  }));
  let [x, y] = [x0, y0];
  for (const { op, n } of ops.reverse()) {
    if (op === 'translate') [x, y] = [x + (n[0] ?? 0), y + (n[1] ?? 0)];
    if (op === 'scale') [x, y] = [x * (n[0] ?? 1), y * (n[1] ?? n[0] ?? 1)];
    if (op === 'rotate') {
      const r = ((n[0] ?? 0) * Math.PI) / 180;
      [x, y] = [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
    }
  }
  return [x, y];
}
const close = ([a, b]: [number, number], [c, d]: [number, number]) =>
  expect(Math.hypot(a - c, b - d)).toBeLessThan(1e-6);

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
<g data-layer-id="3"><polygon points="0,0 400,0 400,300 0,300" fill="#eee"/></g>
<g data-layer-id="2" opacity="0.5"><polygon points="50,50 80,50 80,80 50,80"/></g>
<g data-layer-id="20" data-in="2"><path d="M 60 60 h 5"/></g>
<g data-layer-id="1"><text x="90" y="100">Hi</text></g>
<g data-layer-id="9"><circle cx="110" cy="100" r="4"/></g>
</svg>`;
// Paint order above is bottom first: 3, then 2 (with 20 drawn inside it), then 1, then 9 on top.
const LAYERS = [
  layer({ layerId: 9, index: 0, parentId: 1, position: [10, 0] }),
  layer({ layerId: 1, index: 1 }),
  layer({ layerId: 2, index: 2, kind: 'composition', position: [65, 65], opacity: 50 }),
  layer({ layerId: 3, index: 3, position: [200, 150] }),
  layer({ layerId: 20, compId: 7, comp: 'Inner', index: 0 }),
];
const base = {
  compId: 1,
  layers: LAYERS,
  rendered: {},
  current: {},
  renderedOrder: [9, 1, 2, 3],
  order: [9, 1, 2, 3],
};
const svgOf = (markup: string) => new window.DOMParser().parseFromString(markup, 'image/svg+xml');
const group = (doc: Document, id: number) => doc.querySelector(`[data-layer-id="${id}"]`);

describe('safeSvg', () => {
  test('rebuilds only the elements and attributes the forge draws with', () => {
    const root = safeSvg(
      `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject><div/></foreignObject>` +
        `<g data-layer-id="1" onload="alert(1)" style="x"><rect width="1" fill="url(https://x.y/a)"/>` +
        `<rect fill="url(#forge-hatch)"/><text>&lt;img src=x&gt;</text></g></svg>`,
    );
    const markup = root?.outerHTML ?? '';
    expect(markup).not.toContain('script');
    expect(markup).not.toContain('foreignObject');
    expect(markup).not.toContain('onload');
    expect(markup).not.toContain('style');
    expect(markup).not.toContain('https://');
    expect(markup).toContain('url(#forge-hatch)');
    expect(markup).toContain('data-layer-id="1"');
    expect(root?.querySelector('text')?.textContent).toBe('<img src=x>');
  });
  test('refuses what is not an SVG', () => {
    expect(safeSvg('<html><body/></html>')).toBeNull();
  });
});

describe('poseDelta', () => {
  test('carries the old anchor to the new position and turns about it', () => {
    const from = {
      position: [100, 100] as [number, number],
      rotation: 0,
      scale: [100, 100] as [number, number],
      opacity: 100,
      visible: true,
    };
    const to = {
      ...from,
      position: [150, 120] as [number, number],
      rotation: 90,
      scale: [200, 100] as [number, number],
    };
    const move = poseDelta(from, to);
    expect(move).not.toBeNull();
    close(apply(move!, [100, 100]), [150, 120]);
    // 10 px right of the anchor: doubled in x by the scale, then turned a quarter clockwise.
    close(apply(move!, [110, 100]), [150, 140]);
  });
  test('says nothing when nothing moved or no position is known', () => {
    const pose = {
      position: [1, 2] as [number, number],
      rotation: 3,
      scale: [100, 100] as [number, number],
      opacity: 100,
      visible: true,
    };
    expect(poseDelta(pose, pose)).toBeNull();
    expect(poseDelta({ ...pose, position: null }, pose)).toBeNull();
  });
});

describe('previewMarkup', () => {
  test('fits the frame and leaves an unedited preview as composed', () => {
    const doc = svgOf(previewMarkup(SVG, base));
    expect(doc.documentElement.getAttribute('width')).toBe('100%');
    expect(group(doc, 1)?.getAttribute('transform')).toBeNull();
  });

  test('a moved layer carries its parented children; a precomp carries what it draws', () => {
    const doc = svgOf(
      previewMarkup(SVG, {
        ...base,
        current: {
          1: { compId: 1, layerId: 1, position: [130, 100] },
          2: { compId: 1, layerId: 2, position: [75, 65] },
        },
      }),
    );
    for (const id of [1, 9])
      expect(group(doc, id)?.getAttribute('transform')).toContain('translate(130 100)');
    for (const id of [2, 20])
      expect(group(doc, id)?.getAttribute('transform')).toContain('translate(75 65)');
    expect(group(doc, 3)?.getAttribute('transform')).toBeNull();
  });

  test('a parented layer waits for the forge to move, but hides and fades at once', () => {
    const doc = svgOf(
      previewMarkup(SVG, {
        ...base,
        current: { 9: { compId: 1, layerId: 9, position: [40, 0], opacity: 50 } },
      }),
    );
    expect(group(doc, 9)?.getAttribute('transform')).toBeNull();
    expect(group(doc, 9)?.getAttribute('opacity')).toBe('0.5');
  });

  test('hiding or fading stays with the layer and its precomp, never its parented children', () => {
    const hidden = svgOf(
      previewMarkup(SVG, { ...base, current: { 1: { compId: 1, layerId: 1, visible: false } } }),
    );
    expect(group(hidden, 1)?.getAttribute('display')).toBe('none');
    expect(group(hidden, 9)?.getAttribute('display')).toBeNull();
    const faded = svgOf(
      previewMarkup(SVG, { ...base, current: { 2: { compId: 1, layerId: 2, opacity: 25 } } }),
    );
    expect(group(faded, 2)?.getAttribute('opacity')).toBe('0.25');
    expect(group(faded, 20)?.getAttribute('opacity')).toBe('0.5');
  });

  test('changes since the composed preview are applied, not changes it already shows', () => {
    const doc = svgOf(
      previewMarkup(SVG, {
        ...base,
        rendered: { 1: { compId: 1, layerId: 1, position: [130, 100] } },
        current: { 1: { compId: 1, layerId: 1, position: [130, 100] } },
      }),
    );
    expect(group(doc, 1)?.getAttribute('transform')).toBeNull();
  });

  test('a re-stack repaints each run, a precomp with what it draws, bottom first', () => {
    const doc = svgOf(previewMarkup(SVG, { ...base, order: [2, 9, 1, 3] }));
    const painted = [...doc.querySelectorAll('[data-layer-id]')].map((g) =>
      Number(g.getAttribute('data-layer-id')),
    );
    expect(painted).toEqual([3, 1, 9, 2, 20]);
  });
});
