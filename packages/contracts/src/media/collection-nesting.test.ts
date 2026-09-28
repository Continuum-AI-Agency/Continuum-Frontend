import { describe, expect, it } from 'bun:test';
import { mediaCollectionSchema } from './asset';
import {
  canNestCollection,
  LIBRARY_COLLECTION_MAX_DEPTH,
  LIBRARY_COLLECTION_MAX_LEVELS,
  nextCollectionDepth,
  orderCollectionsTree,
} from './collection-nesting';

describe('collection nesting', () => {
  it('roots at depth 0 and keeps ten levels (depth 0–9)', () => {
    expect(nextCollectionDepth(null)).toBe(0);
    expect(nextCollectionDepth(0)).toBe(1);
    expect(nextCollectionDepth(8)).toBe(9);
    expect(LIBRARY_COLLECTION_MAX_DEPTH).toBe(9);
    expect(LIBRARY_COLLECTION_MAX_LEVELS).toBe(10);
    expect(canNestCollection(8)).toBe(true);
    expect(canNestCollection(9)).toBe(false);
  });

  // The browser parses every collection it creates or lists: a schema capped below the database
  // made a 10-level folder upload stop at level 6 (it threw on the depth-6 response).
  it('parses a collection at every depth the database allows, and none deeper', () => {
    const row = (depth: number) => ({
      id: 'c',
      brandId: 'b',
      name: 'L',
      kind: 'manual',
      depth,
      createdAt: '2026-09-27T00:00:00Z',
      updatedAt: '2026-09-27T00:00:00Z',
    });
    expect(mediaCollectionSchema.safeParse(row(LIBRARY_COLLECTION_MAX_DEPTH)).success).toBe(true);
    expect(mediaCollectionSchema.safeParse(row(LIBRARY_COLLECTION_MAX_DEPTH + 1)).success).toBe(false);
  });

  it('walks children under their parent, name-sorted, with orphans at the root', () => {
    const ordered = orderCollectionsTree([
      { id: 'b', name: 'Bravo', parentId: null },
      { id: 'c', name: 'Child', parentId: 'a' },
      { id: 'a', name: 'Alpha', parentId: null },
      { id: 'orphan', name: 'Orphan', parentId: 'missing' },
    ]);
    expect(ordered.map((row) => row.id)).toEqual(['a', 'c', 'b', 'orphan']);
  });
});
