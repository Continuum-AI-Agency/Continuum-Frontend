import { describe, expect, it } from 'bun:test';

import {
  CAPTION_MAX_ANY_PLATFORM,
  captionLimits,
  carouselLimits,
  PLATFORM_CAPABILITIES,
  publishEventSchema,
  publishResultSchema,
  mediaTransportFor,
  supportsFormat,
  toPublishPlatform,
} from './publishing';

describe('publish platform capabilities', () => {
  it('caps carousels at each platform\'s real child limit', () => {
    expect(carouselLimits('instagram')).toEqual({ min: 2, max: 10 });
    expect(carouselLimits('facebook')).toEqual({ min: 2, max: 10 });
    expect(carouselLimits('linkedin')).toEqual({ min: 2, max: 20 });
    expect(carouselLimits('tiktok')).toEqual({ min: 2, max: 35 });
  });

  it('marks LinkedIn as the only byte-transport platform', () => {
    expect(PLATFORM_CAPABILITIES.instagram.mediaTransport).toBe('url');
    expect(PLATFORM_CAPABILITIES.facebook.mediaTransport).toBe('url');
    expect(PLATFORM_CAPABILITIES.linkedin.mediaTransport).toBe('bytes');
    // TikTok's transport is per-format: video pushes bytes (FILE_UPLOAD), photos are
    // PULL_FROM_URL only, so a single platform-wide value cannot describe it.
    expect(mediaTransportFor('tiktok', 'REEL')).toBe('bytes');
    expect(mediaTransportFor('tiktok', 'POST')).toBe('url');
    expect(mediaTransportFor('tiktok', 'CAROUSEL')).toBe('url');
    // Platforms without overrides fall back to the platform-wide value.
    expect(mediaTransportFor('instagram', 'REEL')).toBe('url');
    expect(mediaTransportFor('linkedin', 'POST')).toBe('bytes');
  });

  it('supports all three formats on every platform', () => {
    for (const platform of ['instagram', 'facebook', 'linkedin', 'tiktok'] as const) {
      for (const format of ['POST', 'REEL', 'CAROUSEL'] as const) {
        expect(supportsFormat(platform, format)).toBe(true);
      }
    }
  });
});

describe('publish event schema', () => {
  it('accepts a started event', () => {
    expect(
      publishEventSchema.safeParse({ type: 'started', platform: 'linkedin', format: 'CAROUSEL' })
        .success,
    ).toBe(true);
  });

  it('accepts a LinkedIn chunked-upload progress event', () => {
    expect(
      publishEventSchema.safeParse({
        type: 'processing',
        platform: 'linkedin',
        stage: 'upload_chunk',
        attempt: 2,
      }).success,
    ).toBe(true);
  });

  it('accepts a Meta container-polling progress event', () => {
    expect(
      publishEventSchema.safeParse({
        type: 'processing',
        platform: 'instagram',
        stage: 'polling',
        attempt: 0,
        statusCode: 'FINISHED',
        containerId: 'c-1',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown stage', () => {
    expect(
      publishEventSchema.safeParse({
        type: 'processing',
        platform: 'facebook',
        stage: 'teleporting',
      }).success,
    ).toBe(false);
  });

  it('rejects a failed event carrying an uncatalogued error code', () => {
    expect(
      publishEventSchema.safeParse({ type: 'failed', error: 'boom', code: 'kaboom' }).success,
    ).toBe(false);
  });

  it('accepts the LinkedIn-specific media_upload_failed code', () => {
    expect(
      publishEventSchema.safeParse({ type: 'failed', error: 'boom', code: 'media_upload_failed' })
        .success,
    ).toBe(true);
  });
});

describe('publish result schema', () => {
  it('is platform-agnostic', () => {
    const parsed = publishResultSchema.safeParse({
      postId: 'urn:li:share:7301',
      format: 'CAROUSEL',
      platform: 'linkedin',
      accountId: 'urn:li:organization:2414183',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('caption capabilities', () => {
  it('carries each platform its own real caption ceiling', () => {
    expect(captionLimits('instagram')).toEqual({ maxLength: 2200, maxHashtags: 30 });
    expect(captionLimits('linkedin')).toEqual({ maxLength: 3000, maxHashtags: 30 });
    expect(captionLimits('facebook')).toEqual({ maxLength: 63206, maxHashtags: 30 });
    expect(captionLimits('tiktok')).toEqual({ maxLength: 2200, maxHashtags: 30 });
  });

  it('exposes a widest-of-all bound that no platform exceeds', () => {
    for (const platform of ['instagram', 'facebook', 'linkedin', 'tiktok'] as const) {
      expect(captionLimits(platform).maxLength).toBeLessThanOrEqual(CAPTION_MAX_ANY_PLATFORM);
    }
    // And it is actually one of them, not an invented number.
    expect(CAPTION_MAX_ANY_PLATFORM).toBe(captionLimits('facebook').maxLength);
  });
});

describe('toPublishPlatform', () => {
  it('narrows known platform names, case- and whitespace-insensitively', () => {
    expect(toPublishPlatform('instagram')).toBe('instagram');
    expect(toPublishPlatform('LinkedIn')).toBe('linkedin');
    expect(toPublishPlatform('  facebook ')).toBe('facebook');
    expect(toPublishPlatform('TikTok')).toBe('tiktok');
  });

  it('returns null for platforms we cannot publish to', () => {
    // youtube stays unpublishable: drafts carry it (the agent's schema accepts it) but no
    // publisher is registered, so it must not resolve to a publish platform.
    expect(toPublishPlatform('youtube')).toBeNull();
    expect(toPublishPlatform('x')).toBeNull();
    expect(toPublishPlatform('')).toBeNull();
    expect(toPublishPlatform(undefined)).toBeNull();
    expect(toPublishPlatform(null)).toBeNull();
  });
});
