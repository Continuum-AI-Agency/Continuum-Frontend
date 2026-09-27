import { describe, expect, it } from 'bun:test';
import { collectionTrail } from './collectionTrail';

const tree = [
  { id: 'root', name: 'Campaigns', parentId: null },
  { id: 'mid', name: 'Spring', parentId: 'root' },
  { id: 'leaf', name: 'Hero cuts', parentId: 'mid' },
];

describe('collectionTrail', () => {
  it('lists ancestors root-first, ending with the collection', () => {
    expect(collectionTrail(tree, 'leaf').map((c) => c.name)).toEqual([
      'Campaigns',
      'Spring',
      'Hero cuts',
    ]);
  });

  it('is just the collection for a root board', () => {
    expect(collectionTrail(tree, 'root')).toEqual([{ id: 'root', name: 'Campaigns' }]);
  });

  it('stops at a parent the list does not hold', () => {
    const orphan = [{ id: 'a', name: 'A', parentId: 'gone' }];
    expect(collectionTrail(orphan, 'a')).toEqual([{ id: 'a', name: 'A' }]);
  });

  it('terminates on a cycle instead of looping', () => {
    const cycle = [
      { id: 'a', name: 'A', parentId: 'b' },
      { id: 'b', name: 'B', parentId: 'a' },
    ];
    expect(collectionTrail(cycle, 'a').map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('is empty for an unknown collection', () => {
    expect(collectionTrail(tree, 'nope')).toEqual([]);
  });
});
