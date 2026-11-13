import { describe, expect, it } from 'bun:test';
import {
  nearestSupportedFormat,
  publishFormatLabel,
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
      "LinkedIn doesn't publish Stories. Use a post, video post or carousel instead.",
    );
    expect(unsupportedFormatMessage('youtube', 'CAROUSEL')).toBe(
      "YouTube doesn't publish carousels. Use a Short instead.",
    );
  });

  it('calls a LinkedIn reel a video post', () => {
    expect(publishFormatLabel('linkedin', 'REEL')).toBe('video post');
    expect(publishFormatLabel('instagram', 'REEL')).toBe('Reel');
  });
});
