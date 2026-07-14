import { describe, expect, it } from 'bun:test';

import { registerCanvasAssetRequestSchema } from './registerCanvas';

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
  it('accepts a canvas origin ref, which never carries lineage on the wire', () => {
    const parsed = registerCanvasAssetRequestSchema.safeParse({
      ...base,
      originRef: { kind: 'canvas', roomId: 'room-1', nodeId: 'node-7', model: 'nano-banana' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a canvas origin ref that tries to assert its own lineage', () => {
    const parsed = registerCanvasAssetRequestSchema.safeParse({
      ...base,
      originRef: { kind: 'canvas', nodeId: 'node-7', sourceAssetIds: [ASSET_ID] },
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a resize origin ref naming the asset that was reframed', () => {
    const parsed = registerCanvasAssetRequestSchema.safeParse({
      ...base,
      originRef: {
        kind: 'resize',
        sourceAssetId: ASSET_ID,
        preset: 'ig-story-reel',
        aspectRatio: '9:16',
        mode: 'smart_expand',
        model: 'gemini-3.1-flash-image-preview',
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a resize origin ref whose source asset is not a uuid', () => {
    const parsed = registerCanvasAssetRequestSchema.safeParse({
      ...base,
      originRef: { kind: 'resize', sourceAssetId: 'asset-1', preset: 'p', aspectRatio: '1:1' },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown origin kind', () => {
    const parsed = registerCanvasAssetRequestSchema.safeParse({
      ...base,
      originRef: { kind: 'somewhere-else', nodeId: 'node-7' },
    });
    expect(parsed.success).toBe(false);
  });
});
