import { describe, expect, it } from 'bun:test';
import { findReplace } from './textOps';

describe('findReplace', () => {
  it('swaps every occurrence, not just the first', () => {
    expect(
      findReplace('one fish two fish', { find: 'fish', replace: 'cat', caseSensitive: true }),
    ).toBe('one cat two cat');
  });

  it('leaves the input alone when the term is absent', () => {
    expect(findReplace('hello', { find: 'zzz', replace: 'x', caseSensitive: true })).toBe('hello');
  });

  it('honours case when caseSensitive is on', () => {
    expect(findReplace('Fish fish', { find: 'fish', replace: 'cat', caseSensitive: true })).toBe(
      'Fish cat',
    );
  });

  it('matches either case when caseSensitive is off', () => {
    expect(
      findReplace('Fish fish FISH', { find: 'fish', replace: 'cat', caseSensitive: false }),
    ).toBe('cat cat cat');
  });

  it('treats regex metacharacters in the search term literally', () => {
    expect(findReplace('abc a.c', { find: 'a.c', replace: 'X', caseSensitive: true })).toBe(
      'abc X',
    );
    expect(findReplace('abc a.c', { find: 'a.c', replace: 'X', caseSensitive: false })).toBe(
      'abc X',
    );
    expect(findReplace('cost is $5', { find: '$5', replace: '$6', caseSensitive: false })).toBe(
      'cost is $6',
    );
    expect(findReplace('a+b', { find: 'a+', replace: '', caseSensitive: false })).toBe('b');
  });

  it('is a no-op for an empty search term rather than exploding the string', () => {
    expect(findReplace('abc', { find: '', replace: '-', caseSensitive: true })).toBe('abc');
    expect(findReplace('abc', { find: '', replace: '-', caseSensitive: false })).toBe('abc');
  });

  it('inserts $-patterns in the replacement literally', () => {
    // String.replace would expand these into the matched text / capture groups.
    expect(findReplace('hello', { find: 'hello', replace: '$&', caseSensitive: true })).toBe('$&');
    expect(findReplace('hello', { find: 'hello', replace: '$&', caseSensitive: false })).toBe('$&');
    expect(findReplace('hello', { find: 'hello', replace: '$1 $`', caseSensitive: false })).toBe(
      '$1 $`',
    );
  });

  it('handles a multi-line body without special-casing newlines', () => {
    expect(findReplace('a\nb\na', { find: 'a', replace: 'z', caseSensitive: true })).toBe(
      'z\nb\nz',
    );
  });
});
