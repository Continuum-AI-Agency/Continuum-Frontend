import { describe, expect, it } from 'bun:test';
import {
  backgroundRemovalEventSchema,
  backgroundRemovalRequestSchema,
  matteVideoResponseSchema,
} from './background-removal';

const BRAND_ID = '11111111-1111-4111-8111-111111111111';
const ASSET_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const VERSION_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_VERSION_ID = '55555555-5555-4555-8555-555555555555';

describe('backgroundRemovalRequestSchema', () => {
  it('defaults to a plain cutout with no feather', () => {
    expect(
      backgroundRemovalRequestSchema.parse({
        brandId: BRAND_ID,
        sourceAssetId: ASSET_ID,
        requestId: REQUEST_ID,
        kind: 'image',
      }),
    ).toEqual({
      brandId: BRAND_ID,
      sourceAssetId: ASSET_ID,
      requestId: REQUEST_ID,
      kind: 'image',
      mode: 'remove',
      featherPx: 0,
    });
  });

  it('refuses a replacement colour that is not a six-digit hex', () => {
    const base = {
      brandId: BRAND_ID,
      sourceAssetId: ASSET_ID,
      requestId: REQUEST_ID,
      kind: 'video' as const,
      mode: 'replace' as const,
    };
    expect(backgroundRemovalRequestSchema.safeParse({ ...base, replacement: 'white' }).success).toBe(
      false,
    );
    expect(backgroundRemovalRequestSchema.safeParse({ ...base, replacement: '#fff' }).success).toBe(
      false,
    );
    expect(
      backgroundRemovalRequestSchema.safeParse({ ...base, replacement: '#ffffff' }).success,
    ).toBe(true);
  });

  it('keeps feather inside the range the node can actually render', () => {
    const base = { brandId: BRAND_ID, sourceAssetId: ASSET_ID, requestId: REQUEST_ID, kind: 'image' };
    expect(backgroundRemovalRequestSchema.safeParse({ ...base, featherPx: 21 }).success).toBe(false);
    expect(backgroundRemovalRequestSchema.safeParse({ ...base, featherPx: -1 }).success).toBe(false);
  });
});

describe('backgroundRemovalEventSchema', () => {
  it('carries the alpha claim on a completed cutout', () => {
    const parsed = backgroundRemovalEventSchema.parse({
      type: 'background_removal.completed',
      data: {
        requestId: REQUEST_ID,
        assetId: ASSET_ID,
        versionId: VERSION_ID,
        sourceVersionId: SOURCE_VERSION_ID,
        kind: 'video',
        mode: 'remove',
        signedUrl: 'https://example.test/cutout.webm?token=abc',
        bucket: 'brand-profile-assets',
        storagePath: `${BRAND_ID}/canvas-creations/cutout.webm`,
        fileName: 'cutout.webm',
        mimeType: 'video/webm',
        width: 1080,
        height: 1920,
        durationMs: 15_000,
        hasAlpha: true,
      },
    });
    expect(parsed.type).toBe('background_removal.completed');
  });

  it('distinguishes the matte service failing from the relay failing', () => {
    for (const code of ['MATTE_FAILED', 'RELAY_FAILED'] as const) {
      expect(
        backgroundRemovalEventSchema.safeParse({
          type: 'background_removal.failed',
          data: { requestId: REQUEST_ID, code, message: 'nope', retryable: true },
        }).success,
      ).toBe(true);
    }
    expect(
      backgroundRemovalEventSchema.safeParse({
        type: 'background_removal.failed',
        data: { requestId: REQUEST_ID, code: 'MADE_UP', message: 'nope', retryable: true },
      }).success,
    ).toBe(false);
  });

  it('only names the relay stage on progress, never as a bare string', () => {
    expect(
      backgroundRemovalEventSchema.safeParse({
        type: 'background_removal.progress',
        data: { requestId: REQUEST_ID, stage: 'transcoding', progress: 50 },
      }).success,
    ).toBe(false);
  });
});

describe('matteVideoResponseSchema', () => {
  // MP4 cannot carry alpha, so a matte service that answered `video/mp4` would be
  // handing back a silently flattened cutout. The literal is the guard.
  it('refuses any container but WebM', () => {
    const base = {
      resultUrl: 'https://storage.googleapis.com/continuum-matte-staging/x.webm?sig=1',
      width: 1080,
      height: 1920,
      frames: 450,
      durationMs: 15_000,
    };
    expect(matteVideoResponseSchema.safeParse({ ...base, mimeType: 'video/webm' }).success).toBe(
      true,
    );
    expect(matteVideoResponseSchema.safeParse({ ...base, mimeType: 'video/mp4' }).success).toBe(
      false,
    );
  });
});
