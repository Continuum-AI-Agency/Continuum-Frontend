import { describe, expect, it } from 'bun:test';
import {
  nearestSupportedFormat,
  publishFormatLabel,
  publishFormatNotice,
  unsupportedFormatMessage,
} from './publish-plan';
import { supportsFormat } from './publishing';

describe('nearestSupportedFormat', () => {
  it('keeps a format the platform publishes', () => {
    expect(nearestSupportedFormat('linkedin', 'REEL')).toBe('REEL');
    expect(nearestSupportedFormat('instagram', 'STORY')).toBe('STORY');
  });

  it('moves a Story to the closest format the platform takes: video first', () => {
    expect(nearestSupportedFormat('linkedin', 'STORY')).toBe('REEL');
    expect(nearestSupportedFormat('facebook', 'STORY')).toBe('REEL');
  });

  it('turns anything on YouTube into a Short, the only thing it publishes', () => {
    expect(nearestSupportedFormat('youtube', 'POST')).toBe('REEL');
    expect(nearestSupportedFormat('youtube', 'CAROUSEL')).toBe('REEL');
  });

  it('always answers with a format the platform supports', () => {
    for (const platform of [
      'instagram',
      'facebook',
      'linkedin',
      'tiktok',
      'youtube',
      'x',
    ] as const) {
      for (const format of ['POST', 'REEL', 'CAROUSEL', 'STORY'] as const) {
        expect(supportsFormat(platform, nearestSupportedFormat(platform, format))).toBe(true);
      }
    }
  });
});

describe('unsupportedFormatMessage', () => {
  it('names the platform, the format and every alternative', () => {
    expect(unsupportedFormatMessage('linkedin', 'STORY')).toBe(
      "LinkedIn doesn't publish Stories. Use a post, video post or multi-image post instead.",
    );
    expect(unsupportedFormatMessage('youtube', 'CAROUSEL')).toBe(
      "YouTube doesn't publish carousels. Use a Short instead.",
    );
  });

  it('calls a LinkedIn reel a video post and a LinkedIn carousel a multi-image post', () => {
    expect(publishFormatLabel('linkedin', 'REEL')).toBe('video post');
    expect(publishFormatLabel('linkedin', 'CAROUSEL')).toBe('multi-image post');
    expect(publishFormatLabel('instagram', 'REEL')).toBe('Reel');
    expect(publishFormatLabel('instagram', 'CAROUSEL')).toBe('carousel');
  });
});

describe('publishFormatNotice', () => {
  it('a LinkedIn reel and carousel publish, and the notice says as what', () => {
    expect(supportsFormat('linkedin', 'REEL')).toBe(true);
    expect(supportsFormat('linkedin', 'CAROUSEL')).toBe(true);
    expect(publishFormatNotice('linkedin', 'REEL')).toBe(
      'LinkedIn has no Reels: this one publishes as a native LinkedIn video post.',
    );
    expect(publishFormatNotice('linkedin', 'CAROUSEL')).toBe(
      'LinkedIn publishes this carousel as a multi-image post; a PDF document carousel is not supported.',
    );
  });

  it('an unsupported pair gets the actionable sentence', () => {
    expect(publishFormatNotice('linkedin', 'STORY')).toBe(
      unsupportedFormatMessage('linkedin', 'STORY'),
    );
  });

  it('says nothing about a format the platform publishes under its own name', () => {
    expect(publishFormatNotice('linkedin', 'POST')).toBeNull();
    expect(publishFormatNotice('instagram', 'REEL')).toBeNull();
    expect(publishFormatNotice('instagram', 'CAROUSEL')).toBeNull();
  });
});
