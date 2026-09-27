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
