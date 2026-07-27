import { describe, expect, it } from 'bun:test';
import {
  CANVAS_MEDIA_SIGN_MAX_ITEMS,
  CANVAS_MEDIA_SIGN_TTL_SECONDS,
  canvasMediaSignRequestSchema,
  canvasMediaSignResponseSchema,
} from './canvas-media-signing';

describe('canvas media signing contracts', () => {
  it('requires brand scope and an allowlisted storage coordinate', () => {
    expect(
      canvasMediaSignRequestSchema.safeParse({
        brandProfileId: '5b90a36d-445c-4138-90ce-64f2550dfd72',
        items: [{ bucket: 'media-library', path: 'brand/asset.png' }],
      }).success,
    ).toBe(true);
    expect(
      canvasMediaSignRequestSchema.safeParse({
        brandProfileId: '5b90a36d-445c-4138-90ce-64f2550dfd72',
        items: [{ bucket: 'arbitrary-private-bucket', path: 'secret' }],
      }).success,
    ).toBe(false);
  });

  it('bounds batch size and fixes the short-lived response ttl', () => {
    const items = Array.from({ length: CANVAS_MEDIA_SIGN_MAX_ITEMS + 1 }, (_, index) => ({
      bucket: 'brand-profile-assets' as const,
      path: `brand/${index}.png`,
    }));
    expect(
      canvasMediaSignRequestSchema.safeParse({
        brandProfileId: '5b90a36d-445c-4138-90ce-64f2550dfd72',
        items,
      }).success,
    ).toBe(false);
    expect(
      canvasMediaSignResponseSchema.parse({
        items: [
          {
            bucket: 'media-library',
            path: 'brand/a.png',
            signedUrl: 'https://example.com/signed/a.png',
          },
        ],
        expiresIn: CANVAS_MEDIA_SIGN_TTL_SECONDS,
      }).expiresIn,
    ).toBe(3600);
  });
});
