import { describe, expect, it } from 'bun:test';

import {
  registerCanvasAssetRequestSchema,
  registerCanvasAssetResponseSchema,
} from './registerCanvas';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';
const base = {
  brandProfileId: BRAND_ID,
  kind: 'image' as const,
  bucket: 'brand-profile-assets',
  storagePath: `${BRAND_ID}/canvas/node-7/out.png`,
  fileName: 'out.png',
  mimeType: 'image/png',
};

describe('registerCanvasAssetRequestSchema', () => {
  it('accepts canvas output metadata without client-asserted lineage', () => {
    expect(
      registerCanvasAssetRequestSchema.safeParse({
        ...base,
        sizeBytes: 12_345,
        originRef: { kind: 'canvas', roomId: 'room-1', nodeId: 'node-7' },
      }).success,
    ).toBe(true);
    expect(
      registerCanvasAssetRequestSchema.safeParse({
        ...base,
        originRef: { kind: 'canvas', nodeId: 'node-7', sourceAssetIds: [ASSET_ID] },
      }).success,
    ).toBe(false);
  });

  it('accepts exact resize provenance and rejects project files as rendered output', () => {
    expect(
      registerCanvasAssetRequestSchema.safeParse({
        ...base,
        originRef: {
          kind: 'resize',
          sourceAssetId: ASSET_ID,
          preset: 'ig-story-reel',
          aspectRatio: '9:16',
          mode: 'smart_expand',
        },
      }).success,
    ).toBe(true);
    expect(
      registerCanvasAssetRequestSchema.safeParse({
        ...base,
        kind: 'file',
        originRef: { kind: 'canvas', nodeId: 'node-7' },
      }).success,
    ).toBe(false);
  });

  it('returns both durable asset and exact version identity', () => {
    expect(
      registerCanvasAssetResponseSchema.parse({
        assetId: ASSET_ID,
        assetVersionId: '33333333-3333-4333-8333-333333333333',
      }),
    ).toEqual({
      assetId: ASSET_ID,
      assetVersionId: '33333333-3333-4333-8333-333333333333',
    });
  });
});
