import { describe, expect, test } from 'bun:test';

import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import { mergePostWithFreshMedia } from './organicPostMediaRecovery';

function post(fields: Partial<OrganicPost>): OrganicPost {
  return { id: 'post-1', ...fields } as OrganicPost;
}

describe('mergePostWithFreshMedia', () => {
  test('prefers freshly fetched detail media over expired bulk URLs', () => {
    const merged = mergePostWithFreshMedia(
      post({
        mediaUrl: 'https://cdn.example/expired-image.jpg',
        thumbnailUrl: 'https://cdn.example/expired-thumbnail.jpg',
        carouselMedia: [{ mediaUrl: 'https://cdn.example/expired-slide.jpg' }],
      }),
      post({
        mediaUrl: 'https://cdn.example/fresh-image.jpg',
        thumbnailUrl: 'https://cdn.example/fresh-thumbnail.jpg',
        carouselMedia: [{ mediaUrl: 'https://cdn.example/fresh-slide.jpg' }],
      }),
    );

    expect(merged.mediaUrl).toBe('https://cdn.example/fresh-image.jpg');
    expect(merged.thumbnailUrl).toBe('https://cdn.example/fresh-thumbnail.jpg');
    expect(merged.carouselMedia?.[0]?.mediaUrl).toBe('https://cdn.example/fresh-slide.jpg');
  });

  test('falls back to bulk media when detail omits a field', () => {
    const merged = mergePostWithFreshMedia(
      post({
        mediaUrl: 'https://cdn.example/bulk-image.jpg',
        thumbnailUrl: 'https://cdn.example/bulk-thumbnail.jpg',
      }),
      post({ caption: 'Fresh metrics and copy' }),
    );

    expect(merged.caption).toBe('Fresh metrics and copy');
    expect(merged.mediaUrl).toBe('https://cdn.example/bulk-image.jpg');
    expect(merged.thumbnailUrl).toBe('https://cdn.example/bulk-thumbnail.jpg');
  });
});
