import { describe, expect, it } from 'bun:test';

import { IMAGE_EMBEDDING_DIM, mediaSearchFiltersSchema, mediaSearchRequestSchema } from './search';

describe('mediaSearchFiltersSchema', () => {
  it('accepts workflow and custom-field filters used by Library search', () => {
    const parsed = mediaSearchFiltersSchema.safeParse({
      reviewStatus: 'in_review',
      fieldFilters: [
        {
          fieldId: '11111111-1111-4111-8111-111111111111',
          operator: 'is_empty',
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a source filter', () => {
    const parsed = mediaSearchFiltersSchema.safeParse({ source: 'ai_generated' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.source).toBe('ai_generated');
  });

  it('accepts source + kind together', () => {
    const parsed = mediaSearchFiltersSchema.safeParse({ source: 'upload', kind: 'video' });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown source value', () => {
    const parsed = mediaSearchFiltersSchema.safeParse({ source: 'scraped' });
    expect(parsed.success).toBe(false);
  });

  it('allows empty filters', () => {
    expect(mediaSearchFiltersSchema.safeParse({}).success).toBe(true);
  });
});

describe('mediaSearchRequestSchema with source filter', () => {
  it('threads source through a text search request', () => {
    const parsed = mediaSearchRequestSchema.safeParse({
      brandId: 'brand-1',
      mode: 'text',
      query: 'sunset',
      filters: { source: 'ai_generated', kind: 'image' },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.filters?.source).toBe('ai_generated');
      expect(parsed.data.filters?.kind).toBe('image');
    }
  });
});

describe('filters-only text search', () => {
  const created = {
    createdAfter: '2026-09-20T00:00:00.000Z',
    createdBefore: '2026-09-27T00:00:00.000Z',
  };

  it('accepts a date range on the filters', () => {
    expect(mediaSearchFiltersSchema.safeParse(created).success).toBe(true);
    expect(mediaSearchFiltersSchema.safeParse({ createdAfter: 'last week' }).success).toBe(false);
  });

  it('allows an empty query when at least one filter is set', () => {
    const parsed = mediaSearchRequestSchema.safeParse({
      brandId: 'brand-1',
      mode: 'text',
      filters: { kind: 'video', ...created },
    });
    expect(parsed.success).toBe(true);
  });

  it('still rejects a text search with neither a query nor a filter', () => {
    expect(mediaSearchRequestSchema.safeParse({ brandId: 'brand-1', mode: 'text' }).success).toBe(
      false,
    );
    expect(
      mediaSearchRequestSchema.safeParse({
        brandId: 'brand-1',
        mode: 'text',
        filters: { tags: [] },
      }).success,
    ).toBe(false);
  });
});

describe('visual query embedding', () => {
  it('accepts exactly one image-space vector on a text search', () => {
    const request = { brandId: 'brand-1', mode: 'text', query: 'red sneakers' };
    const ok = mediaSearchRequestSchema.safeParse({
      ...request,
      visualEmbedding: Array.from({ length: IMAGE_EMBEDDING_DIM }, () => 0.01),
    });
    expect(ok.success).toBe(true);
    const wrongWidth = mediaSearchRequestSchema.safeParse({
      ...request,
      visualEmbedding: Array.from({ length: 1536 }, () => 0.01),
    });
    expect(wrongWidth.success).toBe(false);
  });
});
