import { describe, expect, it } from 'bun:test';
import {
  canNestCollection,
  LIBRARY_COLLECTION_MAX_DEPTH,
  nextCollectionDepth,
  orderCollectionsTree,
} from './collection-nesting';

describe('collection nesting', () => {
  it('roots at depth 0 and allows five nested sub-boards', () => {
    expect(nextCollectionDepth(null)).toBe(0);
    expect(nextCollectionDepth(0)).toBe(1);
    expect(nextCollectionDepth(4)).toBe(5);
    expect(LIBRARY_COLLECTION_MAX_DEPTH).toBe(5);
    expect(canNestCollection(4)).toBe(true);
    expect(canNestCollection(5)).toBe(false);
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
