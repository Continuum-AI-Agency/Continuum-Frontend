import { describe, expect, it } from 'bun:test';
import { readSearchStrategy } from './MediaSearchBar';

// `strategy` rides alongside the strict mediaSearchResponseSchema, so the bar has
// to read it without assuming it is there (older deploys, similar-mode responses).
describe('readSearchStrategy', () => {
  it('reads a semantic strategy', () => {
    expect(readSearchStrategy({ mode: 'text', items: [], strategy: 'semantic' })).toBe('semantic');
  });

  it('reads a lexical strategy', () => {
    expect(readSearchStrategy({ mode: 'text', items: [], strategy: 'lexical' })).toBe('lexical');
  });

  it('returns null when the field is absent, unknown, or the payload is not an object', () => {
    expect(readSearchStrategy({ mode: 'text', items: [] })).toBeNull();
    expect(readSearchStrategy({ strategy: 'vibes' })).toBeNull();
    expect(readSearchStrategy(null)).toBeNull();
    expect(readSearchStrategy('lexical')).toBeNull();
  });
});
