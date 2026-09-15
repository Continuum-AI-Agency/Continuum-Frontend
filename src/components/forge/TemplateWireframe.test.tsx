/**
 * The wireframe draws each ratio's own boxes: a slot's per-comp instance where one exists (scaled
 * when measured in a comp of another size), the older single placement where it names that comp,
 * and a bare box only where it cannot be some other comp's rectangle. Nothing unmeasured is drawn.
 */

import { describe, expect, mock, test } from 'bun:test';
import type { TemplateParse } from '@continuum/contracts';

mock.module('@/StudioCanvas/nodes/api-render/apiRendersApi', () => ({ apiRendersApi: {} }));

const { wireframeFrames } = await import('./TemplateWireframe');

const slot = (key: string, extra: Record<string, unknown>) =>
  ({
    key,
    name: key,
    kind: 'text',
    origin: 'essential',
    driver: 'static',
    comps: [],
    layerIds: [],
    ...extra,
  }) as TemplateParse['slots'][number];

const PARSE = {
  parser: 'py_aep',
  sourceFamily: 'after_effects',
  appVersion: null,
  comps: [],
  ratios: [
    { ratio: '1:1', width: 1080, height: 1080, comps: ['Square'] },
    { ratio: '9:16', width: 1080, height: 1920, comps: ['Story'] },
  ],
  slots: [
    slot('Headline', {
      comps: ['Square', 'Story'],
      instances: [
        { compId: 1, comp: 'Square', layerId: 1, box: [0, 0, 540, 100], compSize: [540, 540] },
        { compId: 2, comp: 'Story', layerId: 1, box: [10, 20, 30, 40], compSize: [1080, 1920] },
      ],
    }),
    slot('Product', {
      kind: 'image',
      comps: ['Story'],
      placement: { comp: 'Story', compSize: [1080, 1920], box: [100, 100, 900, 900] },
    }),
    // Two comps and no per-comp measurement: which one this box belongs to is unknown.
    slot('Price', { comps: ['Square', 'Story'], box: [1, 2, 3, 4] }),
  ],
  fonts: [],
  staticText: [],
  warnings: [],
} as unknown as TemplateParse;

describe('wireframeFrames', () => {
  test('each ratio gets the boxes measured in its own comp', () => {
    const [square, story] = wireframeFrames(PARSE);
    expect(square).toEqual({
      ratio: '1:1',
      width: 1080,
      height: 1080,
      // Measured in a 540 px comp, drawn on the 1080 px frame.
      boxes: [{ key: 'Headline', kind: 'text', box: [0, 0, 1080, 200] }],
    });
    expect(story?.boxes).toEqual([
      { key: 'Headline', kind: 'text', box: [10, 20, 30, 40] },
      { key: 'Product', kind: 'image', box: [100, 100, 900, 900] },
    ]);
  });

  test('a bare box is drawn when there is only one frame it could belong to', () => {
    const single = { ...PARSE, ratios: [PARSE.ratios[0]!] } as TemplateParse;
    expect(wireframeFrames(single)[0]?.boxes.map((entry) => entry.key)).toEqual([
      'Headline',
      'Price',
    ]);
    expect(wireframeFrames(null)).toEqual([]);
  });
});
