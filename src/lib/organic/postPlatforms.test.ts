import { describe, expect, it } from 'bun:test';
import { PLATFORM_CAPABILITIES, publishPlatformSchema } from '@continuum/contracts';

import {
  isPostPlatform,
  ORGANIC_POST_PLATFORM_KEYS,
  POST_PLATFORMS,
  postFormatOptions,
  postPlatformLabel,
} from './postPlatforms';

describe('POST_PLATFORMS', () => {
  it('configures exactly the platforms that have a publisher', () => {
    expect(Object.keys(POST_PLATFORMS).sort()).toEqual([...publishPlatformSchema.options].sort());
    expect(Object.keys(POST_PLATFORMS).sort()).toEqual(Object.keys(PLATFORM_CAPABILITIES).sort());
    expect([...ORGANIC_POST_PLATFORM_KEYS]).toEqual([...publishPlatformSchema.options]);
  });

  it('keeps Instagram on the frame and sizes that already work', () => {
    const instagram = POST_PLATFORMS.instagram;
    expect(instagram.frame).toBe('phone');
    expect(instagram.mediaTemplate).toEqual({ width: 1080, height: 1080 });
    expect(instagram.reelAspect).toBe(4 / 5);
    expect(instagram.permalink?.('abc')).toBe('https://www.instagram.com/p/abc/');
  });

  it('previews TikTok and YouTube as vertical phone posts', () => {
    for (const platform of ['tiktok', 'youtube'] as const) {
      expect(POST_PLATFORMS[platform].frame).toBe('phone');
      expect(POST_PLATFORMS[platform].reelAspect).toBe(9 / 16);
      expect(POST_PLATFORMS[platform].permalink).toBeUndefined();
    }
  });
});

describe('isPostPlatform', () => {
  it('accepts every publishable platform and nothing else', () => {
    expect(isPostPlatform('tiktok')).toBe(true);
    expect(isPostPlatform('youtube')).toBe(true);
    expect(isPostPlatform('x')).toBe(false);
    expect(isPostPlatform('TikTok')).toBe(false);
    expect(isPostPlatform(undefined)).toBe(false);
  });
});

describe('postPlatformLabel', () => {
  it('names a platform, and degrades to the raw key for an unknown one', () => {
    expect(postPlatformLabel('tiktok')).toBe('TikTok');
    expect(postPlatformLabel('threads')).toBe('threads');
  });
});

describe('postFormatOptions', () => {
  it('offers every format for a platform that supports them all', () => {
    expect(postFormatOptions(['tiktok'])).toEqual(['Post', 'Carousel', 'Reel']);
  });

  it('offers only Reel on YouTube, alone or alongside another platform', () => {
    expect(postFormatOptions(['youtube'])).toEqual(['Reel']);
    expect(postFormatOptions(['instagram', 'youtube'])).toEqual(['Reel']);
  });
});
