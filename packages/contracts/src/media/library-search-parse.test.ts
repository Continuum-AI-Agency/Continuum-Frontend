import { describe, expect, it } from 'bun:test';

import {
  librarySearchParseRequestSchema,
  librarySearchParseResponseSchema,
} from './library-search-parse';

const BRAND_ID = '00000000-0000-4000-8000-0000000000b2';

describe('librarySearchParse contracts', () => {
  it('accepts a query with an optional pinned now', () => {
    const parsed = librarySearchParseRequestSchema.safeParse({
      brandId: BRAND_ID,
      query: 'videos from last week tagged summer',
      now: '2026-09-27T12:00:00.000Z',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a blank or oversized query', () => {
    expect(
      librarySearchParseRequestSchema.safeParse({ brandId: BRAND_ID, query: '  ' }).success,
    ).toBe(false);
    expect(
      librarySearchParseRequestSchema.safeParse({ brandId: BRAND_ID, query: 'x'.repeat(501) })
        .success,
    ).toBe(false);
  });

  it('round-trips an interpreted response with an empty residual query', () => {
    const parsed = librarySearchParseResponseSchema.safeParse({
      query: '',
      filters: {
        kind: 'video',
        tags: ['summer'],
        createdAfter: '2026-09-20T12:00:00.000Z',
        createdBefore: '2026-09-27T12:00:00.000Z',
      },
      interpreted: true,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a filter key the search route does not understand', () => {
    const parsed = librarySearchParseResponseSchema.safeParse({
      query: '',
      filters: { mood: 'happy' },
      interpreted: true,
    });
    expect(parsed.success).toBe(false);
  });
});

describe('visualEmbedding on the parse response', () => {
  const base = { query: 'beach', filters: {}, interpreted: true };

  it('is optional (an older Backend) and nullable (Vertex down)', () => {
    expect(librarySearchParseResponseSchema.safeParse(base).success).toBe(true);
    expect(
      librarySearchParseResponseSchema.safeParse({ ...base, visualEmbedding: null }).success,
    ).toBe(true);
  });

  it('must be a full 1408-wide vector when present', () => {
    expect(
      librarySearchParseResponseSchema.safeParse({
        ...base,
        visualEmbedding: Array.from({ length: 1408 }, () => 0),
      }).success,
    ).toBe(true);
    expect(
      librarySearchParseResponseSchema.safeParse({ ...base, visualEmbedding: [0.1] }).success,
    ).toBe(false);
  });
});

describe('format, technical and rating filters on the parse response', () => {
  const respond = (filters: Record<string, unknown>) =>
    librarySearchParseResponseSchema.safeParse({ query: '', filters, interpreted: true });

  it('accepts "4K ProRes over 30 s", HDR, 5.1 and "rated 4+"', () => {
    expect(
      respond({
        kind: 'video',
        families: ['video'],
        ranges: {
          resolution: { min: 2160 },
          durationMs: { min: 30_001 },
          audioChannels: { min: 6, max: 6 },
        },
        technical: {
          videoCodecs: ['prores'],
          dynamicRanges: ['hdr10', 'hlg', 'dolby_vision', 'hdr10plus'],
          hasAlpha: true,
        },
        rating: { min: 4 },
      }).success,
    ).toBe(true);
  });

  it('rejects a family, range or rating outside the contract', () => {
    expect(respond({ families: ['pdf'] }).success).toBe(false);
    expect(respond({ ranges: { resolution: { min: '4k' } } }).success).toBe(false);
    expect(respond({ ranges: { durationMs: { min: 120_001, max: 9_999 } } }).success).toBe(false);
    expect(respond({ ranges: { fps: { min: 60 } } }).success).toBe(false);
    expect(respond({ technical: { dynamicRanges: ['hdr'] } }).success).toBe(false);
    expect(respond({ rating: { min: 11 } }).success).toBe(false);
  });
});
