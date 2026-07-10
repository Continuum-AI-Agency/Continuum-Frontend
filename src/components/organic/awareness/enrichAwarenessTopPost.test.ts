import { describe, expect, it } from 'bun:test';
import type { OrganicPost } from '@/lib/schemas/organicMetrics';
import { enrichAwarenessTopPost, type AwarenessTopPost } from './types';

const base: AwarenessTopPost = {
  id: 'p1',
  mediaProductType: 'REELS',
  hookRate: 72,
  views: 1000,
  reach: 800,
  permalink: null,
  thumbnailUrl: null,
  caption: null,
  timestamp: null,
};

const live: OrganicPost = {
  id: 'p1',
  timestamp: '2026-06-09T12:00:00.000Z',
  caption: 'Live caption from the gallery',
  permalink: 'https://instagram.com/reel/abc',
  thumbnailUrl: 'https://cdn.example.com/fresh.jpg',
  mediaProductType: 'REELS',
  metrics: { views: 1200, reach: 900 },
};

describe('enrichAwarenessTopPost', () => {
  it('returns the snapshot when no live post is available', () => {
    expect(enrichAwarenessTopPost(base, null)).toEqual(base);
    expect(enrichAwarenessTopPost(base, undefined)).toEqual(base);
  });

  it('fills missing presentation fields from the live post', () => {
    const enriched = enrichAwarenessTopPost(base, live);
    expect(enriched.caption).toBe('Live caption from the gallery');
    expect(enriched.permalink).toBe('https://instagram.com/reel/abc');
    expect(enriched.thumbnailUrl).toBe('https://cdn.example.com/fresh.jpg');
    expect(enriched.timestamp).toBe('2026-06-09T12:00:00.000Z');
  });

  it('keeps awareness snapshot fields when they are already populated', () => {
    const snapshot: AwarenessTopPost = {
      ...base,
      caption: 'Awareness caption',
      permalink: 'https://instagram.com/reel/old',
      thumbnailUrl: 'https://cdn.example.com/old.jpg',
    };
    const enriched = enrichAwarenessTopPost(snapshot, live);
    expect(enriched.caption).toBe('Awareness caption');
    expect(enriched.permalink).toBe('https://instagram.com/reel/old');
    expect(enriched.thumbnailUrl).toBe('https://cdn.example.com/old.jpg');
  });
});
