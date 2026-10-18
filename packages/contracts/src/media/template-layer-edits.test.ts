import { describe, expect, test } from 'bun:test';
import {
  saveTemplateLayerVariantRequestSchema,
  templateLayerInventorySchema,
  templateEditableLayerSchema,
  templateLayerPreviewRequestSchema,
  templateLayerViewQuerySchema,
} from './template-layer-edits';

const base = {
  brandId: '00000000-0000-4000-8000-000000000001',
  expectedVersionId: '00000000-0000-4000-8000-000000000002',
};
describe('template edit boundary', () => {
  test('accepts additive writer design association and supplemental geometry without changing layer identity', () => {
    const layer = templateEditableLayerSchema.parse({
      compId: 1, comp: 'Main', layerId: 17, name: 'Title', kind: 'text', visible: true,
      visibilityReason: null, textReason: null, text: 'Hello', font: 'DejaVuSans', fontSize: 32,
      designLayerId: null, artboardId: 10, x: 405.364013671875, y: 644.635986328125,
      groupingReason: null,
      width: null, height: null, geometryReason: 'Only text geometry is editable here.',
      slotKeys: [], visibilitySlotKeys: [], index: 0,
      rotation: 0, scale: [100, 100], opacity: 100, transformLocks: {}, parentName: null, parentId: null,
    });
    expect(layer.compId).toBe(1);
    expect(layer.layerId).toBe(17);
    expect(layer.designLayerId).toBeNull();
    expect(layer.artboardId).toBe(10);
    expect(layer.groupingReason).toBeNull();
    expect(layer.geometryReason).toContain('Only text geometry');
    expect(templateEditableLayerSchema.safeParse({ ...layer, x: Number.NaN }).success).toBe(false);
  });
  test('keeps missing grouping preflight distinct from a positive null result', () => {
    const baseLayer = {
      compId: 1, comp: 'Main', layerId: 17, name: 'Title', kind: 'text' as const, visible: true,
      visibilityReason: null, textReason: null, text: 'Hello', font: 'DejaVuSans', fontSize: 32,
      slotKeys: [], visibilitySlotKeys: [], index: 0, x: 0, y: 0,
      rotation: 0, scale: [100, 100] as [number, number], opacity: 100, transformLocks: {},
      parentName: null, parentId: null,
    };
    expect(templateEditableLayerSchema.parse(baseLayer)).not.toHaveProperty('groupingReason');
    expect(templateEditableLayerSchema.parse({ ...baseLayer, groupingReason: null }).groupingReason).toBeNull();
    expect(templateEditableLayerSchema.parse({ ...baseLayer, groupingReason: 'animated layer' }).groupingReason).toBe('animated layer');
  });
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
    expect(templateLayerPreviewRequestSchema.safeParse({ ...base, edits: [{ compId: 63, layerId: 113, text: '' }] }).success).toBe(true);
    expect(templateLayerPreviewRequestSchema.safeParse({ ...base, edits: [{ compId: 63, layerId: 113, text: 'x'.repeat(20_001) }] }).success).toBe(false);
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
      { x: 1400, y: 620 },
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
      { position: [1400, 620] },
      { x: Number.NaN },
      { scale: [110] },
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
  test('the layer list carries transforms and locks, never a second position', () => {
    const layer = {
      compId: 63,
      comp: 'Main',
      layerId: 114,
      name: 'Logo',
      kind: 'artwork',
      visible: true,
      visibilityReason: null,
      textReason: 'This layer has no editable text.',
      text: null,
      font: null,
      fontSize: null,
      x: 960,
      y: 540,
      slotKeys: [],
      visibilitySlotKeys: [],
      index: 0,
      rotation: 0,
      scale: [100, 100],
      opacity: 100,
      transformLocks: { rotation: 'Animated rotation must be edited in its source.' },
      parentId: null,
      parentName: null,
    };
    const inventory = {
      compId: 63,
      comps: [{ id: 63, name: 'Main', orderReason: null }],
      layers: [layer],
      warnings: [],
    };
    expect(templateLayerInventorySchema.safeParse(inventory).success).toBe(true);
    expect(
      templateLayerInventorySchema.safeParse({
        ...inventory,
        layers: [{ ...layer, position: [960, 540] }],
      }).success,
    ).toBe(false);
    expect(
      templateLayerInventorySchema.safeParse({
        ...inventory,
        layers: [{ ...layer, transformLocks: { anchor: 'no' } }],
      }).success,
    ).toBe(false);
    expect(
      templateLayerViewQuerySchema.parse({
        brandId: base.brandId,
        versionId: base.expectedVersionId,
        compId: '63',
      }).compId,
    ).toBe(63);
  });
});
