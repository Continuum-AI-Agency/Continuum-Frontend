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
});
