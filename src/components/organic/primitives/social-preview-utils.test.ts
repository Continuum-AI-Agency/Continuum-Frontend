import { describe, expect, it } from 'bun:test';

import { resolvePreviewAspectRatio, resolvePreviewMaxWidth } from './social-preview-utils';

describe('resolvePreviewAspectRatio', () => {
  it('keeps the Instagram frame exactly as it shipped', () => {
    expect(resolvePreviewAspectRatio('instagram', 'Post')).toBe(1);
    expect(resolvePreviewAspectRatio('instagram', 'Reel')).toBe(4 / 5);
    expect(resolvePreviewAspectRatio('instagram', 'story')).toBe(9 / 16);
  });

  it('previews TikTok and YouTube vertically for every format', () => {
    for (const platform of ['tiktok', 'youtube']) {
      expect(resolvePreviewAspectRatio(platform, 'Reel')).toBe(9 / 16);
      expect(resolvePreviewAspectRatio(platform, 'Post')).toBe(9 / 16);
    }
  });

  it('uses the LinkedIn landscape card for still media', () => {
    expect(resolvePreviewAspectRatio('linkedin', 'Post')).toBe(1200 / 628);
  });

  it('previews an unknown platform as Instagram', () => {
    expect(resolvePreviewAspectRatio('threads', 'Reel')).toBe(4 / 5);
  });
});

describe('resolvePreviewMaxWidth', () => {
  it('widens the frame for wider media', () => {
    expect(resolvePreviewMaxWidth('instagram')).toBe(440);
    expect(resolvePreviewMaxWidth('tiktok')).toBe(440);
    expect(resolvePreviewMaxWidth('linkedin')).toBe(500);
  });
});
