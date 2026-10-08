import { describe, expect, it } from 'bun:test';
import {
  type CustomField,
  HDR_DYNAMIC_RANGES,
  mediaSearchFiltersSchema,
} from '@continuum/contracts';
import {
  interpretedFilterChips,
  interpretParsedFilters,
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

function field(overrides: Partial<CustomField> & Pick<CustomField, 'id' | 'name' | 'type'>) {
  return {
    brandId: '00000000-0000-4000-8000-000000000001',
    options: [],
    position: 0,
    isDefault: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  } satisfies CustomField;
}

const RATING_SELECT = field({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Rating',
  type: 'single_select',
  options: [1, 2, 3, 4, 5].map((stars) => ({ id: `r${stars}`, label: '★'.repeat(stars) })),
});
const RATING_NUMBER = field({
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Score',
  type: 'rating',
  options: { max: 5 },
});

describe('interpretParsedFilters', () => {
  it('resolves a star rating onto the brand Rating select as option positions', () => {
    expect(
      interpretParsedFilters({ families: ['video'], rating: { min: 4 } }, [RATING_SELECT]),
    ).toEqual({
      families: ['video'],
      fieldRanges: [{ fieldId: RATING_SELECT.id, min: 4 }],
    });
  });

  it('prefers a rating-type field over a select named Rating', () => {
    expect(
      interpretParsedFilters({ rating: { min: 2, max: 4 } }, [RATING_SELECT, RATING_NUMBER]),
    ).toEqual({ fieldRanges: [{ fieldId: RATING_NUMBER.id, min: 2, max: 4 }] });
  });

  it('drops a rating the brand has no field for, rather than showing it as applied', () => {
    const interpreted = interpretParsedFilters({ tags: ['summer'], rating: { min: 4 } }, []);
    expect(interpreted).toEqual({ tags: ['summer'] });
    expect(interpretedFilterChips(interpreted)).toEqual([{ key: 'tags', label: 'Tagged summer' }]);
  });

  it('carries families, ranges and technical into a request the strict search schema accepts', () => {
    const parsed = {
      families: ['design' as const],
      ranges: { durationMs: { min: 30_000 }, resolution: { min: 2160 } },
      technical: { videoCodecs: ['prores'], dynamicRanges: [...HDR_DYNAMIC_RANGES] },
      rating: { min: 4 },
    };
    const request = mergeSearchFilters(
      { collectionId: 'c1', tags: ['gym'] },
      interpretParsedFilters(parsed, [RATING_SELECT]),
    );

    expect(request).toEqual({
      collectionId: 'c1',
      tags: ['gym'],
      families: ['design'],
      ranges: parsed.ranges,
      technical: parsed.technical,
      fieldRanges: [{ fieldId: RATING_SELECT.id, min: 4 }],
    });
    expect(mediaSearchFiltersSchema.safeParse(request).success).toBe(true);
  });
});

describe('structured interpreted chips', () => {
  const interpreted = interpretParsedFilters(
    {
      kind: 'video',
      families: ['video'],
      ranges: { durationMs: { min: 30_000 }, resolution: { min: 2160 } },
      technical: {
        videoCodecs: ['prores'],
        dynamicRanges: [...HDR_DYNAMIC_RANGES],
        hasAlpha: true,
      },
      rating: { min: 4 },
    },
    [RATING_SELECT],
  );

  it('shows each format group, range, codec, toggle and the rating as its own chip', () => {
    expect(interpretedFilterChips(interpreted, [RATING_SELECT])).toEqual([
      { key: 'kind', label: 'Videos' },
      { key: 'families:video', label: 'Video' },
      { key: 'ranges:durationMs', label: '≥ 30 s' },
      { key: 'ranges:resolution', label: '4K+' },
      { key: 'technical:videoCodecs:prores', label: 'ProRes' },
      { key: 'technical:dynamicRanges', label: 'HDR' },
      { key: 'technical:hasAlpha', label: 'Transparency' },
      { key: `fieldRanges:${RATING_SELECT.id}`, label: '★ 4+' },
    ]);
  });

  it('labels two-ended ranges, other units and a date window', () => {
    const chips = interpretedFilterChips({
      ranges: {
        frameRate: { min: 24 },
        bitRate: { min: 10_000_000 },
        sizeBytes: { min: 5_000_000, max: 100_000_000 },
        audioChannels: { min: 6 },
        // Local midnights: `before` is exclusive, so the window ends on Sep 30.
        createdAt: {
          after: new Date(2026, 8, 1).toISOString(),
          before: new Date(2026, 9, 1).toISOString(),
        },
      },
    });
    expect(chips.map((chip) => chip.label)).toEqual([
      '≥ 24 fps',
      '≥ 10 Mb/s',
      '5 MB–100 MB',
      '≥ 6 ch',
      'Added Sep 1 – Sep 30',
    ]);
  });

  it('removes one chip at a time and drops a group once it is empty', () => {
    const noCodec = withoutInterpretedFilter(interpreted, 'technical:videoCodecs:prores');
    expect(noCodec.technical).toEqual({ dynamicRanges: [...HDR_DYNAMIC_RANGES], hasAlpha: true });

    expect(withoutInterpretedFilter(interpreted, 'ranges:durationMs').ranges).toEqual({
      resolution: { min: 2160 },
    });

    const noFamily = withoutInterpretedFilter(interpreted, 'families:video');
    expect('families' in noFamily).toBe(false);

    const noRating = withoutInterpretedFilter(interpreted, `fieldRanges:${RATING_SELECT.id}`);
    expect('fieldRanges' in noRating).toBe(false);
    expect(noRating.kind).toBe('video');

    expect('kind' in withoutInterpretedFilter(interpreted, 'kind')).toBe(false);
  });
});
