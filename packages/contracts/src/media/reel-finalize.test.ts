import { describe, expect, it } from 'bun:test';

import {
  linkReelMp4ErrorSchema,
  linkReelMp4RequestSchema,
  linkReelMp4ResponseSchema,
} from './reel-finalize';

describe('link-reel-mp4 contract', () => {
  it('round-trips a request', () => {
    const parsed = linkReelMp4RequestSchema.safeParse({
      brandId: 'brand_1',
      draftId: '11111111-1111-1111-1111-111111111111',
      mp4Base64: 'AAAA',
      mimeType: 'video/mp4',
      durationSec: 18,
      captions: {
        source: 'google_stt_v2',
        words: [{ text: 'hello', startSec: 0, endSec: 0.4 }],
        style: {
          textColor: '#ffffff',
          highlightColor: '#ffd400',
          outlineColor: '#000000',
          position: { xFrac: 0.5, yFrac: 0.88 },
        },
      },
      referenceAssetIds: ['00000000-0000-4000-8000-000000000001'],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a non-mp4 mime type', () => {
    expect(
      linkReelMp4RequestSchema.safeParse({
        brandId: 'brand_1',
        draftId: 'd1',
        mp4Base64: 'AAAA',
        mimeType: 'video/webm',
        durationSec: 18,
      }).success,
    ).toBe(false);
  });

  it('requires a draftId (a reel always belongs to a draft)', () => {
    expect(
      linkReelMp4RequestSchema.safeParse({
        brandId: 'brand_1',
        draftId: null,
        mp4Base64: 'AAAA',
        mimeType: 'video/mp4',
        durationSec: 18,
      }).success,
    ).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(
      linkReelMp4RequestSchema.safeParse({
        brandId: 'brand_1',
        draftId: 'd1',
        mp4Base64: 'AAAA',
        mimeType: 'video/mp4',
        durationSec: 18,
        extra: true,
      }).success,
    ).toBe(false);
  });

  it('round-trips ready/exists responses and the error envelope', () => {
    expect(
      linkReelMp4ResponseSchema.safeParse({
        ok: true,
        status: 'exists',
        bucket: 'brand-profile-assets',
        path: 'reel/brand_1/d1.mp4',
        signedUrl: null,
        assetId: '00000000-0000-4000-8000-000000000001',
      }).success,
    ).toBe(true);
    expect(
      linkReelMp4ErrorSchema.safeParse({ ok: false, status: 'error', message: 'boom' }).success,
    ).toBe(true);
  });
});
