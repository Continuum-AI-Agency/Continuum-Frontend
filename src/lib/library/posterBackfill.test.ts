import { describe, expect, it } from 'bun:test';
import type { MediaAsset } from '@continuum/contracts';
import { shouldBackfillPoster } from './posterBackfill';

// A minimal video asset with bytes but no poster of any kind: the base case that
// SHOULD backfill. Each test overrides one field to prove one rule.
function videoAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    brandId: '22222222-2222-4222-8222-222222222222',
    kind: 'video',
    bucket: 'media-library',
    storagePath: 'brand/asset/clip.mp4',
    fileName: 'clip.mp4',
    mimeType: 'video/mp4',
    source: 'ai_generated',
    status: 'ready',
    reviewStatus: 'none',
    tags: [],
    detectedObjects: [],
    hasImageEmbedding: false,
    createdAt: '2026-07-20T00:00:00Z',
    updatedAt: '2026-07-20T00:00:00Z',
    signedUrl: 'https://signed/clip.mp4',
    ...overrides,
  } as MediaAsset;
}

describe('shouldBackfillPoster', () => {
  it('is true for a video with bytes and no poster at all', () => {
    expect(shouldBackfillPoster(videoAsset())).toBe(true);
  });

  it('is false when a ready image preview already exists', () => {
    expect(
      shouldBackfillPoster(
        videoAsset({
          preview: {
            assetVersionId: '44444444-4444-4444-8444-444444444444',
            state: 'ready',
            kind: 'image',
            signedUrl: 'https://signed/poster.webp',
          },
        }),
      ),
    ).toBe(false);
  });

  it('is false when a legacy thumbnail already paints the card', () => {
    expect(shouldBackfillPoster(videoAsset({ thumbnailUrl: 'https://signed/thumb.webp' }))).toBe(
      false,
    );
  });

  it('is false for an image asset', () => {
    expect(shouldBackfillPoster(videoAsset({ kind: 'image' }))).toBe(false);
  });

  it('is false without any bytes to decode', () => {
    expect(shouldBackfillPoster(videoAsset({ signedUrl: null }))).toBe(false);
  });

  it('still backfills when the only preview is a non-image state (e.g. failed)', () => {
    expect(
      shouldBackfillPoster(
        videoAsset({
          preview: {
            assetVersionId: '44444444-4444-4444-8444-444444444444',
            state: 'failed',
            kind: null,
            signedUrl: null,
          },
        }),
      ),
    ).toBe(true);
  });
});
