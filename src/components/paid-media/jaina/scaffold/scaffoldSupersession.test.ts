import { describe, expect, it } from 'bun:test';
import { supersedingVersionsOf } from './scaffoldSupersession';

describe('supersedingVersionsOf', () => {
  it('maps every older version of a scaffold to the newest one the thread proposed', () => {
    const superseded = supersedingVersionsOf([
      { scaffoldId: 'v1', parentScaffoldId: 'p', version: 1 },
      { scaffoldId: 'v2', parentScaffoldId: 'p', version: 2 },
      { scaffoldId: 'v3', parentScaffoldId: 'p', version: 3 },
      { scaffoldId: 'other', parentScaffoldId: 'q', version: 1 },
    ]);
    expect([...superseded]).toEqual([
      ['v1', 3],
      ['v2', 3],
    ]);
  });

  it('supersedes nothing it cannot place: no parent or no version', () => {
    expect(
      supersedingVersionsOf([
        { scaffoldId: 'seeded', parentScaffoldId: undefined, version: undefined },
        { scaffoldId: 'v1', parentScaffoldId: 'p', version: undefined },
        { scaffoldId: 'v2', parentScaffoldId: 'p', version: 2 },
      ]).size,
    ).toBe(0);
  });
});
