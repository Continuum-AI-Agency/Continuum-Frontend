import { describe, expect, it } from 'bun:test';

import { flattenHashtags } from './hashtags';

describe('flattenHashtags', () => {
  it('orders high then medium then low and #-prefixes each tag', () => {
    expect(flattenHashtags({ high: ['a'], medium: ['b'], low: ['c'] })).toEqual(['#a', '#b', '#c']);
  });

  it('dedupes across tiers (case-insensitive), keeping the first occurrence', () => {
    expect(flattenHashtags({ high: ['Sale'], medium: ['sale', 'new'] })).toEqual(['#Sale', '#new']);
  });

  it('strips a stored leading # before re-prefixing', () => {
    expect(flattenHashtags({ medium: ['#deal'] })).toEqual(['#deal']);
  });

  it('returns [] for undefined / empty', () => {
    expect(flattenHashtags(undefined)).toEqual([]);
    expect(flattenHashtags({})).toEqual([]);
    expect(flattenHashtags({ high: [], medium: [] })).toEqual([]);
  });

  it('ignores blank tags', () => {
    expect(flattenHashtags({ high: ['', '  ', 'real'] })).toEqual(['#real']);
  });
});
