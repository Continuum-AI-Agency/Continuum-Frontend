import { describe, expect, it } from 'bun:test';

import { fuzzyIncludes, fuzzyMatches, normalizeSearchText } from './fuzzy';

describe('normalizeSearchText', () => {
  it('strips case and punctuation so separators never block a match', () => {
    expect(normalizeSearchText('VIVO 47 Center')).toBe('vivo47center');
    expect(normalizeSearchText('leg-press_v2.png')).toBe('legpressv2png');
  });
});

describe('fuzzyIncludes', () => {
  it('matches a substring', () => {
    expect(fuzzyIncludes('paidoptimization', 'optim')).toBe(true);
  });

  it('matches an abbreviation as a subsequence', () => {
    expect(fuzzyIncludes('paidoptimization', 'pdopt')).toBe(true);
  });

  it('respects subsequence order', () => {
    expect(fuzzyIncludes('paidoptimization', 'optpd')).toBe(false);
  });

  it('rejects characters that are not there', () => {
    expect(fuzzyIncludes('paidoptimization', 'zzz')).toBe(false);
  });
});

describe('fuzzyMatches', () => {
  it('matches when any field hits', () => {
    expect(fuzzyMatches(['Launch canvas', 'Q3 hero shots'], 'hero')).toBe(true);
  });

  it('returns everything for an empty or punctuation-only query', () => {
    expect(fuzzyMatches(['anything'], '')).toBe(true);
    expect(fuzzyMatches(['anything'], '   ')).toBe(true);
    expect(fuzzyMatches(['anything'], '---')).toBe(true);
  });

  it('skips null and undefined fields without throwing', () => {
    expect(fuzzyMatches([null, undefined, 'Launch canvas'], 'launch')).toBe(true);
    expect(fuzzyMatches([null, undefined], 'launch')).toBe(false);
  });

  it('matches across punctuation in the source', () => {
    expect(fuzzyMatches(['VIVO 47 Center'], 'vivo47')).toBe(true);
  });
});
