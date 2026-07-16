import { describe, expect, it } from 'bun:test';
import { imageReformatEventSchema, imageReformatRequestSchema } from './reformat';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_VERSION_ID = '55555555-5555-4555-8555-555555555555';

describe('imageReformatRequestSchema', () => {
  it('accepts a focal crop request and derives no client-owned storage fields', () => {
    expect(
      imageReformatRequestSchema.parse({
        brandId: BRAND_ID,
        sourceAssetId: ASSET_ID,
        requestId: REQUEST_ID,
        mode: 'crop',
        preset: 'vertical',
        focalPoint: { x: 0.25, y: 0.75 },
      }),
    ).toEqual({
      brandId: BRAND_ID,
      sourceAssetId: ASSET_ID,
      requestId: REQUEST_ID,
      mode: 'crop',
      preset: 'vertical',
      focalPoint: { x: 0.25, y: 0.75 },
    });
  });
});

describe('imageReformatEventSchema', () => {
  it('parses a durable completed asset', () => {
    const event = imageReformatEventSchema.parse({
      type: 'reformat.completed',
      data: {
        requestId: REQUEST_ID,
        assetId: ASSET_ID,
        versionId: VERSION_ID,
        sourceVersionId: SOURCE_VERSION_ID,
        outputMode: 'derivative',
        signedUrl: 'https://example.com/result.jpg',
        bucket: 'brand-profile-assets',
        storagePath: `${BRAND_ID}/reformats/result.jpg`,
        fileName: 'hero-vertical.jpg',
        mimeType: 'image/jpeg',
        width: 1080,
        height: 1920,
        aspectRatio: '9:16',
      },
    });

    expect(event.type).toBe('reformat.completed');
  });
});
