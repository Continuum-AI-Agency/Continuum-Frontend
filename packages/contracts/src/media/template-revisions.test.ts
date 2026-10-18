import { describe, expect, test } from 'bun:test';
import { apiRenderJobListQuerySchema } from '../ai-studio/api-renders';
import {
  saveTemplateRevisionRequestSchema,
  setTemplateVariantDefaultRequestSchema,
  templateRevisionEditsSchema,
  templateRevisionErrorCodeSchema,
  templateRevisionSchema,
  templateVariantDefaultsResponseSchema,
} from './template-revisions';

describe('immutable template revision edits', () => {
  test('separate compositions can reuse a layer ID without collisions', () => {
    expect(
      templateRevisionEditsSchema.parse({
        layers: [
          { compId: 1, layerId: 2, fontSize: 55 },
          { compId: 3, layerId: 2, font: 'Urbanchrome Normal' },
        ],
      }).layers,
    ).toHaveLength(2);
    expect(
      templateRevisionEditsSchema.safeParse({
        layers: [
          { compId: 1, layerId: 2, fontSize: 55 },
          { compId: 1, layerId: 2, visible: false },
        ],
      }).success,
    ).toBe(false);
  });

  test('an order names each layer and each comp once', () => {
    const order = { compId: 63, layerIds: [114, 116, 71] };
    expect(templateRevisionEditsSchema.parse({ orders: [order] }).orders).toEqual([order]);
    expect(templateRevisionEditsSchema.parse({}).orders).toEqual([]);
    for (const orders of [
      [{ ...order, layerIds: [114, 114] }],
      [{ ...order, layerIds: [114] }],
      [order, { ...order, layerIds: [71, 116, 114] }],
    ])
      expect(templateRevisionEditsSchema.safeParse({ orders }).success).toBe(false);
  });

  test('an arrangement saved before artboards were recorded reads as the canvas', () => {
    // Prod: nine backfilled revisions carry `{ name, order }` only, and one failed a whole catalog.
    expect(
      templateRevisionEditsSchema.parse({ arrangement: { name: 'Original', order: [9999, 0, 1] } })
        .arrangement,
    ).toEqual({ name: 'Original', artboardId: null, order: [9999, 0, 1] });
  });

  test('media defaults require immutable Library versions', () => {
    const assetId = '00000000-0000-4000-8000-000000000001';
    const versionId = '00000000-0000-4000-8000-000000000002';
    expect(
      templateRevisionEditsSchema.safeParse({
        slots: [{ slotKey: 'background', defaultValue: { assetId } }],
      }).success,
    ).toBe(false);
    expect(
      templateRevisionEditsSchema.parse({
        slots: [{ slotKey: 'background', defaultValue: { assetId, versionId } }],
      }).slots,
    ).toHaveLength(1);
  });

  test('a save names its branch, parent, expected head and retry identity', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const request = {
      brandId: id,
      parentRevisionId: id,
      expectedHeadRevisionId: id,
      idempotencyKey: id,
      edits: {},
    };
    expect(saveTemplateRevisionRequestSchema.safeParse(request).success).toBe(false);
    expect(saveTemplateRevisionRequestSchema.safeParse({ ...request, variantId: id }).success).toBe(
      true,
    );
    expect(
      saveTemplateRevisionRequestSchema.safeParse({ ...request, variantId: id, name: 'Renamed' })
        .success,
    ).toBe(false);
    expect(
      saveTemplateRevisionRequestSchema.parse({ ...request, name: 'Large headline' }).edits,
    ).toEqual({ layers: [], slots: [], orders: [] });
    expect(
      saveTemplateRevisionRequestSchema.safeParse({
        ...request,
        name: 'Large headline',
        edits: { layers: [{ compId: 1, layerId: 1, fontSize: 0 }] },
      }).success,
    ).toBe(false);
  });

  test('only a new variant is tagged, and a recolour names six-digit colours', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const request = {
      brandId: id,
      parentRevisionId: id,
      expectedHeadRevisionId: id,
      idempotencyKey: id,
      tags: ['brand_aligned'],
      edits: { recolor: { palette: ['#E30613'], minChroma: 0.1 } },
    };
    expect(
      saveTemplateRevisionRequestSchema.safeParse({ ...request, name: 'Brand-aligned' }).success,
    ).toBe(true);
    expect(saveTemplateRevisionRequestSchema.safeParse({ ...request, variantId: id }).success).toBe(
      false,
    );
    expect(
      saveTemplateRevisionRequestSchema.safeParse({ ...request, name: 'X', tags: ['other'] })
        .success,
    ).toBe(false);
    expect(templateRevisionEditsSchema.safeParse({ recolor: { palette: ['#e306'] } }).success).toBe(
      false,
    );
    expect(templateRevisionEditsSchema.safeParse({ recolor: { palette: [] } }).success).toBe(false);
  });

  test('a revision by a seeded user still reads', () => {
    // The local fixture login is a valid Postgres uuid but not RFC 4122 v4.
    const createdBy = templateRevisionSchema.shape.createdBy;
    expect(createdBy.safeParse('00000000-0000-0000-0000-0000000000a1').success).toBe(true);
    expect(createdBy.safeParse(null).success).toBe(true);
    expect(createdBy.safeParse('not-a-uuid').success).toBe(false);
  });

  test('a family default is one strict pointer, and only a published variant can be it', () => {
    const templateId = '7d5f2a0e-8c1b-4c3e-9f6a-2b4d6e8f0a1c';
    const variantId = '0f1e2d3c-4b5a-4968-8776-655443322110';
    expect(
      templateVariantDefaultsResponseSchema.parse({ items: [{ templateId, variantId }] }).items,
    ).toEqual([{ templateId, variantId }]);
    expect(
      templateVariantDefaultsResponseSchema.safeParse({
        items: [{ templateId, variantId, original: false }],
      }).success,
    ).toBe(false);
    expect(setTemplateVariantDefaultRequestSchema.safeParse({ brandId: templateId }).success).toBe(
      true,
    );
    expect(
      setTemplateVariantDefaultRequestSchema.safeParse({ brandId: templateId, variantId }).success,
    ).toBe(false);
    expect(templateRevisionErrorCodeSchema.parse('template_variant_unpublished')).toBe(
      'template_variant_unpublished',
    );
    expect(
      apiRenderJobListQuerySchema.parse({ brandId: templateId, variantId }).variantId,
    ).toBe(variantId);
    expect(
      apiRenderJobListQuerySchema.safeParse({ brandId: templateId, variantId: 'v1' }).success,
    ).toBe(false);
  });
});
