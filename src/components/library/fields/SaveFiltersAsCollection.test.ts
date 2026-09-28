import { describe, expect, it } from 'bun:test';
import { extraSmartQueryFilters, type SavableFilters } from './SaveFiltersAsCollection';

const BASE: SavableFilters = {
  createdWith: [],
  tags: [],
  reviewStatuses: [],
  fieldFilters: [],
};

describe('extraSmartQueryFilters', () => {
  it('carries every format, range and technical filter that holds something', () => {
    const extra = extraSmartQueryFilters({
      ...BASE,
      families: ['video'],
      ranges: { frameRate: { min: 29 } },
      technical: { hasLocation: true },
      fieldRanges: [{ fieldId: '7c2cc78f-6d3b-4d10-8e37-4fa03fabab21', min: 4 }],
      reviewStateIds: ['0b5c0f3e-3b1e-4b8e-9f2a-8e2f6c1d9a10'],
    });
    expect(Object.keys(extra).sort()).toEqual([
      'families',
      'fieldRanges',
      'ranges',
      'reviewStateIds',
      'technical',
    ]);
    expect(extra.technical).toEqual({ hasLocation: true });
  });

  it('leaves out empty lists and objects whose every key is unset', () => {
    expect(
      extraSmartQueryFilters({
        ...BASE,
        families: [],
        ranges: { frameRate: undefined },
        technical: {},
        fieldRanges: [],
      }),
    ).toEqual({});
  });
});
