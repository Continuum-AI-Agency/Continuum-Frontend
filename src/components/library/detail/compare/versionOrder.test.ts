import { describe, expect, it } from 'bun:test';
import { reorderedVersionIds } from './versionOrder';

// Newest first, the way the versions API lists them.
const versions = [
  { id: 'v3', versionNumber: 3 },
  { id: 'v2', versionNumber: 2 },
  { id: 'v1', versionNumber: 1 },
];

describe('reorderedVersionIds', () => {
  it('moves a version up toward the head, listing every id oldest first', () => {
    expect(reorderedVersionIds(versions, 'v2', 'up')).toEqual(['v1', 'v3', 'v2']);
  });

  it('moves a version down toward the oldest', () => {
    expect(reorderedVersionIds(versions, 'v2', 'down')).toEqual(['v2', 'v1', 'v3']);
  });

  it('refuses a move off either end or of an unknown id', () => {
    expect(reorderedVersionIds(versions, 'v3', 'up')).toBeNull();
    expect(reorderedVersionIds(versions, 'v1', 'down')).toBeNull();
    expect(reorderedVersionIds(versions, 'nope', 'up')).toBeNull();
  });
});
