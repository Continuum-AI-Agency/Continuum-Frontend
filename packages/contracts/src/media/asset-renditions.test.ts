import { describe, expect, it } from 'bun:test';
import {
  assetPreviewSchema,
  assetRenditionRoleSchema,
  assetRenditionSchema,
  completeAssetRenditionOperationSchema,
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

  it('accepts continuity frames without surfacing them as Library previews', () => {
    expect(assetRenditionRoleSchema.parse('first_frame')).toBe('first_frame');
    expect(assetRenditionRoleSchema.parse('last_frame')).toBe('last_frame');
    const continuityFrames = [
      assetRenditionSchema.parse({
        ...base,
        id: '55555555-5555-4555-8555-555555555555',
        role: 'first_frame',
        storagePath: '222/333/444/first-frame.webp',
        mimeType: 'image/webp',
      }),
      assetRenditionSchema.parse({
        ...base,
        id: '66666666-6666-4666-8666-666666666666',
        role: 'last_frame',
        storagePath: '222/333/444/last-frame.webp',
        mimeType: 'image/webp',
      }),
    ];

    expect(preferredAssetPreview(continuityFrames, 'card')).toBeNull();
    expect(preferredAssetPreview(continuityFrames, 'detail')).toBeNull();
  });

  const poster = {
    ...base,
    role: 'poster',
    storagePath: '222/333/444/poster.webp',
    mimeType: 'image/webp',
  } as const;

  it('parses a rendition with and without poster provenance', () => {
    expect(assetRenditionSchema.safeParse(poster).success).toBe(true);
    const parsed = assetRenditionSchema.safeParse({
      ...poster,
      posterSource: 'user',
      sourceTimestampMs: 2000,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.posterSource).toBe('user');
      expect(parsed.data.sourceTimestampMs).toBe(2000);
    }
    expect(
      assetRenditionSchema.safeParse({ ...poster, posterSource: null, sourceTimestampMs: null })
        .success,
    ).toBe(true);
  });

  it('rejects an unknown posterSource or a negative sourceTimestampMs', () => {
    expect(assetRenditionSchema.safeParse({ ...poster, posterSource: 'x' }).success).toBe(false);
    expect(assetRenditionSchema.safeParse({ ...poster, sourceTimestampMs: -1 }).success).toBe(
      false,
    );
  });

  const completeBody = {
    action: 'complete_asset_rendition',
    brandId: base.brandId,
    assetId: base.assetId,
    assetVersionId: base.assetVersionId,
    renditionId: base.id,
    mimeType: 'image/webp',
    sizeBytes: 4096,
    renderer: 'mediabunny-browser-poster',
  } as const;

  it('accepts optional poster provenance on the complete operation and rejects bad values', () => {
    expect(completeAssetRenditionOperationSchema.safeParse(completeBody).success).toBe(true);
    expect(
      completeAssetRenditionOperationSchema.safeParse({
        ...completeBody,
        posterSource: 'user',
        sourceTimestampMs: 2000,
      }).success,
    ).toBe(true);
    expect(
      completeAssetRenditionOperationSchema.safeParse({ ...completeBody, posterSource: 'x' })
        .success,
    ).toBe(false);
    expect(
      completeAssetRenditionOperationSchema.safeParse({ ...completeBody, sourceTimestampMs: -5 })
        .success,
    ).toBe(false);
  });
});
