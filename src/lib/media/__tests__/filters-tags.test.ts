import { describe, expect, it } from 'bun:test';
import { CAROUSEL_SLIDE_TAG, HIDDEN_LIBRARY_TAGS } from '@continuum/contracts';
import {
  aggregateTagCounts,
  buildLibraryQuery,
  kindMatchOrFilter,
  paginateByMembership,
  parseTagsParam,
  toSearchRpcFilters,
} from '../filters';

describe('buildLibraryQuery tags param', () => {
  it('joins tags comma-separated', () => {
    const sp = buildLibraryQuery({ brandId: 'b', tags: ['sunset', 'ocean'] });
    expect(sp.get('tags')).toBe('sunset,ocean');
  });

  it('omits empty or null tags', () => {
    expect(buildLibraryQuery({ brandId: 'b', tags: [] }).has('tags')).toBe(false);
    expect(buildLibraryQuery({ brandId: 'b', tags: null }).has('tags')).toBe(false);
    expect(buildLibraryQuery({ brandId: 'b' }).has('tags')).toBe(false);
  });
});

describe('parseTagsParam', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseTagsParam(' sunset , ocean ,, ')).toEqual(['sunset', 'ocean']);
  });

  it('dedupes repeated tags', () => {
    expect(parseTagsParam('a,b,a')).toEqual(['a', 'b']);
  });

  it('returns [] for null/undefined/empty', () => {
    expect(parseTagsParam(null)).toEqual([]);
    expect(parseTagsParam(undefined)).toEqual([]);
    expect(parseTagsParam('')).toEqual([]);
  });

  it('round-trips buildLibraryQuery output', () => {
    const sp = buildLibraryQuery({ brandId: 'b', tags: ['a', 'b'] });
    expect(parseTagsParam(sp.get('tags'))).toEqual(['a', 'b']);
  });
});

describe('kindMatchOrFilter', () => {
  it('matches row kind OR a cover slide of that kind (PostgREST escaped)', () => {
    expect(kindMatchOrFilter('video')).toBe(
      'kind.eq.video,origin_ref->slides.cs."[{\\"kind\\":\\"video\\"}]"',
    );
  });

  it('builds the image variant symmetrically', () => {
    expect(kindMatchOrFilter('image')).toBe(
      'kind.eq.image,origin_ref->slides.cs."[{\\"kind\\":\\"image\\"}]"',
    );
  });
});

describe('toSearchRpcFilters', () => {
  it('defaults every filter to null with only the slide exclusion set', () => {
    expect(toSearchRpcFilters(undefined)).toEqual({
      filter_source: null,
      filter_kind: null,
      filter_tags: null,
      filter_exclude_tags: [...HIDDEN_LIBRARY_TAGS],
      filter_collection_id: null,
      filter_review_status: null,
      filter_asset_ids: null,
      filter_exclude_asset_ids: null,
    });
  });

  it('maps every provided filter to its RPC named arg', () => {
    expect(
      toSearchRpcFilters({
        source: 'upload',
        kind: 'video',
        tags: ['sunset'],
        collectionId: 'col-1',
        reviewStatus: 'approved',
      }),
    ).toEqual({
      filter_source: 'upload',
      filter_kind: 'video',
      filter_tags: ['sunset'],
      filter_exclude_tags: [...HIDDEN_LIBRARY_TAGS],
      filter_collection_id: 'col-1',
      filter_review_status: 'approved',
      filter_asset_ids: null,
      filter_exclude_asset_ids: null,
    });
  });

  it('nulls an empty tags array', () => {
    expect(toSearchRpcFilters({ tags: [] }).filter_tags).toBeNull();
  });

  it('always excludes carousel slides so slide rows never rank', () => {
    expect(toSearchRpcFilters({ kind: 'image' }).filter_exclude_tags).toEqual([...HIDDEN_LIBRARY_TAGS]);
  });
});

describe('aggregateTagCounts', () => {
  it('counts distinct unnested tags across rows', () => {
    const result = aggregateTagCounts([
      { tags: ['sunset', 'ocean'] },
      { tags: ['sunset'] },
      { tags: null },
    ]);
    expect(result).toEqual([
      { tag: 'sunset', count: 2 },
      { tag: 'ocean', count: 1 },
    ]);
  });

  it('excludes the carousel-slide system tag', () => {
    const result = aggregateTagCounts([{ tags: [CAROUSEL_SLIDE_TAG, 'sunset'] }]);
    expect(result).toEqual([{ tag: 'sunset', count: 1 }]);
  });

  it('breaks count ties alphabetically', () => {
    const result = aggregateTagCounts([{ tags: ['zebra', 'apple'] }]);
    expect(result.map((r) => r.tag)).toEqual(['apple', 'zebra']);
  });

  it('caps the vocabulary by count', () => {
    const rows = [{ tags: ['a', 'b', 'c'] }, { tags: ['a', 'b'] }, { tags: ['a'] }];
    const result = aggregateTagCounts(rows, 2);
    expect(result).toEqual([
      { tag: 'a', count: 3 },
      { tag: 'b', count: 2 },
    ]);
  });
});

describe('paginateByMembership', () => {
  const rows = [{ id: 'c' }, { id: 'a' }, { id: 'x' }, { id: 'b' }];
  const orderedIds = ['a', 'b', 'c', 'd'];

  it('orders rows by membership position and drops non-members', () => {
    const { page } = paginateByMembership(rows, orderedIds, 0, 10);
    expect(page.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('slices by offset/limit over the filtered ordered list', () => {
    const { page, nextOffset } = paginateByMembership(rows, orderedIds, 1, 1);
    expect(page.map((r) => r.id)).toEqual(['b']);
    expect(nextOffset).toBe(2);
  });

  it('returns null nextOffset on the last page', () => {
    const { page, nextOffset } = paginateByMembership(rows, orderedIds, 2, 2);
    expect(page.map((r) => r.id)).toEqual(['c']);
    expect(nextOffset).toBeNull();
  });

  it('keeps offset math stable when members are filtered out (excluded rows)', () => {
    // Member 'b' was filtered before pagination (e.g. carousel slide): offsets
    // index the filtered list, so page 2 continues seamlessly after page 1.
    const filteredRows = [{ id: 'c' }, { id: 'a' }];
    const first = paginateByMembership(filteredRows, orderedIds, 0, 1);
    expect(first.page.map((r) => r.id)).toEqual(['a']);
    expect(first.nextOffset).toBe(1);
    const second = paginateByMembership(filteredRows, orderedIds, 1, 1);
    expect(second.page.map((r) => r.id)).toEqual(['c']);
    expect(second.nextOffset).toBeNull();
  });
});
