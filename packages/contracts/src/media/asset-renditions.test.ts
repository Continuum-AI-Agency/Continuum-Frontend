import { describe, expect, it } from 'bun:test';
import {
  assetPreviewSchema,
  assetRenditionSchema,
  preferredAssetPreview,
} from './asset-renditions';

describe('asset rendition contracts', () => {
  const base = {
    id: '11111111-1111-4111-8111-111111111111',
    brandId: '22222222-2222-4222-8222-222222222222',
    assetId: '33333333-3333-4333-8333-333333333333',
    assetVersionId: '44444444-4444-4444-8444-444444444444',
    role: 'preview_image',
    state: 'ready',
    bucket: 'media-previews',
    storagePath: '222/333/444/preview.png',
    mimeType: 'image/png',
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
  } as const;

  it('requires ready renditions to name their stored object', () => {
    expect(assetRenditionSchema.safeParse(base).success).toBe(true);
    expect(
      assetRenditionSchema.safeParse({
        ...base,
        bucket: null,
        storagePath: null,
      }).success,
    ).toBe(false);
  });

  it('allows an explicit awaiting-companion preview without a URL', () => {
    expect(
      assetPreviewSchema.parse({
        assetVersionId: base.assetVersionId,
        state: 'awaiting_companion',
        kind: null,
        signedUrl: null,
      }),
    ).toMatchObject({ state: 'awaiting_companion', signedUrl: null });
  });

  it('chooses video for detail and image for card surfaces', () => {
    const renditions = [
      assetRenditionSchema.parse(base),
      assetRenditionSchema.parse({
        ...base,
        id: '55555555-5555-4555-8555-555555555555',
        role: 'preview_video',
        storagePath: '222/333/444/preview.mp4',
        mimeType: 'video/mp4',
      }),
    ];
    expect(preferredAssetPreview(renditions, 'card')?.role).toBe('preview_image');
    expect(preferredAssetPreview(renditions, 'detail')?.role).toBe('preview_video');
  });
});
