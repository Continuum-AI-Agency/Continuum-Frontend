import { describe, expect, test } from 'bun:test';
import { libraryBrowseQuerySchema } from '@continuum/contracts';
import {
  decodeLibraryBrowseCursor,
  encodeLibraryBrowseCursor,
  libraryBrowseAssetsArgs,
  libraryBrowseFacetArgs,
} from './browse-args';

const brandId = '11111111-1111-4111-8111-111111111111';
const collectionId = '22222222-2222-4222-8222-222222222222';
const fieldId = '33333333-3333-4333-8333-333333333333';

describe('libraryBrowseAssetsArgs', () => {
  test('a default browse sends no filter and newest first', () => {
    const args = libraryBrowseAssetsArgs(libraryBrowseQuerySchema.parse({ brandId }), null);
    expect(args.p_query).toEqual({ performanceWindow: 'd30' });
    expect(args.p_sorts).toEqual([{ key: 'created', dir: 'desc' }]);
    expect(args.p_limit).toBe(48);
  });

  test('every filter rides p_query by its contract name, empties dropped', () => {
    const query = libraryBrowseQuerySchema.parse({
      brandId,
      collectionId,
      destination: 'home',
      aspectRatios: ['9:16'],
      families: ['video', 'design'],
      ranges: { durationMs: { min: 30_001 }, resolution: { min: 2160 } },
      technical: { videoCodecs: ['prores'] },
      reviewStateIds: [fieldId],
      fieldRanges: [{ fieldId, min: 4 }],
      used: false,
      tags: [],
    });
    expect(libraryBrowseFacetArgs(query).p_query).toEqual({
      collectionId,
      destination: 'home',
      aspectRatios: ['9:16'],
      families: ['video', 'design'],
      ranges: { durationMs: { min: 30_001 }, resolution: { min: 2160 } },
      technical: { videoCodecs: ['prores'] },
      reviewStateIds: [fieldId],
      fieldRanges: [{ fieldId, min: 4 }],
      used: false,
      performanceWindow: 'd30',
    });
  });

  test('sort then thenBy become ordered keys, a field sort names its field', () => {
    const query = libraryBrowseQuerySchema.parse({
      brandId,
      sort: 'field_desc',
      sortFieldId: fieldId,
      thenBy: [
        { key: 'size', dir: 'asc' },
        { key: `field:${fieldId}`, dir: 'asc' },
      ],
    });
    expect(libraryBrowseAssetsArgs(query, null).p_sorts).toEqual([
      { key: `field:${fieldId}`, dir: 'desc' },
      { key: 'size', dir: 'asc' },
    ]);
    expect(
      libraryBrowseAssetsArgs(libraryBrowseQuerySchema.parse({ brandId, sort: 'most_used' }), null)
        .p_sorts,
    ).toEqual([{ key: 'usage', dir: 'desc' }]);
  });
});

describe('browse cursor', () => {
  test('round-trips its keys and id', () => {
    const cursor = { keys: ['2026-09-27T10:00:00.123456+00:00', null, 29.97], id: collectionId };
    expect(decodeLibraryBrowseCursor(encodeLibraryBrowseCursor(cursor))).toEqual(cursor);
  });

  test('a pre-keyset cursor restarts rather than misreading, garbage is refused', () => {
    const legacy = Buffer.from(JSON.stringify({ id: collectionId, time: 'x' })).toString(
      'base64url',
    );
    expect(decodeLibraryBrowseCursor(legacy)).toBeNull();
    expect(() => decodeLibraryBrowseCursor('%%%')).toThrow('Invalid Library cursor');
  });
});
