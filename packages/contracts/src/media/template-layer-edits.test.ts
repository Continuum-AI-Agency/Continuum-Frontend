import { describe, expect, test } from 'bun:test';
import {
  saveTemplateLayerVariantRequestSchema,
  templateLayerPreviewRequestSchema,
} from './template-layer-edits';

const base = {
  brandId: '00000000-0000-4000-8000-000000000001',
  expectedVersionId: '00000000-0000-4000-8000-000000000002',
};
describe('template edit boundary', () => {
  test('rejects invalid sizes, duplicate layers and unknown writes; allows visibility false', () => {
    const layer = { compId: 63, layerId: 113, fontSize: 55 };
    expect(templateLayerPreviewRequestSchema.safeParse({ ...base, edits: [layer] }).success).toBe(
      true,
    );
    expect(
      templateLayerPreviewRequestSchema.safeParse({
        ...base,
        edits: [{ compId: 63, layerId: 113, visible: false }],
      }).success,
    ).toBe(true);
    for (const edits of [
      [{ ...layer, fontSize: 0 }],
      [{ ...layer, fontSize: Infinity }],
      [layer, layer],
      [{ ...layer, sourceText: 'rewrite' }],
      [{ compId: 63, layerId: 113 }],
    ]) {
      expect(templateLayerPreviewRequestSchema.safeParse({ ...base, edits }).success).toBe(false);
    }
  });
  test('variant saves are named and reject duplicate or malformed exposures', () => {
    const save = {
      ...base,
      edits: [],
      name: 'Larger labels',
      exposures: [{ slotKey: 'text__label', exposed: false }],
    };
    expect(saveTemplateLayerVariantRequestSchema.safeParse(save).success).toBe(true);
    expect(saveTemplateLayerVariantRequestSchema.safeParse({ ...save, name: ' ' }).success).toBe(
      false,
    );
    expect(
      saveTemplateLayerVariantRequestSchema.safeParse({
        ...save,
        exposures: [...save.exposures, ...save.exposures],
      }).success,
    ).toBe(false);
    expect(
      saveTemplateLayerVariantRequestSchema.safeParse({
        ...save,
        exposures: [{ slotKey: 'text__label', exposed: 'false' }],
      }).success,
    ).toBe(false);
  });
  test('transforms are static pairs and numbers within AE ranges', () => {
    const at = { compId: 63, layerId: 114 };
    for (const change of [
      { position: [1400, 620] },
      { rotation: -12.5 },
      { scale: [110, 90] },
      { opacity: 0 },
    ]) {
      expect(
        templateLayerPreviewRequestSchema.safeParse({ ...base, edits: [{ ...at, ...change }] })
          .success,
      ).toBe(true);
    }
    for (const change of [
      { position: [1400] },
      { position: [1400, Number.NaN] },
      { scale: [110, 90, 100] },
      { opacity: 101 },
      { rotation: Infinity },
      { anchor_point: [0, 0] },
    ]) {
      expect(
        templateLayerPreviewRequestSchema.safeParse({ ...base, edits: [{ ...at, ...change }] })
          .success,
      ).toBe(false);
    }
  });
  test('an order names each layer and each comp once', () => {
    const order = { compId: 63, layerIds: [114, 116, 71] };
    expect(
      templateLayerPreviewRequestSchema.safeParse({ ...base, edits: [], orders: [order] }).success,
    ).toBe(true);
    expect(templateLayerPreviewRequestSchema.parse({ ...base, edits: [] }).orders).toEqual([]);
    for (const orders of [[{ ...order, layerIds: [114, 114] }], [order, order]]) {
      expect(
        templateLayerPreviewRequestSchema.safeParse({ ...base, edits: [], orders }).success,
      ).toBe(false);
    }
  });
  test('a new variant needs a name; saving into the open variant does not', () => {
    const save = { ...base, edits: [], exposures: [] };
    expect(saveTemplateLayerVariantRequestSchema.safeParse(save).success).toBe(false);
    expect(saveTemplateLayerVariantRequestSchema.parse({ ...save, name: 'Bigger' }).saveTo).toBe(
      'new_variant',
    );
    expect(
      saveTemplateLayerVariantRequestSchema.safeParse({ ...save, saveTo: 'this_variant' }).success,
    ).toBe(true);
  });
});
