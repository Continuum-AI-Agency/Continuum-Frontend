import { describe, expect, it } from 'bun:test';

import {
  registerGeneratedAssetOperationSchema,
  registerGeneratedAssetResponseSchema,
} from './creative-operations';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const SOURCE_ID = '21111111-1111-4111-8111-111111111111';

describe('registerGeneratedAssetOperationSchema', () => {
  it('accepts a generated creative with every contributing Library asset', () => {
    const parsed = registerGeneratedAssetOperationSchema.parse({
      action: 'register_generated_asset',
      brandId: BRAND_ID,
      kind: 'video',
      bucket: 'brand-profile-assets',
      storagePath: `${BRAND_ID}/canvas/output.mp4`,
      fileName: 'output.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 42,
      durationMs: 8_000,
      source: 'canvas',
      operation: 'canvas_generation',
      originRef: { roomId: 'room-1', prompt: 'cowboy on horseback' },
      sourceAssetIds: [SOURCE_ID],
      idempotencyKey: 'canvas:room-1:output.mp4',
    });

    expect(parsed.sourceAssetIds).toEqual([SOURCE_ID]);
    expect(parsed.operation).toBe('canvas_generation');
  });

  it('rejects a source relation that cannot bind to a UUID asset', () => {
    const parsed = registerGeneratedAssetOperationSchema.safeParse({
      action: 'register_generated_asset',
      brandId: BRAND_ID,
      kind: 'image',
      bucket: 'ai-studio',
      storagePath: `${BRAND_ID}/output.png`,
      fileName: 'output.png',
      mimeType: 'image/png',
      source: 'ai_generated',
      operation: 'image_generation',
      sourceAssetIds: ['not-an-asset-id'],
      idempotencyKey: 'generation:1',
    });

    expect(parsed.success).toBe(false);
  });
});

describe('registerGeneratedAssetResponseSchema', () => {
  it('reports the materialized head and exact lineage edges', () => {
    const parsed = registerGeneratedAssetResponseSchema.parse({
      assetId: '31111111-1111-4111-8111-111111111111',
      versionId: '41111111-1111-4111-8111-111111111111',
      lineageCount: 1,
      status: 'created',
    });

    expect(parsed.lineageCount).toBe(1);
  });
});
