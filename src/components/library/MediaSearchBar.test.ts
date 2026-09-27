import { describe, expect, it } from 'bun:test';
import {
  interpretedFilterChips,
  looksLikeNaturalLanguageQuery,
  mergeSearchFilters,
  readSearchStrategy,
  withoutInterpretedFilter,
} from './MediaSearchBar';

// `strategy` rides alongside the strict mediaSearchResponseSchema, so the bar has
// to read it without assuming it is there (older deploys, similar-mode responses).
describe('readSearchStrategy', () => {
  it('reads a semantic strategy', () => {
    expect(readSearchStrategy({ mode: 'text', items: [], strategy: 'semantic' })).toBe('semantic');
  });

  it('reads a lexical strategy', () => {
    expect(readSearchStrategy({ mode: 'text', items: [], strategy: 'lexical' })).toBe('lexical');
  });

  it('reads a filters-only strategy', () => {
    expect(readSearchStrategy({ mode: 'text', items: [], strategy: 'filters' })).toBe('filters');
  });

  it('returns null when the field is absent, unknown, or the payload is not an object', () => {
    expect(readSearchStrategy({ mode: 'text', items: [] })).toBeNull();
    expect(readSearchStrategy({ strategy: 'vibes' })).toBeNull();
    expect(readSearchStrategy(null)).toBeNull();
    expect(readSearchStrategy('lexical')).toBeNull();
  });
});

describe('looksLikeNaturalLanguageQuery', () => {
  it('sends sentences and filter words to the interpreter', () => {
    expect(looksLikeNaturalLanguageQuery('videos from last week tagged summer')).toBe(true);
    expect(looksLikeNaturalLanguageQuery('beach at golden hour')).toBe(true);
    expect(looksLikeNaturalLanguageQuery('summer videos')).toBe(true);
    expect(looksLikeNaturalLanguageQuery('approved')).toBe(true);
  });

  it('keeps plain keyword searches on the keyword path', () => {
    expect(looksLikeNaturalLanguageQuery('summer')).toBe(false);
    expect(looksLikeNaturalLanguageQuery('olive oil')).toBe(false);
    expect(looksLikeNaturalLanguageQuery('   ')).toBe(false);
  });
});

describe('interpreted filters', () => {
  const parsed = {
    kind: 'video' as const,
    tags: ['summer'],
    createdAfter: '2026-09-20T15:30:00.000Z',
    createdBefore: '2026-09-27T15:30:00.000Z',
  };

  it('narrows the chips already on, unioning tags', () => {
    expect(mergeSearchFilters({ tags: ['gym'], collectionId: 'c1' }, parsed)).toEqual({
      collectionId: 'c1',
      kind: 'video',
      tags: ['gym', 'summer'],
      createdAfter: parsed.createdAfter,
      createdBefore: parsed.createdBefore,
    });
  });

  it('shows one removable chip per interpreted filter', () => {
    expect(interpretedFilterChips(parsed)).toEqual([
      { key: 'kind', label: 'Videos' },
      { key: 'tags', label: 'Tagged summer' },
      { key: 'created', label: 'Sep 20 – Sep 27' },
    ]);
    expect(interpretedFilterChips({ reviewStatus: 'in_review' })).toEqual([
      { key: 'reviewStatus', label: 'In review' },
    ]);
  });

  it('drops a chip, and the date chip drops both bounds', () => {
    expect(withoutInterpretedFilter(parsed, 'created')).toEqual({
      kind: 'video',
      tags: ['summer'],
    });
    expect(withoutInterpretedFilter(parsed, 'kind')).toEqual({
      tags: ['summer'],
      createdAfter: parsed.createdAfter,
      createdBefore: parsed.createdBefore,
    });
  });
});
